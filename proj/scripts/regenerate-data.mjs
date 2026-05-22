#!/usr/bin/env node
/**
 * Regenerate proj/src/data/workerData.js from DB/*.xlsx (latest data).
 *
 *   - DB/근로자사고DB.xlsx          → 사고 데이터 (사고경위서DB_'26.0514 시트)
 *   - DB/매장현황_24년-26년.xlsx     → 매장 데이터 (가장 최신 시트)
 *   - DB/현장사원 인원현황_24년-26년.xlsx → 근로자 데이터 (가장 최신 시트)
 *
 * processed/*.csv는 절대 건드리지 않습니다 (가드레일).
 *
 * Usage:
 *   cd proj && node scripts/regenerate-data.mjs
 */
import * as XLSX from 'xlsx';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import { processAccidents } from '../src/utils/processAccidents.js';
import { processStores } from '../src/utils/processStores.js';
import { processWorkers } from '../src/utils/processData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const DB = resolve(ROOT, 'DB');
const OUT_WORKER = resolve(__dirname, '..', 'src', 'data', 'workerData.js');

const ACCIDENT_XLSX = resolve(DB, '근로자사고DB.xlsx');
const STORE_XLSX = resolve(DB, '매장현황_24년-26년.xlsx');
const WORKER_XLSX = resolve(DB, '현장사원 인원현황_24년-26년.xlsx');

function readWb(path) {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
}

function readSheet(path, sheetName) {
  const wb = readWb(path);
  const sheet = sheetName ? wb.Sheets[sheetName] : wb.Sheets[wb.SheetNames[0]];
  if (!sheet) throw new Error(`Sheet "${sheetName}" not found in ${path}. Available: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function latestSheet(path) {
  const wb = readWb(path);
  const sheets = wb.SheetNames.filter(n => /^\d/.test(n)).sort();
  return sheets[sheets.length - 1] ?? wb.SheetNames[0];
}

console.log('1. Reading accidents from:', ACCIDENT_XLSX);
const accBook = readWb(ACCIDENT_XLSX);
const accSheetName = accBook.SheetNames.find(n => n.includes('사고경위서'))
  ?? accBook.SheetNames[0];
console.log(`   sheet: "${accSheetName}"`);
const accRowsRaw = XLSX.utils.sheet_to_json(accBook.Sheets[accSheetName], { defval: null });
// 헤더 보정: 엑셀 5번 컬럼의 헤더가 "팀명" 대신 숫자 8로 깨져 있어 그 키를 "팀명"으로 rename
let renamedTeams = 0;
const accRows = accRowsRaw.map(r => {
  const wrongKeys = Object.keys(r).filter(k => k === '8' || k === 8);
  for (const wk of wrongKeys) {
    if (r[wk] != null && r['팀명'] == null) {
      r['팀명'] = r[wk];
      renamedTeams++;
    }
    delete r[wk];
  }
  return r;
});
console.log(`   rows: ${accRows.length} (헤더 보정: '8' → '팀명' ${renamedTeams}건)`);

console.log('\n2. Reading stores from:', STORE_XLSX);
const storeSheet = latestSheet(STORE_XLSX);
console.log(`   sheet (latest): "${storeSheet}"`);
const storeRows = readSheet(STORE_XLSX, storeSheet);
console.log(`   rows: ${storeRows.length}`);

console.log('\n3. Reading workers from:', WORKER_XLSX);
const workerSheet = latestSheet(WORKER_XLSX);
console.log(`   sheet (latest): "${workerSheet}"`);
const workerRows = readSheet(WORKER_XLSX, workerSheet);
console.log(`   rows: ${workerRows.length}`);

// snapshot ref date from sheet name (e.g. "26.05.19" → 2026-05-19)
const refMatch = /^(\d{2})\.(\d{2})\.(\d{2})/.exec(workerSheet);
const refDate = refMatch
  ? new Date(`20${refMatch[1]}-${refMatch[2]}-${refMatch[3]}`)
  : null;
if (refDate) console.log(`   workers ref date: ${refDate.toISOString().slice(0, 10)}`);

console.log('\n4. Processing...');
const storesProcessed = processStores(storeRows);
console.log(`   stores processed: ${storesProcessed.length}`);

const workersProcessed = processWorkers(workerRows, refDate);
console.log(`   workers processed: kpis.total = ${workersProcessed?.kpis?.total}`);

const data = processAccidents(accRows, storesProcessed, workersProcessed);
console.log(`   data keys (${Object.keys(data).length}): ${Object.keys(data).slice(0, 8).join(', ')} ...`);
console.log(`   accidents total = ${data.kpis?.total}, monthly entries = ${data.monthly?.length}`);

const monthly = data.monthly ?? [];
if (monthly.length > 0) {
  const last = monthly[monthly.length - 1];
  const first = monthly[0];
  console.log(`   monthly range: ${first.ym} ~ ${last.ym}`);
}

console.log('\n5. Writing workerData.js ...');
const out = `const DEFAULT_DATA = ${JSON.stringify(data)};\n// === DAISO BRAND LOGO ===\nexport default DEFAULT_DATA;\n`;
writeFileSync(OUT_WORKER, out, 'utf-8');
console.log(`   wrote ${OUT_WORKER} (${(out.length / 1024).toFixed(1)} KB)`);

console.log('\n✓ Done.');

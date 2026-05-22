#!/usr/bin/env node
/**
 * Build monthly snapshots from DB Excel master sheets (3-sheet union).
 *
 *  - DB/매장현황_24년-26년.xlsx     → 매장코드 기준 union, 오픈일/시트 등장 이력으로 시점별 영업 매장 추적
 *  - DB/현장사원 인원현황_24년-26년.xlsx → 사번 기준 union, 입사일·퇴직일자·시트 등장 이력으로 시점별 재직 추적
 *
 * 매장 필터: 형태 ∈ {가맹점, 기타출고} 제외, 폐점여부=Y 제외, 오픈일 없음/미래 제외
 * 근로자 필터: 부문 ∈ {수도권영업부문, 지방영업부문}, 사원유형=현장사원 (물류사원 제외)
 *
 * Output: proj/src/data/snapshots.js (STORE_SNAPSHOTS, WORKER_SNAPSHOTS)
 *
 * Run: cd proj && node scripts/extract-snapshots.mjs   (또는 npm run data)
 */
import * as XLSX from 'xlsx';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..', '..');
const STORE_XLSX = resolve(ROOT, 'DB', '매장현황_24년-26년.xlsx');
const WORKER_XLSX = resolve(ROOT, 'DB', '현장사원 인원현황_24년-26년.xlsx');
const OUT = resolve(__dirname, '..', 'src', 'data', 'snapshots.js');

// 시트 → 대표 시점
const SHEET_YMS = ['2024-05', '2025-05', '2026-05'];
const SHEET_NAMES = ['24.05.19', '25.05.19', '26.05.19'];

const EXCLUDED_FORMS = new Set(['가맹점', '기타출고']);
const EMP_INCLUDE = new Set(['현장사원']);
const BUMUN_INCLUDE = new Set(['수도권영업부문', '지방영업부문']);

// 집계 대상 ym (workerData.monthly와 정렬)
const YM_RANGE = [];
for (const y of [2024, 2025, 2026]) {
  for (let m = 1; m <= 12; m++) {
    if (y === 2026 && m > 5) continue;
    YM_RANGE.push(`${y}-${String(m).padStart(2, '0')}`);
  }
}

// ── helpers ────────────────────────────────────────────────
function readWb(path) {
  if (!existsSync(path)) throw new Error(`File not found: ${path}`);
  return XLSX.read(readFileSync(path), { type: 'buffer', cellDates: true });
}

function rowsOf(wb, sheetName) {
  const sheet = wb.Sheets[sheetName];
  if (!sheet) throw new Error(`Sheet "${sheetName}" missing. Available: ${wb.SheetNames.join(', ')}`);
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function toDate(v) {
  if (v == null || v === '') return null;
  if (v instanceof Date) return v;
  if (typeof v === 'number') {
    // Excel serial date
    return new Date(Date.UTC(1899, 11, 30) + v * 86400000);
  }
  const s = String(v).trim().split(' ')[0];
  if (!s) return null;
  // 'YYYY-MM-DD', 'YYYY.MM.DD', 'YYYY/MM/DD', 'YYYYMMDD'
  let m = s.match(/^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/);
  if (!m) m = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (!m) return null;
  const d = new Date(Date.UTC(parseInt(m[1]), parseInt(m[2]) - 1, parseInt(m[3])));
  return isNaN(d.getTime()) ? null : d;
}

function monthEnd(ym) {
  const [y, m] = ym.split('-').map(Number);
  // m이 12면 다음해 1월 1일 - 1ms = 12월 31일
  // 이외엔 (m+1)월 1일 - 1ms
  if (m === 12) return new Date(Date.UTC(y, 11, 31, 23, 59, 59));
  return new Date(Date.UTC(y, m, 0, 23, 59, 59));
}

function endAfterLastSheet(presentYms) {
  // 마지막 등장 시트의 ym 다음 시트 ym (없으면 null = 무한)
  let last = null;
  for (const y of presentYms) {
    if (last === null || y > last) last = y;
  }
  const idx = SHEET_YMS.indexOf(last);
  return idx >= 0 && idx + 1 < SHEET_YMS.length ? SHEET_YMS[idx + 1] : null;
}

const today = new Date();

// ── Store master (3-sheet union) ────────────────────────────
console.log(`Reading ${STORE_XLSX}`);
const storeWb = readWb(STORE_XLSX);
const storeMaster = new Map(); // 매장코드 → { open, area, form, present:Set }

for (let i = 0; i < SHEET_YMS.length; i++) {
  const sym = SHEET_YMS[i];
  const sname = SHEET_NAMES[i];
  if (!storeWb.SheetNames.includes(sname)) {
    console.warn(`  WARN: sheet ${sname} missing`); continue;
  }
  const rows = rowsOf(storeWb, sname);
  let active = 0;
  for (const r of rows) {
    const code = r['매장코드'];
    if (code == null) continue;
    const form = r['형태'];
    if (form == null) continue;
    const formS = String(form).trim();
    if (EXCLUDED_FORMS.has(formS)) continue;
    const closed = r['폐점여부'];
    if (closed && ['Y','TRUE','1','예'].includes(String(closed).trim().toUpperCase())) continue;
    const openDt = toDate(r['오픈일']);
    if (!openDt) continue;
    if (openDt > today) continue;   // 미래 오픈 제외
    const area = (typeof r['평수'] === 'number' && r['평수'] > 0) ? r['평수'] : null;
    const key = String(code);
    if (!storeMaster.has(key)) {
      storeMaster.set(key, { open: openDt, area, form: formS, present: new Set() });
    } else if (area) {
      storeMaster.get(key).area = area; // 최신 시트 값 우선
    }
    storeMaster.get(key).present.add(sym);
    active++;
  }
  console.log(`  [${sym}] 가맹점·기타출고·폐점·오픈일없음 제외 영업매장: ${active}`);
}
console.log(`  Union master: ${storeMaster.size} 매장`);
for (const sym of SHEET_YMS) {
  const n = [...storeMaster.values()].filter(s => s.present.has(sym)).length;
  console.log(`  union 검증 ${sym}: ${n}`);
}

const storeSnaps = [];
for (const ym of YM_RANGE) {
  const end = monthEnd(ym);
  const active = [];
  for (const s of storeMaster.values()) {
    if (s.open > end) continue;
    const endYm = endAfterLastSheet(s.present);
    if (endYm != null && ym >= endYm) continue;
    active.push(s);
  }
  const areas = active.map(s => s.area).filter(a => a != null);
  const avgArea = areas.length ? Math.round(areas.reduce((a,b)=>a+b,0) / areas.length * 10) / 10 : null;
  storeSnaps.push({ ym, count: active.length, avg_area: avgArea });
}
console.log(`  매장 스냅샷 ${storeSnaps.length}개월. 첫=${JSON.stringify(storeSnaps[0])}, 마지막=${JSON.stringify(storeSnaps.at(-1))}`);

// ── Worker master (3-sheet union) ───────────────────────────
console.log(`\nReading ${WORKER_XLSX}`);
const workerWb = readWb(WORKER_XLSX);
const workerMaster = new Map(); // 사번 → { hire, leave, present:Set }

for (let i = 0; i < SHEET_YMS.length; i++) {
  const sym = SHEET_YMS[i];
  const sname = SHEET_NAMES[i];
  if (!workerWb.SheetNames.includes(sname)) {
    console.warn(`  WARN: sheet ${sname} missing`); continue;
  }
  const rows = rowsOf(workerWb, sname);
  let active = 0;
  for (const r of rows) {
    const id = r['사번'];
    if (id == null) continue;
    const bumun = r['부문'];
    const empType = r['사원유형'];
    if (!BUMUN_INCLUDE.has(bumun)) continue;
    if (!EMP_INCLUDE.has(empType)) continue;
    const hire = toDate(r['입사일자']);
    if (!hire) continue;
    const leave = toDate(r['퇴직일자']);
    const key = String(id);
    if (!workerMaster.has(key)) {
      workerMaster.set(key, { hire, leave, present: new Set() });
    } else if (leave) {
      workerMaster.get(key).leave = leave;
    }
    workerMaster.get(key).present.add(sym);
    active++;
  }
  console.log(`  [${sym}] 영업+현장사원 적격: ${active}`);
}
console.log(`  Union worker master: ${workerMaster.size}`);
for (const sym of SHEET_YMS) {
  const n = [...workerMaster.values()].filter(w => w.present.has(sym)).length;
  console.log(`  union 검증 ${sym}: ${n}`);
}

const workerSnaps = [];
for (const ym of YM_RANGE) {
  const end = monthEnd(ym);
  let n = 0;
  for (const w of workerMaster.values()) {
    if (w.hire > end) continue;
    if (w.leave && w.leave <= end) continue;
    const endYm = endAfterLastSheet(w.present);
    if (endYm != null && ym >= endYm) continue;
    n++;
  }
  workerSnaps.push({ ym, workers: n });
}
console.log(`  근로자 스냅샷 ${workerSnaps.length}개월. 첫=${JSON.stringify(workerSnaps[0])}, 마지막=${JSON.stringify(workerSnaps.at(-1))}`);

// ── Write ────────────────────────────────────────────────────
const content =
  '// === Auto-generated by proj/scripts/extract-snapshots.mjs ===\n' +
  '// 3-sheet union (24.05.19 / 25.05.19 / 26.05.19) — 폐점·퇴직자 모두 추적.\n' +
  '// 매장: 가맹점/기타출고/폐점/오픈일없음/미래오픈 제외 · 오픈일 기준 시점별 영업 매장 수\n' +
  '// 근로자: 영업부문(수도권/지방영업부문) + 사원유형=현장사원 (물류사원 제외)\n\n' +
  `export const STORE_SNAPSHOTS = ${JSON.stringify(storeSnaps, null, 2)};\n\n` +
  `export const WORKER_SNAPSHOTS = ${JSON.stringify(workerSnaps, null, 2)};\n`;
writeFileSync(OUT, content, 'utf-8');
console.log(`\nWrote ${OUT}`);

#!/usr/bin/env node
// 매장 → 파트장 룩업(parjangByStore.js) 최신화 — 매장담당현황 엑셀에서 재생성.
//
// 원본 엑셀 구조: 매장마다 관리자 두 명이 있다 — 좌측 '담당자'=파트장, 우측 '점장'=점장.
// 값에는 직책(주임·대리·과장·점장·점주·팀장·매니저·부점장·차장·실장·대표)과 "(겸)" 같은
// 겸직 표기가 이름 뒤에 붙어있어, 이름만 남기고 모두 제거한 뒤 기존 파일과 동일하게
// "성 + **" 형식으로 마스킹한다(processAccidents.js maskName과 동일 규칙).
//
// 실행: node scripts/update-parjang-by-store.mjs <엑셀경로>
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import * as XLSX from 'xlsx';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'data', 'parjangByStore.js');
const SRC = process.argv[2];
if (!SRC) { console.error('사용법: node scripts/update-parjang-by-store.mjs <엑셀경로>'); process.exit(1); }

const TITLES = ['점주', '점장', '대리', '주임', '사원', '과장', '팀장', '매니저', '부점장', '차장', '실장', '대표'];

// 이름 정제: 괄호(겸 등) 제거 → 콤마로 여러 명이면 첫 명만 → 말미 직책 제거
function cleanName(raw) {
  if (raw == null) return null;
  let s = String(raw).replace(/\([^)]*\)/g, '').trim();
  if (!s) return null;
  s = s.split(',')[0].trim();
  for (const t of TITLES) {
    if (s.endsWith(t)) { s = s.slice(0, -t.length).trim(); break; }
  }
  return /^[가-힣]{2,4}$/.test(s) ? s : null;
}
const maskName = (s) => (s ? `${s[0]}**` : null);

const wb = XLSX.read(readFileSync(SRC), { type: 'buffer', cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: null });
console.log(`[update] 원본 ${rows.length}행 (시트: ${wb.SheetNames[0]})`);

const map = {};
let unresolved = 0;
let franchiseExcluded = 0;
for (const r of rows) {
  const store = r['매장명'] ? String(r['매장명']).trim() : null;
  if (!store) continue;
  if (String(r['형태'] ?? '').trim() === '가맹점') { franchiseExcluded++; continue; }
  const name = cleanName(r['담당자']);
  if (!name) { unresolved++; continue; }
  map[store] = maskName(name);
}
const keys = Object.keys(map).sort((a, b) => a.localeCompare(b, 'ko'));
const sorted = {};
for (const k of keys) sorted[k] = map[k];

console.log(`[update] 파트장 매핑: ${keys.length}개 매장 (가맹점 제외 ${franchiseExcluded}건 · 담당자 미상/정제실패 ${unresolved}건)`);

const out =
  `// 매장 → 파트장 룩업 (매장담당현황 엑셀 기준 자동 생성 · ${new Date().toISOString().slice(0, 10)}).\n` +
  `// 라이브 raw 시트엔 파트장이 없어, 매장명으로 매칭해 보강한다. [[sago-loss-productivity-basis]] 와 무관.\n` +
  `const PARJANG_BY_STORE = ${JSON.stringify(sorted)};\n\n` +
  `export default PARJANG_BY_STORE;\n`;
writeFileSync(OUT, out, 'utf-8');
console.log(`[update] 저장: ${OUT}`);

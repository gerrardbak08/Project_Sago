// 변환기 검증: 라이브 rows → buildWorkerDataFromLive → workerData shape 가
// 라이브 수치(사고경위 612 / 2026=173)를 재현하고, PII 누출이 0인지 대조.
//   실행: node proj/scripts/test-live-build.mjs
import { readFileSync } from 'fs';
import { buildWorkerDataFromLive } from '../src/utils/liveSource.js';

const snap   = JSON.parse(readFileSync('/tmp/as_startup.json', 'utf8'));
const stores = JSON.parse(readFileSync(new URL('../src/data/raw/stores.json', import.meta.url), 'utf8')).data;

const D = buildWorkerDataFromLive(snap.rows, stores);
const topType = Object.entries(D.injury || {}).sort((a, b) => b[1] - a[1])[0]?.[0];

console.log('=== 변환 (라이브 rows', snap.rows.length, '→ workerData shape) ===');
console.log('kpis.total/연도:', D.kpis?.total, '|', D.kpis?.y2024, D.kpis?.y2025, D.kpis?.y2026);
console.log('monthly:', D.monthly?.length, '개월', D.monthly?.[0]?.ym, '~', D.monthly?.[D.monthly.length - 1]?.ym);
console.log('영업부:', D.depts?.length, '개 | 유형1위:', topType, D.injury?.[topType]);
console.log('근로손실:', D.kpis?.loss_days_total, '일 /', D.kpis?.loss_days_count, '건 | 산재제출:', D.kpis?.submitted);

// PII 누출 검사
const names = [...new Set(snap.rows.map((r) => r.victimName).filter(Boolean))];
const emps  = [...new Set(snap.rows.map((r) => r.employeeNo).filter(Boolean))];
const blob  = JSON.stringify(D);
const leakN = names.filter((n) => n.length >= 2 && blob.includes(n));
const leakE = emps.filter((e) => blob.includes(e));
console.log('PII: 원본성명', names.length, '중 누출', leakN.length, leakN.slice(0, 3), '| 사번', emps.length, '중 누출', leakE.length);

const checks = [
  ['사고경위 총건', D.kpis?.total, 612],
  ['2026', D.kpis?.y2026, 173],
  ['2025', D.kpis?.y2025, 253],
  ['2024', D.kpis?.y2024, 186],
  ['유형 1위', topType, '넘어짐'],
  ['영업부 수', D.depts?.length, 10],
  ['성명 누출 0', leakN.length, 0],
  ['사번 누출 0', leakE.length, 0],
];
console.log('\n' + '지표'.padEnd(16) + '결과'.padEnd(10) + '기대  판정');
let fail = 0;
for (const [label, got, exp] of checks) {
  const ok = String(got) === String(exp);
  if (!ok) fail++;
  console.log(String(label).padEnd(16) + String(got).padEnd(10) + String(exp).padEnd(6) + (ok ? '✅' : '❌'));
}
console.log(fail === 0 ? '\n✅ 변환기 통과 — 라이브 데이터 재현 + PII 누출 0' : `\n❌ ${fail}개 불일치`);
process.exit(fail ? 1 : 0);

// 세부원인 택소노미 검증 리포트 (읽기전용)
// 실행: node scripts/validate-taxonomy.mjs [--unmatched]
// - 근로자 유형별 커버리지(1-미분류율), 세부원인 분포, 불변식(Σ세부원인==유형합)
// - 무리한 동작 동작×부위 교차, 정규화 효과
// - 고객 원인3/사고유형 정규화 distinct 축소 확인
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import {
  classifyWorkerSubCause, canonType, canonCauseObject, CUSTOMER_NORM, WORKER_SUBCAUSE,
} from '../src/constants/causeTaxonomy.js';
import liveSnap from '../src/data/liveSnapshot.js';

const __dir = dirname(fileURLToPath(import.meta.url));
const rows = liveSnap.rows;
const showUnmatched = process.argv.includes('--unmatched');
const pad = (s, n) => String(s).padEnd(n);
const padL = (s, n) => String(s).padStart(n);

// ── 근로자 분류 ──────────────────────────────────────────────
const classified = rows.map(r => ({
  type: canonType(r.accidentType),
  cls: classifyWorkerSubCause(r.accidentType, r.causeObject, r.accidentContent),
  content: r.accidentContent, causeObject: r.causeObject,
}));

const byType = {};
for (const c of classified) (byType[c.type] = byType[c.type] || []).push(c);

// 규칙이 있는 유형만 커버리지 측정(기타/사망/빈값 제외)
const RULE_TYPES = Object.keys(WORKER_SUBCAUSE);

console.log('═══════════════════════════════════════════════════════════');
console.log(' 근로자 세부원인 분류 — 유형별 커버리지 & 분포');
console.log('═══════════════════════════════════════════════════════════');
let covNum = 0, covDen = 0;
const typeOrder = Object.entries(byType).sort((a, b) => b[1].length - a[1].length).map(e => e[0]);
for (const t of typeOrder) {
  const arr = byType[t];
  const matched = arr.filter(c => c.cls.matched).length;
  const isRuleType = RULE_TYPES.includes(t);
  const cov = arr.length ? Math.round(matched / arr.length * 1000) / 10 : 0;
  if (isRuleType) { covNum += matched; covDen += arr.length; }

  // 세부원인 분포
  const dist = {};
  for (const c of arr) dist[c.cls.subCauseLabel] = (dist[c.cls.subCauseLabel] || 0) + 1;
  const distStr = Object.entries(dist).sort((a, b) => b[1] - a[1])
    .map(([l, n]) => `${l} ${n}`).join(' · ');

  const flag = isRuleType ? (cov >= 90 ? '✔' : cov >= 85 ? '△' : '✗') : '—';
  console.log(`\n${flag} ${pad(t, 12)} n=${padL(arr.length, 3)}  커버리지 ${padL(cov, 5)}%  (미분류 ${arr.length - matched})`);
  console.log(`     ${distStr}`);

  // 불변식: Σ세부원인 == 유형합
  const sumSub = Object.values(dist).reduce((s, n) => s + n, 0);
  if (sumSub !== arr.length) console.log(`     ⚠ 불변식 위반: Σ세부원인 ${sumSub} ≠ 유형합 ${arr.length}`);
}
console.log(`\n───────────────────────────────────────────────────────────`);
console.log(` 규칙유형 종합 커버리지: ${Math.round(covNum / covDen * 1000) / 10}%  (${covNum}/${covDen})`);

// ── 무리한 동작 동작×부위 교차 ──────────────────────────────
const motion = byType['무리한 동작'] || [];
console.log(`\n═══ 무리한 동작 · 동작 × 부위 교차 (n=${motion.length}) ═══`);
const mx = {};
for (const c of motion) {
  const a = c.cls.subCauseLabel, b = c.cls.bodyPart || '(미상)';
  mx[a] = mx[a] || {}; mx[a][b] = (mx[a][b] || 0) + 1;
}
for (const [act, parts] of Object.entries(mx)) {
  const ps = Object.entries(parts).sort((a, b) => b[1] - a[1]).map(([p, n]) => `${p}:${n}`).join('  ');
  console.log(`  ${pad(act, 14)} ${ps}`);
}

// ── 정규화 효과 ─────────────────────────────────────────────
console.log(`\n═══ 정규화 효과 ═══`);
const rawType = new Set(rows.map(r => (r.accidentType || '').trim()));
const canType = new Set(rows.map(r => canonType(r.accidentType)));
console.log(`  재해유형 distinct: ${rawType.size} → ${canType.size} (질병 4변종·무공백 통합)`);
const co = {};
for (const r of rows) { const c = canonCauseObject(r.causeObject); if (c) co[c] = (co[c] || 0) + 1; }
console.log(`  기인물 반복작업 통합: ${co['반복작업'] || 0}건, 칼 통합: ${co['칼'] || 0}건`);

// ── 고객 정규화 ─────────────────────────────────────────────
const custRaw = JSON.parse(readFileSync(resolve(__dir, '../src/data/raw/customer_accidents.json'), 'utf8'));
const cust = custRaw.data;
const distinct = (field, normFn) => {
  const raw = new Set(cust.map(r => r[field]).filter(v => v != null && v !== ''));
  const norm = new Set(cust.map(r => normFn(r[field])).filter(Boolean));
  return [raw.size, norm.size];
};
console.log(`\n═══ 고객 원인 정규화 ═══`);
const [t0, t1] = distinct('사고유형', CUSTOMER_NORM.type);
const [c0, c1] = distinct('원인3', CUSTOMER_NORM.c3);
const [c20, c21] = distinct('원인2', CUSTOMER_NORM.c2);
console.log(`  사고유형 distinct: ${t0} → ${t1} (낙성→낙상)`);
console.log(`  원인3   distinct: ${c0} → ${c1} (선행공백 제거)`);
console.log(`  원인2   distinct: ${c20} → ${c21} (괄호형식 통일)`);
const c3dist = {};
for (const r of cust) { const v = CUSTOMER_NORM.c3(r['원인3']); if (v) c3dist[v] = (c3dist[v] || 0) + 1; }
console.log(`  원인3 분포: ${Object.entries(c3dist).sort((a, b) => b[1] - a[1]).map(([l, n]) => `${l} ${n}`).join(' · ')}`);

// ── 미분류 원문 (튜닝용) ────────────────────────────────────
if (showUnmatched) {
  console.log(`\n═══ 미분류 원문 (규칙유형만) ═══`);
  for (const t of RULE_TYPES) {
    const un = (byType[t] || []).filter(c => !c.cls.matched);
    if (!un.length) continue;
    console.log(`\n── ${t} (미분류 ${un.length}) ──`);
    un.forEach(c => console.log(`   [${(c.causeObject || '').trim()}] ${(c.content || '').replace(/\n/g, ' ').slice(0, 90)}`));
  }
}

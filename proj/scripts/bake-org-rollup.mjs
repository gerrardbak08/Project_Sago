#!/usr/bin/env node
/**
 * 조직단위 사고집계 rollup 생성: liveSnapshot → src/data/org_rollup.json
 *
 * 대시보드와 동일한 processAccidents 파이프라인을 재사용해, 부문/부서/팀/매장 × 연·월별
 * 사고건수·재해유형 분포를 언어중립 JSON으로 bake한다. (정기 브리핑 Lambda·KPI·AI 공통 입력)
 *   - 대시보드 team_ir/dept_ir incidents와 합계 정합.
 *   - S3(MODELS_BUCKET) 업로드 시 백엔드 briefing Lambda가 그대로 읽는다.
 *
 * Usage: cd proj && node scripts/bake-org-rollup.mjs
 */
import { writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import liveSnap from '../src/data/liveSnapshot.js';
import { liveRowToAcc } from '../src/utils/liveSource.js';
import { processAccidents } from '../src/utils/processAccidents.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'data', 'org_rollup.json');
const YEARS = [2024, 2025, 2026];

const D = processAccidents(liveSnap.rows.map(liveRowToAcc), [], null);
const accs = (D.accidents || []).filter(a => a.year);

function newNode(level, key, parent) {
  return { level, key, parent, total: 0, years: {}, months: {}, typeByYear: {} };
}
function bump(node, a) {
  node.total++;
  const ym = `${a.year}-${String(a.month).padStart(2, '0')}`;
  node.years[a.year] = (node.years[a.year] || 0) + 1;
  node.months[ym] = (node.months[ym] || 0) + 1;
  const t = a.typeCanon || '기타';
  node.typeByYear[a.year] = node.typeByYear[a.year] || {};
  node.typeByYear[a.year][t] = (node.typeByYear[a.year][t] || 0) + 1;
}

const levels = { bumun: {}, dept: {}, team: {}, store: {} };
for (const a of accs) {
  if (a.bum)   { levels.bumun[a.bum] = levels.bumun[a.bum] || newNode('bumun', a.bum, {}); bump(levels.bumun[a.bum], a); }
  if (a.dept)  { levels.dept[a.dept] = levels.dept[a.dept] || newNode('dept', a.dept, { bum: a.bum }); bump(levels.dept[a.dept], a); }
  if (a.team)  { levels.team[a.team] = levels.team[a.team] || newNode('team', a.team, { bum: a.bum, dept: a.dept }); bump(levels.team[a.team], a); }
  if (a.store) { levels.store[a.store] = levels.store[a.store] || newNode('store', a.store, { bum: a.bum, dept: a.dept, team: a.team }); bump(levels.store[a.store], a); }
}

const out = {
  bakedAt: new Date().toISOString(),
  source: 'liveSnapshot',
  years: YEARS,
  counts: {
    bumun: Object.keys(levels.bumun).length,
    dept: Object.keys(levels.dept).length,
    team: Object.keys(levels.team).length,
    store: Object.keys(levels.store).length,
  },
  levels,
};

writeFileSync(OUT, JSON.stringify(out), 'utf-8');
console.log(`✔ org_rollup.json 생성 (${accs.length}건)`);
console.log(`  부문 ${out.counts.bumun} · 부서 ${out.counts.dept} · 팀 ${out.counts.team} · 매장 ${out.counts.store}`);
console.log(`  부문별 전체:`, Object.fromEntries(Object.entries(levels.bumun).map(([k, v]) => [k, v.total])));

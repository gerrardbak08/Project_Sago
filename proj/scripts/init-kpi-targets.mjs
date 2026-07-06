#!/usr/bin/env node
/**
 * 사고절감 목표(KPI) 자동 초기화: org_rollup.json → kpi_targets.json (프로젝트 루트, S3 MODELS_BUCKET 미러)
 *
 * 하이브리드 기본값: 전년(2025) 실적 × (1 - factor) 를 목표건수로 프리필.
 * 관리자 UI(Phase 2)가 이후 부서/팀별로 수정·덮어쓴다. (이 스크립트는 최초 1회·리셋용)
 *   - 비즈 목표: "전년 대비 10% 이상 절감" → factor=0.10.
 *   - --force 없이는 기존 kpi_targets.json이 있으면 덮어쓰지 않는다(관리자 수정 보호).
 *
 * Usage: cd proj && node scripts/init-kpi-targets.mjs [--force] [--factor=0.10]
 */
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROLLUP = resolve(__dirname, '..', 'src', 'data', 'org_rollup.json');
// 정본: 대시보드가 번들·편집. 배포 시 S3(MODELS_BUCKET/kpi_targets.json)로 업로드해 briefing Lambda가 읽는다.
const OUT = resolve(__dirname, '..', 'src', 'data', 'kpi_targets.json');

const args = process.argv.slice(2);
const force = args.includes('--force');
const factorArg = args.find(a => a.startsWith('--factor='));
const factor = factorArg ? parseFloat(factorArg.split('=')[1]) : 0.10;

const BASELINE_YEAR = 2025;   // 마지막 완전연도
const TARGET_YEAR = 2026;

if (existsSync(OUT) && !force) {
  const cur = JSON.parse(readFileSync(OUT, 'utf-8'));
  console.log(`⚠ kpi_targets.json 이미 존재(관리자 수정 보호). 덮어쓰려면 --force.`);
  console.log(`  현재: baseline ${cur.baseline_year} → target ${cur.target_year}, 부서 ${Object.keys(cur.levels?.dept || {}).length}`);
  process.exit(0);
}

const roll = JSON.parse(readFileSync(ROLLUP, 'utf-8'));

function buildLevel(nodes) {
  const out = {};
  for (const [key, node] of Object.entries(nodes)) {
    const baseline = node.years[BASELINE_YEAR] || 0;
    out[key] = {
      baseline_incidents: baseline,
      target_incidents: Math.max(0, Math.round(baseline * (1 - factor))),
      target_ir: null,          // 100명당 목표 — Phase 2에서 dept_ir 연동 시 채움
      edited: false,            // 관리자 수정 여부(자동값과 구분)
    };
  }
  return out;
}

const out = {
  version: '1.0',
  comment: `사고절감 목표. baseline=${BASELINE_YEAR} 실적×${(1 - factor).toFixed(2)} 자동 프리필. 관리자 UI로 수정. S3 MODELS_BUCKET/kpi_targets.json.`,
  baseline_year: BASELINE_YEAR,
  target_year: TARGET_YEAR,
  factor,
  updatedAt: new Date().toISOString(),
  levels: {
    bumun: buildLevel(roll.levels.bumun),
    dept: buildLevel(roll.levels.dept),
    team: buildLevel(roll.levels.team),
  },
};

writeFileSync(OUT, JSON.stringify(out, null, 2), 'utf-8');
console.log(`✔ kpi_targets.json 초기화 (baseline ${BASELINE_YEAR} → target ${TARGET_YEAR}, ×${(1 - factor).toFixed(2)})`);
console.log(`  부문 ${Object.keys(out.levels.bumun).length} · 부서 ${Object.keys(out.levels.dept).length} · 팀 ${Object.keys(out.levels.team).length}`);
const sample = Object.entries(out.levels.dept).slice(0, 4).map(([k, v]) => `${k} ${v.baseline_incidents}→${v.target_incidents}`);
console.log(`  예시(부서):`, sample.join(' · '));

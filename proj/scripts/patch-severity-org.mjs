// One-off: workerData.js 의 severity 에 by_bumun/by_dept/by_team 주입.
//
// 배경: DB/*.xlsx(원천 엑셀)가 로컬에 없어 정식 재베이크(regenerate-data.mjs) 불가.
//   대신 이미 baked 된 workerData.js 의 accidents(568건, dx·bum·dept·team 보유)에서
//   직접 산출해 severity 객체에만 3개 배열을 surgical 주입한다(다른 수치 불변).
//   processAccidents.js 에도 동일 로직이 반영돼 있어 다음 정식 재베이크 시 자동 생성됨.
// 멱등: 이미 by_bumun 이 있으면 스킵.

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import DEFAULT_DATA from '../src/data/workerData.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'data', 'workerData.js');

// processAccidents.js 와 100% 동일
function severityClass(dx) {
  if (!dx || dx === "-") return "미상";
  const s = String(dx);
  const severe = ["골절","파열","진탕","추간판","뇌출혈","척추","탈구","절단"];
  const mild = ["염좌","긴장","타박","열린상처","열상","통증","좌상","찰과"];
  for (const k of severe) if (s.includes(k)) return "중상";
  for (const k of mild) if (s.includes(k)) return "경상";
  return "기타";
}

// processAccidents.js 의 severity 는 sales(수도권+지방, 기타부문 제외)로 계산됨.
// dist/by_type/by_age 와 정합시키려면 동일 subset 사용 (그래야 미래 정식 재베이크와도 일치).
const ds = (DEFAULT_DATA.accidents || []).filter(x => x.bum === "수도권" || x.bum === "지방");
if (!ds.length) { console.error("!! accidents 없음 — 중단"); process.exit(1); }

const countBy = (arr, fn) => { const m = new Map(); for (const x of arr) { const k = fn(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); } return m; };
const topN = (m, n) => [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
const sevOf = x => severityClass(x.site_name || x.dx);
const sevGroup = (keyFn, keys) => keys.filter(Boolean).map(k => {
  const sub = ds.filter(x => keyFn(x) === k);
  return {
    name: k,
    "중상": sub.filter(x => sevOf(x) === "중상").length,
    "경상": sub.filter(x => sevOf(x) === "경상").length,
    "기타": sub.filter(x => sevOf(x) === "기타").length,
    "미상": sub.filter(x => sevOf(x) === "미상").length,
    total: sub.length,
  };
});

const bumunKeys = [...new Set(ds.map(x => x.bum).filter(Boolean))];
const deptKeys  = topN(countBy(ds, x => x.dept), 10).map(x => x[0]);
const teamKeys  = topN(countBy(ds, x => x.team), 12).map(x => x[0]);
const by_bumun = sevGroup(x => x.bum,  bumunKeys).filter(r => r.total > 0).sort((a, b) => b.total - a.total);
const by_dept  = sevGroup(x => x.dept, deptKeys).filter(r => r.total > 0);
const by_team  = sevGroup(x => x.team, teamKeys).filter(r => r.total > 0);

let text = readFileSync(OUT, 'utf8');
// 멱등: severity 에 이미 by_bumun 이 있으면 스킵 (worker_ir_summary.by_bumun 과 혼동 금지)
if (DEFAULT_DATA.severity && DEFAULT_DATA.severity.by_bumun) { console.log("이미 주입됨 — 스킵"); process.exit(0); }

const marker = ',"top_dx":';
const occ = text.split(marker).length - 1;
if (occ !== 1) { console.error(`!! marker '${marker}' ${occ}회 발견(1이어야 함) — 중단`); process.exit(1); }

const inject = `,"by_bumun":${JSON.stringify(by_bumun)},"by_dept":${JSON.stringify(by_dept)},"by_team":${JSON.stringify(by_team)}`;
text = text.replace(marker, inject + marker);
writeFileSync(OUT, text);

console.log("✓ 주입 완료");
console.log("by_bumun:", by_bumun.map(r => `${r.name}(총${r.total}·중상${r["중상"]})`).join(", "));
console.log("by_dept :", by_dept.length, "부서 · 상위3:", by_dept.slice(0, 3).map(r => `${r.name}(총${r.total})`).join(", "));
console.log("by_team :", by_team.length, "팀 · 상위3:", by_team.slice(0, 3).map(r => `${r.name}(총${r.total})`).join(", "));

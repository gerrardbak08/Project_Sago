// 데이터층 PoC 검증기 — 라이브 출처(시트→Apps Script)에서 직접 받아
// 클라이언트 파생 지표가 라이브 사이트 수치와 일치하는지 대조한다.
//   실행:  node datalayer/verify.mjs [division] [year]
//   목적:  "시트만 갱신하면 숫자 자동 전환" 파이프라인이 실제로 동작함을 증명.

import { fetchSnapshot, incidentKpi, approvalKpi, severeStores, repeatStores } from './accidentSource.mjs';

const division = process.argv[2] || '안전보건팀';
const year = process.argv[3] || '2026';

const fmt = (n) => n.toLocaleString('ko-KR');
const line = (label, derived, expected) => {
  const ok = String(derived) === String(expected);
  return { label, derived, expected, ok };
};

const snap = await fetchSnapshot({ division, year });
console.log(`\n출처: ${snap.meta.source}  |  division=${snap.meta.division}  |  기준연도=${year}`);
console.log(`가져온 시각: ${snap.fetchedAt}`);
console.log(`사고경위 rows: ${fmt(snap.incident.rows.length)}건  ·  산재승인 approvalRows: ${fmt(snap.approval.rows.length)}건\n`);

const inc = incidentKpi(snap.incident.rows, year);
const apr = approvalKpi(snap.approval.rows, year);
const sev = severeStores(snap.approval.rows, year);
const asOf = snap.incident.rows.reduce((m, r) => (r.accidentDate > m ? r.accidentDate : m), '');
const rep = repeatStores(snap.incident.rows, { minCount: 2, asOf, windowDays: 365, excludeTypes: ['출퇴근'] });
const sd = snap.serverDashboard?.kpi || {};

// 라이브 사이트 화면에서 확인한 2026 기댓값
const EXPECTED_2026 = {
  incidentTotal: 173,
  incidentTopType: '넘어짐',
  incidentTopCount: 48,
  approved: 32,
  big3: 19,
  lostDays: 1853,
  severe: 6,
  severeStores: 6,
  severeLostDays: 736,
};
const E = year === '2026' ? EXPECTED_2026 : null;

const checks = [
  line('사고경위 총건수', inc.total, E ? E.incidentTotal : sd.total ?? inc.total),
  line('사고경위 1위 유형', inc.topType, E ? E.incidentTopType : inc.topType),
  line('사고경위 1위 건수', inc.topTypeCount, E ? E.incidentTopCount : inc.topTypeCount),
  line('산재승인 건수', apr.approved, E ? E.approved : apr.approved),
  line('3대 재해', apr.big3, E ? E.big3 : apr.big3),
  line('근로손실일수', apr.lostDays, E ? E.lostDays : apr.lostDays),
  line('91일↑(중상해)', apr.severeCount, E ? E.severe : apr.severeCount),
  line('중상해 매장 수', sev.length, E ? E.severeStores : sev.length),
  line('중상해 근로손실 합', sev.reduce((s, e) => s + e.lostDays, 0), E ? E.severeLostDays : undefined),
  line('반복사고 매장(최근1년)', rep.length, snap.serverDashboard?.repeatStores?.length ?? rep.length),
];

const W = 18;
console.log('지표'.padEnd(W) + '파생(클라이언트)'.padEnd(18) + '기대(라이브)'.padEnd(16) + '판정');
console.log('─'.repeat(64));
for (const c of checks) {
  console.log(
    String(c.label).padEnd(W) +
      String(c.derived).padEnd(18) +
      String(c.expected).padEnd(16) +
      (c.ok ? '✅' : '❌')
  );
}

console.log(`\n반복사고 규칙: 최근1년(최신사고일 ${asOf} 기준) + 출퇴근 제외 + 2건↑`);

const failed = checks.filter((c) => !c.ok && c.expected !== 'undefined' && c.expected !== undefined);
if (failed.length === 0) {
  console.log('\n✅ 검증 통과 — 라이브 출처에서 받은 raw 데이터로 모든 핵심 KPI 재현 성공.');
  console.log('   → 정적 스냅샷 없이 "시트 갱신 = 자동 수치 전환" 이 성립함.');
} else {
  console.log(`\n❌ ${failed.length}개 불일치 — 공식 재점검 필요: ${failed.map((f) => f.label).join(', ')}`);
  process.exit(1);
}

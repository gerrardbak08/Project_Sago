// SAGO 사고 대시보드 — 단일 데이터 어댑터 (Source of Truth)
// ────────────────────────────────────────────────────────────────────────
// 기본 원칙: 데이터 "출처"는 오직 이 파일에서만 정의한다. 화면/차트는 이 모듈이
// 내려주는 정규화된 형태만 소비하므로, 출처가 바뀌어도 UI는 무수정이다.
//
//   현재 출처 : Google Sheet(사고경위DB / 산재승인DB) ← Apps Script Web App
//               "산재 대시보드 API v4.0" 가 시트를 매 요청마다 읽어 JSON 반환
//               → 사장님이 시트만 갱신하면 숫자가 자동 전환된다.
//   추후 출처 : 사내 API. SOURCE.kind 분기와 fetchSnapshot() 매핑만 교체.
//
// 이 모듈은 브라우저/Node(18+) 양쪽에서 동작한다(전역 fetch 사용).

export const SOURCE = {
  kind: 'apps-script',
  // 라이브(newjuna) 사이트가 실제 사용 중인 공개 엔드포인트
  endpoint:
    'https://script.google.com/macros/s/AKfycbzOV88CCiR7bgoMOfvFESik2mWtKoD6VJFQnS1-L6dFF2us2BYM9KzQjFHMmMk8VBYk/exec',
  // 원본 raw DB(권한 필요, 시트 직접 read 는 막혀 있음 — Apps Script 만 접근)
  rawDbUrl:
    'https://docs.google.com/spreadsheets/d/1pWfoDWXSowQRHBbIiVDgEd_0oK2XcFxtG4R5Kryvfus/edit',
};

// ── 도메인 상수 (라이브 수치와 100% 일치하도록 역산한 규칙) ──
export const SEVERE_DAYS = 91;                         // 중상해 = 근로손실 91일 이상
export const BIG3 = ['넘어짐', '무리한 동작', '물체에 맞음']; // 3대 재해

// ── 정규화 유틸 ──
const toInt = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : 0;
};
const normRow = (r) => ({
  ...r,
  year: toInt(r.year),
  month: toInt(r.month),
  lostDays: toInt(r.lostDays),
  approvalYn: String(r.approvalYn ?? '').trim(),
  accidentDate: String(r.accidentDate ?? '').slice(0, 10),
  store: String(r.store ?? '').trim(),
  stdDept: String(r.stdDept ?? '정보 없음').trim() || '정보 없음',
  stdTeam: String(r.stdTeam ?? '정보 없음').trim() || '정보 없음',
  accidentType: String(r.accidentType ?? '기타').trim() || '기타',
});

// ── 1) 출처에서 스냅샷 가져오기 ──
// division: 안전보건팀(전체) / 수도권영업부문 / 지방영업부문
export async function fetchSnapshot({ division = '안전보건팀', year = '전체', month = '전체' } = {}) {
  if (SOURCE.kind === 'apps-script') {
    const u = new URL(SOURCE.endpoint);
    u.searchParams.set('action', 'startup');
    u.searchParams.set('division', division);
    u.searchParams.set('year', String(year));
    u.searchParams.set('month', String(month));
    const res = await fetch(u, { redirect: 'follow' });
    if (!res.ok) throw new Error(`source HTTP ${res.status}`);
    const j = await res.json();
    if (!j || j.ok !== true) throw new Error('source returned not ok');
    return {
      fetchedAt: new Date().toISOString(),
      meta: { division: j.division, source: SOURCE.kind, preloadMode: j.preloadMode },
      init: j.init,                                  // years/departments/accidentTypes
      incident: { rows: (j.rows || []).map(normRow) },        // 사고경위DB
      approval: { rows: (j.approvalRows || []).map(normRow) },// 산재승인DB
      serverDashboard: j.dashboard,                  // 서버 선계산(대조용)
    };
  }
  // 추후: if (SOURCE.kind === 'internal-api') { ... }
  throw new Error(`unknown source kind: ${SOURCE.kind}`);
}

// ── 2) 공통 필터 ──
const byYear = (rows, year) =>
  year === '전체' || year == null ? rows : rows.filter((r) => r.year === toInt(year));
const byMonth = (rows, month) =>
  month === '전체' || month == null || month === '' ? rows : rows.filter((r) => r.month === toInt(month));

export function filterRows(rows, { year = '전체', month = '전체', dept, team, type, store } = {}) {
  let r = byMonth(byYear(rows, year), month);
  if (dept) r = r.filter((x) => x.stdDept === dept);
  if (team) r = r.filter((x) => x.stdTeam === team);
  if (type) r = r.filter((x) => x.accidentType === type);
  if (store) r = r.filter((x) => x.store.includes(store));
  return r;
}

const countBy = (rows, key) => {
  const m = new Map();
  for (const r of rows) {
    const k = r[key] || '정보 없음';
    m.set(k, (m.get(k) || 0) + 1);
  }
  return [...m].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count);
};

// ── 3) 파생 지표 (정적 스냅샷 없이 raw 에서 직접 도출 → 자동 갱신) ──

// 사고경위 대시보드 KPI/차트
export function incidentKpi(rows, year = '전체') {
  const cur = byYear(rows, year);
  const byType = countBy(cur, 'accidentType');
  return {
    total: cur.length,
    topType: byType[0]?.label ?? null,
    topTypeCount: byType[0]?.count ?? 0,
    byType,
    byDept: countBy(cur, 'stdDept'),
    byTeam: countBy(cur, 'stdTeam'),
  };
}

// 산재 승인 대시보드 KPI
export function approvalKpi(rows, year = '전체') {
  const cur = byYear(rows, year);
  return {
    approved: cur.length,
    big3: cur.filter((r) => BIG3.includes(r.accidentType)).length,
    lostDays: cur.reduce((s, r) => s + r.lostDays, 0),
    severeCount: cur.filter((r) => r.lostDays >= SEVERE_DAYS).length,
    byType: countBy(cur, 'accidentType'),
    byDept: countBy(cur, 'stdDept'),
  };
}

// 중상해(91일↑) 매장
export function severeStores(approvalRows, year = '전체') {
  const cur = byYear(approvalRows, year).filter((r) => r.lostDays >= SEVERE_DAYS);
  const m = new Map();
  for (const r of cur) {
    const e = m.get(r.store) || {
      store: r.store, dept: r.stdDept, team: r.stdTeam,
      count: 0, lostDays: 0, maxDays: 0, types: new Set(),
    };
    e.count += 1;
    e.lostDays += r.lostDays;
    e.maxDays = Math.max(e.maxDays, r.lostDays);
    e.types.add(r.accidentType);
    m.set(r.store, e);
  }
  return [...m.values()]
    .map((e) => ({ ...e, types: [...e.types] }))
    .sort((a, b) => b.maxDays - a.maxDays);
}

// 반복사고 매장 (동일 매장 minCount 이상).
// 라이브 규칙: 최근 1년(asOf=최신 사고일 기준 365일) + 출퇴근 제외 + 2건 이상.
export function repeatStores(rows, { minCount = 2, asOf, windowDays, excludeTypes = [] } = {}) {
  let scope = excludeTypes.length ? rows.filter((r) => !excludeTypes.includes(r.accidentType)) : rows;
  if (windowDays && asOf) {
    const cutoff = new Date(asOf);
    cutoff.setDate(cutoff.getDate() - windowDays);
    const c = cutoff.toISOString().slice(0, 10);
    scope = scope.filter((r) => r.accidentDate >= c);
  }
  const m = new Map();
  for (const r of scope) {
    if (!r.store) continue;
    const e = m.get(r.store) || { store: r.store, dept: r.stdDept, team: r.stdTeam, count: 0, recentDate: '', types: {} };
    e.count += 1;
    if (r.accidentDate > e.recentDate) e.recentDate = r.accidentDate;
    e.types[r.accidentType] = (e.types[r.accidentType] || 0) + 1;
    m.set(r.store, e);
  }
  return [...m.values()]
    .filter((e) => e.count >= minCount)
    .map((e) => ({ ...e, topType: Object.entries(e.types).sort((a, b) => b[1] - a[1])[0]?.[0] }))
    .sort((a, b) => b.count - a.count);
}

import { scaleObj, scaleRow, recalcRate } from './dataHelpers.js';
import DEFAULT_DATA from '../data/workerData.js';

function getFilteredData(D, yearFilter) {
  if (yearFilter === "all" || !D) return D;
  
  const totalAll = D.kpis?.total || 1;
  const periodCount = yearFilter === "2024" ? D.kpis.y2024
    : yearFilter === "2025" ? D.kpis.y2025
    : yearFilter === "2026" ? D.kpis.y2026 : totalAll;
  const ratio = periodCount / totalAll;
  
  // 부서/팀: y24/y25/y26 컬럼 있으면 그것 사용
  const filterByYearCol = (rows) => {
    if (!rows) return rows;
    const yearKey = yearFilter === "2024" ? "y24" : yearFilter === "2025" ? "y25" : "y26";
    return rows.map(r => {
      const total = r[yearKey] || 0;
      const oldTotal = r.total || 1;
      const subRatio = total / oldTotal;
      return {
        ...r,
        total,
        // hm은 월별 사고: 해당 연도 prefix만 필터
        hm: r.hm ? Object.fromEntries(Object.entries(r.hm).filter(([k]) => k.startsWith(yearFilter))) : r.hm,
      };
    });
  };
  
  // monthly, quarterly, halfly, yearly: 시계열 데이터 → 직접 필터
  const filteredMonthly = D.monthly?.filter(m => String(m.y) === yearFilter);
  const filteredYearly = D.yearly?.filter(y => String(y.year) === yearFilter);
  const filteredQuarterly = D.quarterly?.filter(q => String(q.y) === yearFilter);
  const filteredHalfly = D.halfly?.filter(h => h.yh.startsWith(yearFilter));
  
  // KPI 재계산: 단일 연도면 sudo/jibang을 yearly에서 가져옴
  const yearly1 = filteredYearly?.[0];
  const filteredKpis = yearly1 ? {
    ...D.kpis,
    total: periodCount,
    sudo: yearly1.s,
    jibang: yearly1.j,
    etc: yearly1.e,
    cost_total: Math.round((D.kpis.cost_total || 0) * ratio),
    cost_count: Math.round((D.kpis.cost_count || 0) * ratio),
    submitted: Math.round((D.kpis.submitted || 0) * ratio),
    not_submitted: Math.round((D.kpis.not_submitted || 0) * ratio),
    female: Math.round((D.kpis.female || 0) * ratio),
    male: Math.round((D.kpis.male || 0) * ratio),
    gender_unknown: Math.round((D.kpis.gender_unknown || 0) * ratio),
    unique_stores: Math.round((D.kpis.unique_stores || 0) * ratio),
  } : D.kpis;
  
  // 매트릭스/딕셔너리: 모두 비례 추정
  const filtered = {
    ...D,
    kpis: filteredKpis,
    yearly: filteredYearly,
    monthly: filteredMonthly,
    quarterly: filteredQuarterly,
    halfly: filteredHalfly,
    depts: filterByYearCol(D.depts),
    teams: filterByYearCol(D.teams),
    stores: D.stores?.map(s => ({ ...s, total: Math.round(s.total * ratio) })),
    weekday: D.weekday?.map(w => scaleRow(w, ratio, ["wd"])),
    wd_month: scaleObj(D.wd_month, ratio),
    cross: D.cross?.map(c => scaleRow(c, ratio, ["type"])),
    ageTenure: D.ageTenure?.map(a => scaleRow(a, ratio, ["age"])),
    deptType: D.deptType?.map(d => scaleRow(d, ratio, ["dept", "bum"])),
    gender: scaleObj(D.gender, ratio),
    genderType: D.genderType?.map(g => scaleRow(g, ratio, ["type"])),
    emp: scaleObj(D.emp, ratio),
    empType: D.empType?.map(e => scaleRow(e, ratio, ["emp"])),
    kind: scaleObj(D.kind, ratio),
    site: scaleObj(D.site, ratio),
    risk: D.risk?.map(r => scaleRow(r, ratio, ["type"])),
    keywords: D.keywords?.map(k => ({ ...k, count: Math.round(k.count * ratio) })),
    injury: scaleObj(D.injury, ratio),
    injury_s: scaleObj(D.injury_s, ratio),
    injury_j: scaleObj(D.injury_j, ratio),
    cause: scaleObj(D.cause, ratio),
    cause_s: scaleObj(D.cause_s, ratio),
    cause_j: scaleObj(D.cause_j, ratio),
    age: scaleObj(D.age, ratio),
    age_s: scaleObj(D.age_s, ratio),
    age_j: scaleObj(D.age_j, ratio),
    tenure: scaleObj(D.tenure, ratio),
    tenure_s: scaleObj(D.tenure_s, ratio),
    tenure_j: scaleObj(D.tenure_j, ratio),
    team_ir: D.team_ir?.map(t => recalcRate({ ...t, incidents: Math.round(t.incidents * ratio) })),
    dept_ir: D.dept_ir?.map(d => recalcRate({ ...d, incidents: Math.round(d.incidents * ratio) })),
    form_stats: D.form_stats?.map(f => recalcRate({ ...f, incidents: Math.round(f.incidents * ratio) })),
    size_stats: D.size_stats?.map(s => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    age_stats: D.age_stats?.map(a => recalcRate({ ...a, incidents: Math.round(a.incidents * ratio) })),
    sido_stats: D.sido_stats?.map(s => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    sigungu_top: D.sigungu_top?.map(s => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    guibun: D.guibun?.map(g => recalcRate({ ...g, incidents: Math.round(g.incidents * ratio) })),
    warehouse: D.warehouse?.map(w => recalcRate({ ...w, incidents: Math.round(w.incidents * ratio) })),
    age_hist: D.age_hist?.map(a => ({ ...a, count: Math.round(a.count * ratio) })),
    apply_type: scaleObj(D.apply_type, ratio),
    costType: D.costType ? Object.fromEntries(
      Object.entries(D.costType).map(([k, v]) => [k, {
        total: Math.round(v.total * ratio),
        count: Math.round(v.count * ratio),
        avg: v.avg,
      }])
    ) : D.costType,
    costDept: D.costDept ? Object.fromEntries(
      Object.entries(D.costDept).map(([k, v]) => [k, {
        total: Math.round(v.total * ratio),
        count: Math.round(v.count * ratio),
      }])
    ) : D.costDept,
    store_coverage: D.store_coverage ? {
      ...D.store_coverage,
      involved: Math.round(D.store_coverage.involved * ratio),
      safe: D.store_coverage.total - Math.round(D.store_coverage.involved * ratio),
    } : D.store_coverage,
    parjang: D.parjang ? {
      ...D.parjang,
      total: D.parjang.total,
      active: Math.round(D.parjang.active * ratio),
      top: D.parjang.top?.map(p => ({ ...p, incidents: Math.round(p.incidents * ratio) })).filter(p => p.incidents > 0),
    } : D.parjang,
    repeat_workers: D.repeat_workers ? {
      ...D.repeat_workers,
      repeat_count: Math.round(D.repeat_workers.repeat_count * ratio),
      repeat_incidents: Math.round(D.repeat_workers.repeat_incidents * ratio),
      // list 자체는 비례 적용 어려워 유지하되, 표시 시점에 안내
    } : D.repeat_workers,
    // 사용자에게 추정임을 알리는 플래그
    _isEstimated: true,
    _yearFilter: yearFilter,
    _ratio: ratio,
  };
  
  return filtered;
}

// ===== 매장 위험지도 컴포넌트 =====
export { getFilteredData };
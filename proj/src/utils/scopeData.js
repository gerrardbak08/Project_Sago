import { scaleObj, scaleRow, recalcRate } from './dataHelpers.js';

// 부문 스코프 필터 — scope={all:true} → 전사(그대로 통과), scope={bum:'수도권'|'지방'} → 해당 부문만.
// ─────────────────────────────────────────────────────────────────────────
// • 네이티브 bum/‑s·‑j 필드가 있는 섹션(depts·teams·stores·dept_ir·team_ir·deptType·accidents,
//   injury/cause/age/tenure)은 정확 필터.
// • 시계열(yearly/monthly/quarterly/halfly)은 해당 부문 계열만 남김.
// • 부문 분해 정보가 없는 집계는 부문 비율(sudo/total 등)로 비례추정 — 연도필터 getFilteredData와 동일 관례.
// • 처리하지 않는 필드는 전역값 그대로 통과(소프트 게이트: 크래시 대신 일부 전역 노출 허용).
// getFilteredData(연도)와 합성해 쓰도록 설계: getFilteredData(scopeData(data, scope), yearFilter).
export function scopeData(D, scope) {
  if (!D || !scope || scope.all || !scope.bum) return D;
  const bum = scope.bum;
  const isSudo = bum === '수도권';
  const isJibang = bum === '지방';
  const totalAll = D.kpis?.total || 1;
  const bumTotal = isSudo ? (D.kpis?.sudo || 0) : isJibang ? (D.kpis?.jibang || 0) : (D.kpis?.etc || 0);
  const ratio = bumTotal / totalAll;

  const byBum = (rows) => (rows ? rows.filter((r) => r.bum === bum) : rows);
  const pick = (base, sKey, jKey) => (isSudo ? (D[sKey] || base) : isJibang ? (D[jKey] || base) : base);
  // 월/분기/반기: {s,j,t} → 해당 부문 계열만
  const serT = (rows) => rows?.map((r) => {
    const v = isSudo ? (r.s || 0) : isJibang ? (r.j || 0) : ((r.t || 0) - (r.s || 0) - (r.j || 0));
    return { ...r, s: isSudo ? r.s : 0, j: isJibang ? r.j : 0, t: v };
  });
  // 연도: {year,s,j,e,loss_days,...} → 해당 부문 계열만, 손실일수 등은 비례
  const scaleYear = (rows) => rows?.map((y) => ({
    ...y,
    s: isSudo ? y.s : 0,
    j: isJibang ? y.j : 0,
    e: bum === '기타' ? y.e : 0,
    loss_days: y.loss_days != null ? Math.round(y.loss_days * ratio) : y.loss_days,
    loss_days_count: y.loss_days_count != null ? Math.round(y.loss_days_count * ratio) : y.loss_days_count,
    cost_total: y.cost_total != null ? Math.round(y.cost_total * ratio) : y.cost_total,
  }));

  const involved = new Set(
    (D.accidents || []).filter((a) => a.bum === bum).map((a) => a.store).filter(Boolean)
  ).size;
  const covTotal = D.store_coverage ? Math.round((D.store_coverage.total || 0) * ratio) : 0;

  return {
    ...D,
    kpis: {
      ...D.kpis,
      total: bumTotal,
      sudo: isSudo ? bumTotal : 0,
      jibang: isJibang ? bumTotal : 0,
      etc: bum === '기타' ? bumTotal : 0,
      y2024: Math.round((D.kpis.y2024 || 0) * ratio),
      y2025: Math.round((D.kpis.y2025 || 0) * ratio),
      y2026: Math.round((D.kpis.y2026 || 0) * ratio),
      cost_total: Math.round((D.kpis.cost_total || 0) * ratio),
      cost_count: Math.round((D.kpis.cost_count || 0) * ratio),
      loss_days_total: Math.round((D.kpis.loss_days_total || 0) * ratio),
      loss_days_count: Math.round((D.kpis.loss_days_count || 0) * ratio),
      submitted: Math.round((D.kpis.submitted || 0) * ratio),
      not_submitted: Math.round((D.kpis.not_submitted || 0) * ratio),
      female: Math.round((D.kpis.female || 0) * ratio),
      male: Math.round((D.kpis.male || 0) * ratio),
      gender_unknown: Math.round((D.kpis.gender_unknown || 0) * ratio),
      unique_stores: involved || Math.round((D.kpis.unique_stores || 0) * ratio),
    },
    yearly: scaleYear(D.yearly),
    monthly: serT(D.monthly),
    quarterly: serT(D.quarterly),
    halfly: serT(D.halfly),
    // 네이티브 bum 필터
    depts: byBum(D.depts),
    teams: byBum(D.teams),
    stores: byBum(D.stores),
    dept_ir: byBum(D.dept_ir),
    team_ir: byBum(D.team_ir),
    deptType: byBum(D.deptType),
    accidents: byBum(D.accidents),
    // ‑s/‑j 스플릿
    injury: pick(D.injury, 'injury_s', 'injury_j'),
    cause: pick(D.cause, 'cause_s', 'cause_j'),
    age: pick(D.age, 'age_s', 'age_j'),
    tenure: pick(D.tenure, 'tenure_s', 'tenure_j'),
    // 부문 분해 없는 집계 → 비례추정
    weekday: D.weekday?.map((w) => scaleRow(w, ratio, ['wd'])),
    wd_month: scaleObj(D.wd_month, ratio),
    cross: D.cross?.map((c) => scaleRow(c, ratio, ['type'])),
    gender: scaleObj(D.gender, ratio),
    genderType: D.genderType?.map((g) => scaleRow(g, ratio, ['type'])),
    emp: scaleObj(D.emp, ratio),
    empType: D.empType?.map((e) => scaleRow(e, ratio, ['emp'])),
    kind: scaleObj(D.kind, ratio),
    site: scaleObj(D.site, ratio),
    risk: D.risk?.map((r) => scaleRow(r, ratio, ['type'])),
    keywords: D.keywords?.map((k) => ({ ...k, count: Math.round(k.count * ratio) })),
    form_stats: D.form_stats?.map((f) => recalcRate({ ...f, incidents: Math.round(f.incidents * ratio) })),
    size_stats: D.size_stats?.map((s) => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    age_stats: D.age_stats?.map((a) => recalcRate({ ...a, incidents: Math.round(a.incidents * ratio) })),
    sido_stats: D.sido_stats?.map((s) => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    sigungu_top: D.sigungu_top?.map((s) => recalcRate({ ...s, incidents: Math.round(s.incidents * ratio) })),
    guibun: D.guibun?.map((g) => recalcRate({ ...g, incidents: Math.round(g.incidents * ratio) })),
    warehouse: D.warehouse?.map((w) => recalcRate({ ...w, incidents: Math.round(w.incidents * ratio) })),
    age_hist: D.age_hist?.map((a) => ({ ...a, count: Math.round(a.count * ratio) })),
    apply_type: scaleObj(D.apply_type, ratio),
    store_coverage: D.store_coverage
      ? { ...D.store_coverage, total: covTotal, involved: involved || Math.round(D.store_coverage.involved * ratio), safe: Math.max(0, covTotal - (involved || 0)) }
      : D.store_coverage,
    parjang: D.parjang
      ? { ...D.parjang, total: Math.round(D.parjang.total * ratio), active: Math.round(D.parjang.active * ratio), top: D.parjang.top?.map((p) => ({ ...p, incidents: Math.round(p.incidents * ratio) })).filter((p) => p.incidents > 0) }
      : D.parjang,
    repeat_workers: D.repeat_workers
      ? { ...D.repeat_workers, total_workers: Math.round(D.repeat_workers.total_workers * ratio), repeat_count: Math.round(D.repeat_workers.repeat_count * ratio), repeat_incidents: Math.round(D.repeat_workers.repeat_incidents * ratio) }
      : D.repeat_workers,
    _scopeBum: bum,
    _scopeLabel: scope.label,
    _isEstimated: true,
  };
}

export default scopeData;

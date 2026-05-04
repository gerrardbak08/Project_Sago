function yearKey(yr) {
  if (yr === "2024") return "y24";
  if (yr === "2025") return "y25";
  if (yr === "2026") return "y26";
  return null;
}
function compKey(yr) {
  if (yr === "2024") return "comp_y24";
  if (yr === "2025") return "comp_y25";
  if (yr === "2026") return "comp_y26";
  return null;
}

function cFilter(D, yr) {
  if (!yr || yr === "all") return {
    ...D, kpis: D.kpis_all, _yr: null,
    types: D.types.map(t => ({...t, _show:t.total, _comp:t.comp})),
    places: D.places.map(p => ({...p, _show:p.total, _comp:p.comp})),
    causes1: D.causes1.map(c => ({...c, _show:c.n})),
    causes2: D.causes2.map(c => ({...c, _show:c.n})),
    depts: D.depts.map(d => ({...d, _show:d.total, _comp:d.comp, _comp_count:d.comp_count})),
    bumun: D.bumun.map(b => ({...b, _show:b.total, _comp:b.comp})),
    teams: D.teams.map(t => ({...t, _show:t.total, _comp:t.comp})),
    process: D.process.map(p => ({...p, _show:p.n})),
    comp_bins: D.comp_bins.map(c => ({...c, _show:c.n})),
    ages: D.ages.map(a => ({...a, _show:a.total, _comp:a.comp})),
    hours: D.hours.map(h => ({...h, _show:h.t})),
    store_watchlist: D.store_watchlist.map(s => ({...s, _show:s.total, _comp:s.comp})),
    days_by_proc: D.days_by_proc.map(d => ({...d, _avg:d.avg, _n:d.n})),
  };
  
  const yk = yearKey(yr);
  const ck = compKey(yr);
  const kp = D[`kpis_${yk}`] || D.kpis_all;
  
  return {
    ...D,
    kpis: kp,
    _yr: yr,
    types: D.types.map(t => ({...t, _show:t[yk] || 0, _comp:t[ck] || 0})),
    places: D.places.map(p => ({...p, _show:p[yk] || 0, _comp:p[ck] || 0})).filter(p => p._show > 0).sort((a,b) => b._show - a._show),
    causes1: D.causes1.map(c => ({...c, _show:c[yk] || 0})).filter(c => c._show > 0).sort((a,b) => b._show - a._show),
    causes2: D.causes2.map(c => ({...c, _show:c[yk] || 0})).filter(c => c._show > 0).sort((a,b) => b._show - a._show),
    depts: D.depts.map(d => ({...d, _show:d[yk] || 0, _comp:d[ck] || 0, _comp_count:d[`comp_count_${yk}`] || 0})).filter(d => d._show > 0).sort((a,b) => b._show - a._show),
    bumun: D.bumun.map(b => ({...b, _show:b[yk] || 0, _comp:b[ck] || 0})),
    teams: D.teams.map(t => ({...t, _show:t[yk] || 0, _comp:t[ck] || 0})).filter(t => t._show > 0).sort((a,b) => b._show - a._show),
    process: D.process.map(p => ({...p, _show:p[yk] || 0})).filter(p => p._show > 0).sort((a,b) => b._show - a._show),
    comp_bins: D.comp_bins.map(c => ({...c, _show:c[yk] || 0})),
    ages: D.ages.map(a => ({...a, _show:a[yk] || 0, _comp:a[ck] || 0})),
    hours: D.hours.map(h => ({...h, _show:h[yk] || 0})),
    store_watchlist: D.store_watchlist.map(s => ({...s, _show:s[yk] || 0, _comp:s[ck] || 0})).filter(s => s._show > 0).sort((a,b) => b._show - a._show),
    days_by_proc: D.days_by_proc.map(d => ({...d, _avg:d[`avg_${yk}`] || 0, _n:d[`n_${yk}`] || 0})).filter(d => d._n > 0).sort((a,b) => b._avg - a._avg),
  };
}

// ────────── 요약 탭 ──────────
export { yearKey, compKey, cFilter };
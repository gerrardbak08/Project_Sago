import rawCustomer from '../data/raw/customer_accidents.json';

function parseDate(val) {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

function normalizeAge(val) {
  if (!val) return null;
  const s = String(val).trim();
  if (s === 'O' || s === '미상') return null;
  const m = s.match(/^(\d+)대/);
  if (m) return m[1] + '대';
  if (s.includes('10세') || s.includes('10대 이하') || s.includes('10대이하')) return '10대';
  return null;
}

function normalizeGender(val) {
  if (!val || val === '미상') return null;
  if (val === '여' || val === '여성') return '여';
  if (val === '남' || val === '남성') return '남';
  return null;
}

function normalizeDept(val) {
  if (!val) return null;
  return String(val).trim();
}

function BUMUN(dept) {
  const SUDO = ['강남/구리영업부','강북영업부','관악/평택/안산영업부','수원/용인영업부','인천영업부','관악/수원/용인영업부','평택/안산영업부'];
  if (SUDO.includes(dept)) return '수도권';
  return '지방';
}

function compBin(v) {
  if (v == null || isNaN(v)) return null;
  if (v <= 100000)  return '~10만';
  if (v <= 500000)  return '~50만';
  if (v <= 1000000) return '~100만';
  if (v <= 5000000) return '~500만';
  return '500만+';
}

function diffDays(start, end) {
  if (!start || !end) return null;
  const ms = end - start;
  return ms < 0 ? null : Math.round(ms / (1000 * 60 * 60 * 24));
}

function computeCustomer() {
  const rows = rawCustomer.data;

  // Normalize rows
  const ds = rows.map(r => {
    const dt    = parseDate(r['발생일시']);
    const dtCS  = parseDate(r['CS접수일']);
    const dtEnd = parseDate(r['종결일시']);
    const year  = dt ? dt.getFullYear() : null;
    const month = dt ? dt.getMonth() + 1 : null;
    const hour  = r['발생시간'] ? parseInt(String(r['발생시간']).slice(0, 2)) : null;
    const comp  = typeof r['보상금액'] === 'number' ? r['보상금액'] : null;
    const days  = typeof r['소요일'] === 'number' ? r['소요일'] : diffDays(dtCS, dtEnd);
    const dept  = normalizeDept(r['부문명']);
    const team  = r['지역명'] ? String(r['지역명']).trim() : null;
    const store = r['매장명'] ? String(r['매장명']).trim() : null;
    const type  = r['사고유형'] ? String(r['사고유형']).trim() : null;
    const place = r['장소'] ? String(r['장소']).trim() : null;
    const c1    = r['원인1'] ? String(r['원인1']).trim() : null;
    const c2    = r['원인2'] ? String(r['원인2']).trim() : null;
    const age   = normalizeAge(r['연령대']);
    const gender = normalizeGender(r['성별']);
    const proc  = r['처리과정'] ? String(r['처리과정']).trim() : null;
    const open  = dtEnd == null && dt != null;
    return { year, month, hour, dt, dtCS, dtEnd, dept, bumun: dept ? BUMUN(dept) : null,
             team, store, type, place, c1, c2, age, gender, comp, days, proc, open };
  }).filter(r => r.year && [2024, 2025, 2026].includes(r.year));

  const y24 = ds.filter(r => r.year === 2024);
  const y25 = ds.filter(r => r.year === 2025);
  const y26 = ds.filter(r => r.year === 2026);

  function kpis(arr) {
    const withComp = arr.filter(r => r.comp != null && r.comp > 0);
    const withDays = arr.filter(r => r.days != null && r.days >= 0);
    return {
      total:       arr.length,
      total_comp:  withComp.reduce((s, r) => s + r.comp, 0),
      comp_count:  withComp.length,
      avg_comp:    withComp.length > 0 ? Math.round(withComp.reduce((s, r) => s + r.comp, 0) / withComp.length) : 0,
      avg_days:    withDays.length > 0 ? Math.round(withDays.reduce((s, r) => s + r.days, 0) / withDays.length * 10) / 10 : 0,
      still_open:  arr.filter(r => r.open).length,
      female:      arr.filter(r => r.gender === '여').length,
      male:        arr.filter(r => r.gender === '남').length,
    };
  }

  // Yearly / Monthly
  const yearly = [2024, 2025, 2026].map(y => ({ y, t: ds.filter(r => r.year === y).length }));

  const monthly = [];
  for (const y of [2024, 2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
      const sub = ds.filter(r => r.year === y && r.month === m);
      if (sub.length > 0 || y < 2026 || (y === 2026 && m <= 4)) {
        monthly.push({ y, m, ym: `${y}-${String(m).padStart(2,'0')}`, t: sub.length });
      }
    }
  }

  // Types
  const allTypes = [...new Set(ds.map(r => r.type).filter(Boolean))];
  const types = allTypes.map(type => {
    const a  = ds.filter(r => r.type === type);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const withComp = (arr) => arr.filter(r => r.comp != null && r.comp > 0);
    const sumComp  = (arr) => arr.reduce((s, r) => s + (r.comp || 0), 0);
    return {
      type, total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
      comp: sumComp(withComp(a)), comp_y24: sumComp(withComp(a24)),
      comp_y25: sumComp(withComp(a25)), comp_y26: sumComp(withComp(a26)),
      comp_avg:     withComp(a).length  > 0 ? Math.round(sumComp(withComp(a))   / withComp(a).length)   : 0,
      comp_avg_y24: withComp(a24).length > 0 ? Math.round(sumComp(withComp(a24)) / withComp(a24).length) : 0,
      comp_avg_y25: withComp(a25).length > 0 ? Math.round(sumComp(withComp(a25)) / withComp(a25).length) : 0,
      comp_avg_y26: withComp(a26).length > 0 ? Math.round(sumComp(withComp(a26)) / withComp(a26).length) : 0,
    };
  }).sort((a, b) => b.total - a.total);

  // Places
  const allPlaces = [...new Set(ds.map(r => r.place).filter(Boolean))];
  const places = allPlaces.map(place => {
    const a   = ds.filter(r => r.place === place);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const sumComp = (arr) => arr.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
    return {
      place, total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
      comp: sumComp(a), comp_y24: sumComp(a24), comp_y25: sumComp(a25), comp_y26: sumComp(a26),
    };
  }).sort((a, b) => b.total - a.total);

  // Causes1 (원인1), Causes2 (원인2)
  function buildCauses(field) {
    const allC = [...new Set(ds.map(r => r[field]).filter(Boolean))];
    return allC.map(c => {
      const a = ds.filter(r => r[field] === c);
      return { c, n: a.length, y24: a.filter(r => r.year === 2024).length,
               y25: a.filter(r => r.year === 2025).length, y26: a.filter(r => r.year === 2026).length };
    }).sort((a, b) => b.n - a.n);
  }
  const causes1 = buildCauses('c1');
  const causes2 = buildCauses('c2');

  // Depts
  const allDepts = [...new Set(ds.map(r => r.dept).filter(Boolean))];
  const depts = allDepts.map(dept => {
    const a   = ds.filter(r => r.dept === dept);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const sumComp  = (arr) => arr.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
    const cntComp  = (arr) => arr.filter(r => r.comp > 0).length;
    return {
      dept, bumun: BUMUN(dept), total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
      comp: sumComp(a), comp_y24: sumComp(a24), comp_y25: sumComp(a25), comp_y26: sumComp(a26),
      comp_count: cntComp(a), comp_count_y24: cntComp(a24), comp_count_y25: cntComp(a25), comp_count_y26: cntComp(a26),
    };
  }).sort((a, b) => b.total - a.total);

  // Bumun
  const bumunList = [...new Set(ds.map(r => r.bumun).filter(Boolean))];
  const bumun = bumunList.map(bm => {
    const a   = ds.filter(r => r.bumun === bm);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const sumComp = (arr) => arr.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
    const cntComp = (arr) => arr.filter(r => r.comp > 0).length;
    return {
      bumun: bm, total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
      comp: sumComp(a), comp_y24: sumComp(a24), comp_y25: sumComp(a25), comp_y26: sumComp(a26),
      comp_count: cntComp(a),
    };
  }).sort((a, b) => b.total - a.total);

  // Teams
  const allTeams = [...new Set(ds.map(r => r.team).filter(Boolean))];
  const teams = allTeams.map(team => {
    const a   = ds.filter(r => r.team === team);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const sumComp = (arr) => arr.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
    const dept = a[0]?.dept || null;
    return {
      team, dept, bumun: dept ? BUMUN(dept) : null,
      total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
      comp: sumComp(a), comp_y24: sumComp(a24), comp_y25: sumComp(a25), comp_y26: sumComp(a26),
    };
  }).sort((a, b) => b.total - a.total);

  // Process
  const allProcs = [...new Set(ds.map(r => r.proc).filter(Boolean))];
  const process = allProcs.map(p => {
    const a = ds.filter(r => r.proc === p);
    return { p, n: a.length, y24: a.filter(r => r.year === 2024).length,
             y25: a.filter(r => r.year === 2025).length, y26: a.filter(r => r.year === 2026).length };
  }).sort((a, b) => b.n - a.n);

  // Comp bins
  const BIN_LABELS = ['~10만','~50만','~100만','~500만','500만+'];
  const comp_bins = BIN_LABELS.map(range => {
    const pred = (r) => r.comp != null && r.comp > 0 && compBin(r.comp) === range;
    const a = ds.filter(pred);
    return { range, n: a.length, y24: a.filter(r => r.year === 2024).length,
             y25: a.filter(r => r.year === 2025).length, y26: a.filter(r => r.year === 2026).length };
  });

  // Ages
  const AGE_LABELS = ['10대','20대','30대','40대','50대','60대','70대','80대','90대'];
  const ages = AGE_LABELS.filter(ag => ds.some(r => r.age === ag)).map(ag => {
    const a   = ds.filter(r => r.age === ag);
    const a24 = a.filter(r => r.year === 2024);
    const a25 = a.filter(r => r.year === 2025);
    const a26 = a.filter(r => r.year === 2026);
    const sumComp = (arr) => arr.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
    return { age: ag, total: a.length, y24: a24.length, y25: a25.length, y26: a26.length,
             comp: sumComp(a), comp_y24: sumComp(a24), comp_y25: sumComp(a25), comp_y26: sumComp(a26) };
  });

  // Hours
  const hours = Array.from({ length: 24 }, (_, h) => {
    const a = ds.filter(r => r.hour === h);
    return { h, t: a.length, y24: a.filter(r => r.year === 2024).length,
             y25: a.filter(r => r.year === 2025).length, y26: a.filter(r => r.year === 2026).length };
  });

  // Store watchlist (top 50 by total)
  const storeMap = new Map();
  for (const r of ds) {
    if (!r.store) continue;
    if (!storeMap.has(r.store)) storeMap.set(r.store, []);
    storeMap.get(r.store).push(r);
  }
  const store_watchlist = [...storeMap.entries()]
    .map(([store, arr]) => {
      const typeCnt = {};
      arr.forEach(r => { if (r.type) typeCnt[r.type] = (typeCnt[r.type] || 0) + 1; });
      const tp = Object.entries(typeCnt).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
      const dept = arr[0]?.dept || null;
      const team = arr[0]?.team || null;
      const bumun = arr[0]?.bumun || null;
      const sumComp = (sub) => sub.filter(r => r.comp > 0).reduce((s, r) => s + r.comp, 0);
      return { store, dept, team, bumun, total: arr.length,
               y24: arr.filter(r => r.year === 2024).length,
               y25: arr.filter(r => r.year === 2025).length,
               y26: arr.filter(r => r.year === 2026).length,
               comp: sumComp(arr), comp_y24: sumComp(arr.filter(r => r.year === 2024)),
               comp_y25: sumComp(arr.filter(r => r.year === 2025)),
               comp_y26: sumComp(arr.filter(r => r.year === 2026)), tp };
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 50);

  // Days by process
  const days_by_proc = allProcs.map(proc => {
    const sub   = ds.filter(r => r.proc === proc && r.days != null && r.days >= 0);
    const sub24 = sub.filter(r => r.year === 2024);
    const sub25 = sub.filter(r => r.year === 2025);
    const sub26 = sub.filter(r => r.year === 2026);
    const avg = (arr) => arr.length > 0 ? Math.round(arr.reduce((s, r) => s + r.days, 0) / arr.length * 10) / 10 : 0;
    const sorted = sub.map(r => r.days).sort((a, b) => a - b);
    const median = sorted.length > 0 ? sorted[Math.floor(sorted.length / 2)] : 0;
    return { proc, avg: avg(sub), median, n: sub.length,
             avg_y24: avg(sub24), n_y24: sub24.length,
             avg_y25: avg(sub25), n_y25: sub25.length,
             avg_y26: avg(sub26), n_y26: sub26.length };
  }).sort((a, b) => b.avg - a.avg);

  return {
    kpis_all: kpis(ds),
    kpis_y24: kpis(y24),
    kpis_y25: kpis(y25),
    kpis_y26: kpis(y26),
    yearly, monthly, types, places, causes1, causes2,
    depts, bumun, teams, process, comp_bins, ages, hours,
    store_watchlist, days_by_proc,
  };
}

export default computeCustomer();

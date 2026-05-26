import { parseDate, extractSido, sizeBucket, ageBucket, categorizeBum } from './parseHelpers.js';

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null || k === "") continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

// 매장수 카운팅 기준에서 제외할 형태 (가맹점은 본사 영업매장이 아님, 기타출고는 매장이 아님)
const EXCLUDED_FORMS = new Set(["가맹점", "기타출고"]);

function processStores(rows) {
  const stores = [];
  const today = new Date();
  for (const r of rows) {
    // 1) 폐점여부 = Y 제외
    const closed = r["폐점여부"];
    if (closed && ["Y", "TRUE", "1", "예"].includes(String(closed).trim().toUpperCase())) continue;
    // 2) 형태 = 가맹점·기타출고 제외
    const form = r["형태"];
    if (form && EXCLUDED_FORMS.has(String(form).trim())) continue;
    // 3) 오픈일 없음 또는 미래 오픈 제외 (아직 영업 시작 전)
    const openDt = parseDate(r["오픈일"]);
    if (!openDt || openDt > today) continue;
    const area = parseFloat(r["평수"]) || null;
    const warehouse = parseFloat(r["창고"]) || null;
    const display = parseFloat(r["진열평수"]) || null;
    stores.push({
      // 엑셀 실제 헤더: 매장코드 / 매장명 / 팀 / 부서 / 부문 / 형태 / 폐점여부 / 단품관리 / 오픈일 / 평수 / 실평수 / 창고 / 계약면적(㎡) / 진열평수 / 신주소 / 출고물류센터
      code: r["매장코드"], store: r["매장명"],
      team: r["팀"], dept: r["부서"], bum: r["부문"],
      form: r["형태"], type: r["단품관리"],
      area, size: sizeBucket(area),
      warehouse, display,
      warehouseRatio: (warehouse && area) ? Math.round(warehouse/area*1000)/10 : null,
      displayRatio: (display && area) ? Math.round(display/area*1000)/10 : null,
      openDate: openDt, age: ageBucket(openDt),
      address: r["신주소"], sido: extractSido(r["신주소"]),
      workers: parseFloat(r["매장인원"]) || null,
    });
  }
  return stores;
}

// ── 매장명 퍼지 매칭 유틸 ──────────────────────────────────
// 매장명 정규화: 공백·특수문자 제거, 점·호·지점 등 suffix 통일
function normalizeStoreName(name) {
  if (!name) return "";
  return String(name)
    .trim()
    .replace(/\s+/g, "")
    .replace(/[()（）\[\]]/g, "")
    .replace(/(점|지점|매장|store)$/i, "점")
    .toLowerCase();
}

// 편집 거리(Levenshtein) — 짧은 이름 최적화
function editDistance(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n; if (n === 0) return m;
  const dp = Array.from({length: m+1}, (_, i) => [i]);
  for (let j = 1; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

// 퍼지 매칭: 정확 매칭 → 정규화 매칭 → 편집거리 ≤2 매칭
function fuzzyMatchStore(name, masterSet) {
  if (!name) return null;
  if (masterSet.has(name)) return name; // 정확 매칭
  const normName = normalizeStoreName(name);
  for (const m of masterSet) {
    if (normalizeStoreName(m) === normName) return m; // 정규화 매칭
  }
  // 편집거리 매칭 (이름 길이 6자 이상에서만 — 짧은 이름 오매칭 방지)
  if (normName.length >= 4) {
    let best = null, bestDist = 3; // 최대 허용 거리
    for (const m of masterSet) {
      const nm = normalizeStoreName(m);
      if (Math.abs(nm.length - normName.length) > 3) continue;
      const d = editDistance(normName, nm);
      if (d < bestDist) { bestDist = d; best = m; }
    }
    if (best) return best;
  }
  return null;
}

function computeStoreMerged(accidentsSales, stores, workersData) {
  // team → dept map from stores? We need this from accident DB though
  const teamDept = {};
  for (const a of accidentsSales) {
    if (a.team && a.dept) teamDept[a.team] = a.dept;
  }
  
  // Annotate stores with dept/bum — 매장DB가 이미 가진 값을 우선, 없으면 사고DB로 보완
  for (const s of stores) {
    if (!s.dept) s.dept = teamDept[s.team] || null;
    if (!s.bum) s.bum = s.dept ? categorizeBum(s.dept) : null;
  }

  // 매장DB가 비어있으면 사고DB의 store 집합으로 대체 (근로자DB만 있는 경우)
  const storesFallback = (stores && stores.length > 0)
    ? stores
    : [...new Set(accidentsSales.map(a => a.store).filter(Boolean))].map(name => ({
        store: name, team: null, dept: null, bum: null, form: null, size: null, age: null, sido: null, area: null,
      }));
  
  // Team IR
  const teamCount = countBy(storesFallback, s => s.team);
  const teamIncidents = countBy(accidentsSales, x => x.team);
  const team_ir = Object.entries(teamCount).map(([team, n]) => {
    const inc = teamIncidents[team] || 0;
    const coverage = n > 0 ? Math.round(inc / n * 1000) / 10 : 0;
    const wRec = (workersData && team !== "null") ? workersData.teamMap.get(team) : null;
    const workers = wRec ? wRec.workers : null;
    const irPer100 = (workers && workers > 0) ? Math.round(inc / workers * 100 * 100) / 100 : null;
    const reliability = workers == null ? null : workers >= 20 ? "high" : workers >= 5 ? "low" : "unstable";
    return {
      team, dept: teamDept[team] || "-",
      bum: teamDept[team] ? categorizeBum(teamDept[team]) : "기타",
      stores: n, incidents: inc,
      rate: coverage,            // 백워드 호환 alias (Phase 3에서 coverage_rate로 마이그레이션)
      coverage_rate: coverage,   // 명시적 이름 — (사고발생 매장수 / 팀의 전체 매장수) × 100
      // 근로자DB 기반 신규 필드 (workers가 null이면 UI에서 "—" 표시)
      workers,
      ir_per100: irPer100,                                           // 100명당 사고건수
      ir_reliability: reliability,                                   // high(≥20) / low(≥5) / unstable(<5)
      stores_with_workers: wRec ? wRec.stores_count : null,
      new_hires_1y: wRec ? wRec.new_hires_1y : null,
      avg_tenure_yr: wRec ? wRec.avg_tenure_yr : null,
    };
  }).sort((a,b) => b.coverage_rate - a.coverage_rate);
  
  // Dept IR
  const deptCount = {};
  const deptArea = {};
  for (const s of storesFallback) {
    if (!s.dept) continue;
    deptCount[s.dept] = (deptCount[s.dept] || 0) + 1;
    if (!deptArea[s.dept]) deptArea[s.dept] = { sum: 0, n: 0 };
    if (s.area) { deptArea[s.dept].sum += s.area; deptArea[s.dept].n++; }
  }
  const deptIncidents = countBy(accidentsSales, x => x.dept);
  const dept_ir = Object.entries(deptCount).map(([dept, n]) => {
    const inc = deptIncidents[dept] || 0;
    const coverage = n > 0 ? Math.round(inc / n * 1000) / 10 : 0;
    const wRec = workersData ? workersData.deptMap.get(dept) : null;
    const workers = wRec ? wRec.workers : null;
    const irPer100 = (workers && workers > 0) ? Math.round(inc / workers * 100 * 100) / 100 : null;
    const reliability = workers == null ? null : workers >= 20 ? "high" : workers >= 5 ? "low" : "unstable";
    return {
      dept, bum: categorizeBum(dept),
      stores: n, incidents: inc,
      rate: coverage,
      coverage_rate: coverage,
      avg_area: (deptArea[dept] && deptArea[dept].n > 0) ? Math.round(deptArea[dept].sum / deptArea[dept].n * 10) / 10 : 0,
      workers,
      ir_per100: irPer100,
      ir_reliability: reliability,
      stores_with_workers: wRec ? wRec.stores_count : null,
      new_hires_1y: wRec ? wRec.new_hires_1y : null,
      avg_tenure_yr: wRec ? wRec.avg_tenure_yr : null,
    };
  }).sort((a,b) => b.coverage_rate - a.coverage_rate);
  
  // Store coverage
  const involvedStores = new Set(accidentsSales.map(a => a.store).filter(Boolean));
  const totalStores = new Set(storesFallback.map(s => s.store));
  const involvedMatch = [...involvedStores].filter(s => totalStores.has(s));
  const store_coverage = {
    total: totalStores.size,
    involved: involvedMatch.length,
    safe: totalStores.size - involvedMatch.length,
    unmatched: involvedStores.size - involvedMatch.length,
  };

  // 근로자DB ↔ 매장DB 조인 진단 — 퍼지 매칭 적용
  let worker_join = null;
  if (workersData) {
    const workerStoreNames = [...workersData.storeMap.keys()];
    const masterStores = stores && stores.length > 0
      ? new Set(stores.map(s => s.store))
      : new Set([...involvedStores, ...workerStoreNames]);

    // 1단계: 정확 매칭 + 퍼지 매칭
    const fuzzyMatched = [];   // { workerName, masterName, method }
    const stillUnmatched = [];
    for (const wn of workerStoreNames) {
      const fm = fuzzyMatchStore(wn, masterStores);
      if (fm) {
        fuzzyMatched.push({ workerName: wn, masterName: fm, method: fm === wn ? "exact" : "fuzzy" });
      } else {
        stillUnmatched.push(wn);
      }
    }
    const fuzzyCount = fuzzyMatched.filter(m => m.method === "fuzzy").length;
    worker_join = {
      worker_db_stores: workerStoreNames.length,
      matched_count: fuzzyMatched.length,
      unmatched_count: stillUnmatched.length,
      unmatched_sample: stillUnmatched.slice(0, 10),
      fuzzy_matched_count: fuzzyCount,
      fuzzy_matched_sample: fuzzyMatched.filter(m => m.method === "fuzzy").slice(0, 5)
        .map(m => `${m.workerName} → ${m.masterName}`),
      master_source: stores && stores.length > 0 ? "매장DB" : "사고DB+근로자DB 합집합",
    };
  }
  
  // Form stats
  const storeByForm = {}, incByForm = {};
  const storeByName = new Map();
  for (const s of storesFallback) storeByName.set(s.store, s);
  for (const s of storesFallback) storeByForm[s.form] = (storeByForm[s.form] || 0) + 1;
  for (const a of accidentsSales) {
    const s = storeByName.get(a.store);
    if (s) incByForm[s.form] = (incByForm[s.form] || 0) + 1;
  }
  const form_stats = ["직영점","유통점","유통행사"].map(f => ({
    form: f, incidents: incByForm[f] || 0, stores: storeByForm[f] || 0,
    rate: storeByForm[f] > 0 ? Math.round((incByForm[f] || 0) / storeByForm[f] * 1000) / 10 : 0,
  }));
  
  // Build store → worker count lookup from workersData.storeMap
  const storeWorkerCount = new Map();
  if (workersData && workersData.storeMap) {
    const masterNames = new Set(storesFallback.map(s => s.store));
    for (const [wName, rec] of workersData.storeMap.entries()) {
      const master = fuzzyMatchStore(wName, masterNames);
      if (master && rec.workers > 0) storeWorkerCount.set(master, rec.workers);
    }
  }

  // Size stats
  const storeBySize = {}, incBySize = {}, workerSumBySize = {}, workerCountBySize = {};
  for (const s of storesFallback) {
    storeBySize[s.size] = (storeBySize[s.size] || 0) + 1;
    const wc = storeWorkerCount.get(s.store) ?? (s.workers ?? null);
    if (wc != null && wc > 0) {
      workerSumBySize[s.size] = (workerSumBySize[s.size] || 0) + wc;
      workerCountBySize[s.size] = (workerCountBySize[s.size] || 0) + 1;
    }
  }
  for (const a of accidentsSales) {
    const s = storeByName.get(a.store);
    if (s) incBySize[s.size] = (incBySize[s.size] || 0) + 1;
  }
  const size_stats = ["소형(~100평)","중형(100-250)","대형(250-400)","특대(400+)"].map(sz => ({
    size: sz, incidents: incBySize[sz] || 0, stores: storeBySize[sz] || 0,
    rate: storeBySize[sz] > 0 ? Math.round((incBySize[sz] || 0) / storeBySize[sz] * 1000) / 10 : 0,
    avg_workers: workerCountBySize[sz] > 0 ? Math.round(workerSumBySize[sz] / workerCountBySize[sz] * 10) / 10 : null,
  }));
  
  // Age stats
  const storeByAge = {}, incByAge = {};
  for (const s of storesFallback) storeByAge[s.age] = (storeByAge[s.age] || 0) + 1;
  for (const a of accidentsSales) {
    const s = storeByName.get(a.store);
    if (s) incByAge[s.age] = (incByAge[s.age] || 0) + 1;
  }
  const age_stats = ["1년 미만","1-3년","3-5년","5-10년","10년+"].map(a => ({
    age: a, incidents: incByAge[a] || 0, stores: storeByAge[a] || 0,
    rate: storeByAge[a] > 0 ? Math.round((incByAge[a] || 0) / storeByAge[a] * 1000) / 10 : 0,
  }));
  
  // Sido stats
  const sidoSet = new Set(storesFallback.map(s => s.sido).filter(Boolean));
  const sido_stats = [...sidoSet].map(sido => {
    const sc = storesFallback.filter(s => s.sido === sido).length;
    const ic = accidentsSales.filter(a => {
      const s = storeByName.get(a.store);
      return s && s.sido === sido;
    }).length;
    return {
      sido, stores: sc, incidents: ic,
      rate: sc > 0 ? Math.round(ic / sc * 1000) / 10 : 0,
    };
  }).sort((a,b) => b.incidents - a.incidents);
  
  // Store KPI
  const totalArea = storesFallback.filter(s => s.area).reduce((sum, s) => sum + s.area, 0);
  const areaCount = storesFallback.filter(s => s.area).length;
  const store_kpi = {
    total: storesFallback.length,
    jikyoung: storeByForm["직영점"] || 0,
    yutong: storeByForm["유통점"] || 0,
    haengsa: storeByForm["유통행사"] || 0,
    avg_area: areaCount > 0 ? Math.round(totalArea / areaCount * 10) / 10 : 0,
    sido_count: sidoSet.size,
  };

  // 부문별 / 전체 100명당 IR 집계 (영업부문만 — 수도권/지방)
  let worker_ir_summary = null;
  if (workersData && workersData.bumunMap) {
    const incBum = countBy(accidentsSales, x => x.bum);
    const byBumun = [...workersData.bumunMap.values()].map(b => {
      const inc = incBum[b.bum] || 0;
      return {
        bum: b.bum,
        workers: b.workers,
        stores_count: b.stores_count,
        incidents: inc,
        ir_per100: b.workers > 0 ? Math.round(inc / b.workers * 100 * 100) / 100 : null,
      };
    });
    const totalWorkers = byBumun.reduce((s, x) => s + x.workers, 0);
    const totalInc = byBumun.reduce((s, x) => s + x.incidents, 0);
    worker_ir_summary = {
      total: {
        workers: totalWorkers,
        incidents: totalInc,
        stores_count: workersData.kpis.total_stores_with_workers,
        ir_per100: totalWorkers > 0 ? Math.round(totalInc / totalWorkers * 100 * 100) / 100 : null,
      },
      by_bumun: byBumun,
    };
  }
  
  return { team_ir, dept_ir, form_stats, size_stats, age_stats, sido_stats, store_coverage, store_kpi, worker_join, worker_ir_summary };
}



// === 계산법 설명 모달 (Power BI Tooltip Page 패턴) ===
export { processStores, normalizeStoreName, editDistance, fuzzyMatchStore, computeStoreMerged };
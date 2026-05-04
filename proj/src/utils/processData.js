import { tenureBucket, sizeBucket, ageBucket, extractSido, parseDate, categorizeBum } from './parseHelpers.js';


function hashEmpId(id) {
  if (id == null || id === "") return null;
  const SALT = "DAISO_EHS_2026_v1";
  const x = String(id) + SALT;
  let h = 0x811c9dc5 >>> 0;
  for (let i = 0; i < x.length; i++) {
    h ^= x.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "EMP_" + h.toString(16).padStart(8, "0");
}

// PII 마스킹: 성명 → 첫글자 + ** (예: "김지훈" → "김**")
function maskName(name) {
  if (name == null || name === "") return "익명";
  const s = String(name).trim();
  if (s.length === 0) return "익명";
  return s[0] + "**";
}

// YYYYMMDD 8자리 또는 ISO 형식 입사일자 파싱
function parseHireDateYYYYMMDD(val) {
  if (val == null || val === "") return null;
  const s = String(val).trim();
  const m8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (m8) {
    const y = +m8[1], mo = +m8[2], d = +m8[3];
    if (y < 1980 || y > 2030 || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    return new Date(Date.UTC(y, mo - 1, d));
  }
  if (val instanceof Date) return val;
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function tenureYrFromHireDate(hireDate, refDate) {
  if (!hireDate) return null;
  const ref = refDate || new Date();
  const ms = ref - hireDate;
  if (ms < 0) return null;
  return ms / (365.25 * 24 * 3600 * 1000);
}

// 매장근로자DB 처리. 영업부문(수도권/지방) 재직자만 매장 단위로 집계.
// PII (사번/성명)는 처리 과정에서만 사용, 출력에는 해시·마스킹만 포함.
function processWorkers(rows, refDate) {
  // 기준일 자동 감지: 1) 파라미터로 전달된 날짜 2) rows에서 최대 입사일 기준 오늘날짜 3) 현재 날짜
  let ref;
  if (refDate) {
    ref = refDate instanceof Date ? refDate : new Date(refDate);
  } else {
    // rows에서 최신 입사일 탐색 → 해당 날짜를 기준일로 사용
    let maxHire = null;
    for (const r of rows) {
      const h = parseHireDateYYYYMMDD(r["입사일자(YYYYMMDD)"] || r["입사일자"]);
      if (h && (!maxHire || h > maxHire)) maxHire = h;
    }
    ref = maxHire || new Date();
  }
  const SALES_BUMUNS = new Map([
    ["수도권영업부문", "수도권"],
    ["지방영업부문", "지방"],
  ]);

  const storeMap = new Map();
  const teamMap = new Map();
  const deptMap = new Map();
  const bumunMap = new Map();

  let total_active = 0, total_sales_active = 0, total_hq_active = 0;
  let new_hires_1y_total = 0, new_hires_6m_total = 0;
  let manager_total = 0;

  for (const r of rows) {
    if (r["사원상태"] !== "재직") continue;
    total_active++;

    const rawBumun = r["부문"];
    const bumNorm = SALES_BUMUNS.get(rawBumun);
    if (!bumNorm) { total_hq_active++; continue; }
    total_sales_active++;

    const dept = r["부서"];
    const team = r["팀"];
    const storeName = r["조직명"];
    if (!storeName) continue;

    const hireDate = parseHireDateYYYYMMDD(r["입사일자"]);
    const tenureYr = tenureYrFromHireDate(hireDate, ref);
    const isManager = !!(r["직책"] && /점장/.test(String(r["직책"])));
    const newHire1y = (tenureYr != null && tenureYr < 1);
    const newHire6m = (tenureYr != null && tenureYr < 0.5);

    if (newHire1y) new_hires_1y_total++;
    if (newHire6m) new_hires_6m_total++;
    if (isManager) manager_total++;

    // Store level
    if (!storeMap.has(storeName)) {
      storeMap.set(storeName, {
        store: storeName, dept, team, bum: bumNorm,
        workers: 0, new_hires_1y: 0, new_hires_6m: 0, managers: 0,
        _tenureSum: 0, _tenureN: 0,
      });
    }
    const sRec = storeMap.get(storeName);
    sRec.workers++;
    if (newHire1y) sRec.new_hires_1y++;
    if (newHire6m) sRec.new_hires_6m++;
    if (isManager) sRec.managers++;
    if (tenureYr != null) { sRec._tenureSum += tenureYr; sRec._tenureN++; }

    // Team level
    if (!teamMap.has(team)) teamMap.set(team, { team, dept, bum: bumNorm, workers: 0, _stores: new Set(), new_hires_1y: 0, _tenureSum: 0, _tenureN: 0 });
    const tRec = teamMap.get(team);
    tRec.workers++;
    tRec._stores.add(storeName);
    if (newHire1y) tRec.new_hires_1y++;
    if (tenureYr != null) { tRec._tenureSum += tenureYr; tRec._tenureN++; }

    // Dept level
    if (!deptMap.has(dept)) deptMap.set(dept, { dept, bum: bumNorm, workers: 0, _stores: new Set(), new_hires_1y: 0, _tenureSum: 0, _tenureN: 0 });
    const dRec = deptMap.get(dept);
    dRec.workers++;
    dRec._stores.add(storeName);
    if (newHire1y) dRec.new_hires_1y++;
    if (tenureYr != null) { dRec._tenureSum += tenureYr; dRec._tenureN++; }

    // Bumun level
    if (!bumunMap.has(bumNorm)) bumunMap.set(bumNorm, { bum: bumNorm, workers: 0, _stores: new Set() });
    const bRec = bumunMap.get(bumNorm);
    bRec.workers++;
    bRec._stores.add(storeName);
  }

  // Finalize stores: avg_tenure, cpa_applies
  let cpa_stores = 0, cpa_workers = 0, non_cpa_stores = 0, non_cpa_workers = 0;
  for (const v of storeMap.values()) {
    v.avg_tenure_yr = v._tenureN > 0 ? Math.round(v._tenureSum / v._tenureN * 100) / 100 : null;
    v.cpa_applies = v.workers >= 5;
    delete v._tenureSum; delete v._tenureN;
    if (v.cpa_applies) { cpa_stores++; cpa_workers += v.workers; }
    else { non_cpa_stores++; non_cpa_workers += v.workers; }
  }
  for (const v of teamMap.values()) {
    v.stores_count = v._stores.size;
    v.avg_tenure_yr = v._tenureN > 0 ? Math.round(v._tenureSum / v._tenureN * 100) / 100 : null;
    delete v._stores; delete v._tenureSum; delete v._tenureN;
  }
  for (const v of deptMap.values()) {
    v.stores_count = v._stores.size;
    v.avg_tenure_yr = v._tenureN > 0 ? Math.round(v._tenureSum / v._tenureN * 100) / 100 : null;
    delete v._stores; delete v._tenureSum; delete v._tenureN;
  }
  for (const v of bumunMap.values()) {
    v.stores_count = v._stores.size;
    delete v._stores;
  }

  const kpis = {
    ref_date: ref.toISOString().slice(0, 10),
    total_rows: rows.length,
    total_active,
    total_sales_active,
    total_stores_with_workers: storeMap.size,
    cpa_stores, cpa_workers,
    non_cpa_stores, non_cpa_workers,
    new_hires_1y: new_hires_1y_total,
    new_hires_6m: new_hires_6m_total,
    new_hires_1y_pct: total_sales_active > 0 ? Math.round(new_hires_1y_total / total_sales_active * 1000) / 10 : 0,
    manager_count: manager_total,
    by_bumun: [...bumunMap.values()].map(b => ({
      bum: b.bum,
      workers: b.workers,
      stores_count: b.stores_count,
    })),
  };

  return { storeMap, teamMap, deptMap, bumunMap, kpis };
}

function groupBy(arr, keyFn) {
  const m = new Map();
  for (const x of arr) {
    const k = keyFn(x);
    if (!m.has(k)) m.set(k, []);
    m.get(k).push(x);
  }
  return m;
}

function countBy(arr, keyFn) {
  const m = {};
  for (const x of arr) {
    const k = keyFn(x);
    if (k == null || k === "") continue;
    m[k] = (m[k] || 0) + 1;
  }
  return m;
}

function topN(obj, n) {
  return Object.entries(obj).sort((a,b) => b[1] - a[1]).slice(0, n);
}


function severityClass(dx) {
  if (!dx || dx === "-") return "미상";
  const s = String(dx);
  const severe = ["골절","파열","진탕","추간판","뇌출혈","척추","탈구","절단"];
  const mild = ["염좌","긴장","타박","열린상처","열상","통증","좌상","찰과"];
  for (const k of severe) if (s.includes(k)) return "중상";
  for (const k of mild) if (s.includes(k)) return "경상";
  return "기타";
}

function cleanParjang(s) {
  if (!s) return null;
  return String(s).trim().replace(/\s+(사원|주임|대리|과장|차장|부장|선임|책임|수석|팀장|매니저|이사|팀)$/, "");
}

function extractSigungu(addr) {
  if (!addr) return null;
  const m = String(addr).trim().match(/^\S+?(?:광역시|특별시|특별자치시|특별자치도|도|시)\s+(\S+?(?:시|군|구))/);
  return m ? m[1] : null;
}

function computeV5Extras(ds, df, stores) {
  // Input: ds = sales accidents (수도권+지방), df = all accidents, stores = store data
  const extras = {};
  
  // 1. Repeat workers
  const workerMap = new Map();
  for (const a of ds) {
    if (!a.workerId || !a.workerName) continue;
    const k = a.workerId;
    if (!workerMap.has(k)) workerMap.set(k, { id: a.workerId, name: a.workerName, records: [] });
    workerMap.get(k).records.push(a);
  }
  const repeatList = [];
  for (const [k, v] of workerMap.entries()) {
    if (v.records.length >= 2) {
      const teams = [...new Set(v.records.map(r => r.team).filter(Boolean))].slice(0,2);
      const depts = [...new Set(v.records.map(r => r.dept).filter(Boolean))].slice(0,2);
      const types = [...new Set(v.records.map(r => r.type).filter(Boolean))].slice(0,3);
      repeatList.push({ id: v.id, name: v.name, count: v.records.length, teams, depts, types });
    }
  }
  repeatList.sort((a,b) => b.count - a.count);
  extras.repeat_workers = {
    total_workers: workerMap.size,
    repeat_count: repeatList.length,
    repeat_incidents: repeatList.reduce((s, x) => s + x.count, 0),
    list: repeatList.slice(0, 25),
  };
  
  // 2. Severity
  const sevDist = { "중상": 0, "경상": 0, "기타": 0, "미상": 0 };
  for (const a of ds) sevDist[severityClass(a.site_name || a.dx)]++;
  
  const topTypes = topN(countBy(ds, x => x.type), 8).map(x => x[0]);
  const sevByType = topTypes.map(t => {
    const sub = ds.filter(x => x.type === t);
    return {
      type: t,
     "중상": sub.filter(x => severityClass(x.dx) === "중상").length,
     "경상": sub.filter(x => severityClass(x.dx) === "경상").length,
     "기타": sub.filter(x => severityClass(x.dx) === "기타").length,
     "미상": sub.filter(x => severityClass(x.dx) === "미상").length,
    };
  });
  const sevByAge = ["20 대","30 대","40 대","50 대","60 대"].map(age => {
    const sub = ds.filter(x => x.age === age);
    return {
      age,
     "중상": sub.filter(x => severityClass(x.dx) === "중상").length,
     "경상": sub.filter(x => severityClass(x.dx) === "경상").length,
     "기타": sub.filter(x => severityClass(x.dx) === "기타").length,
    };
  });
  const topDx = topN(countBy(ds.filter(x => x.dx && x.dx !== "-"), x => x.dx), 15);
  extras.severity = {
    dist: sevDist, by_type: sevByType, by_age: sevByAge,
    top_dx: Object.fromEntries(topDx),
  };
  
  // 3. Parjang
  const pjMap = new Map();
  for (const a of ds) {
    const p = cleanParjang(a.parjang);
    if (!p) continue;
    if (!pjMap.has(p)) pjMap.set(p, []);
    pjMap.get(p).push(a);
  }
  const pjList = [];
  for (const [p, arr] of pjMap.entries()) {
    const types = countBy(arr, x => x.type);
    const topType = Object.entries(types).sort((a,b) => b[1] - a[1])[0]?.[0] || null;
    pjList.push({
      parjang: p, incidents: arr.length,
      stores: new Set(arr.map(x => x.store).filter(Boolean)).size,
      teams: new Set(arr.map(x => x.team).filter(Boolean)).size,
      dept: arr[0]?.dept, bum: arr[0]?.bum, top_type: topType,
    });
  }
  pjList.sort((a,b) => b.incidents - a.incidents);
  extras.parjang = {
    total: pjMap.size,
    active: pjList.filter(x => x.incidents >= 3).length,
    top: pjList.filter(x => x.incidents >= 3).slice(0, 15),
  };
  
  // 4. Apply type
  extras.apply_type = countBy(ds, x => x.applyType);
  
  // 5. Quarterly
  const quarterly = [];
  for (const y of [2024, 2025, 2026]) {
    for (let q = 1; q <= 4; q++) {
      const months = [q*3-2, q*3-1, q*3];
      const sub = df.filter(x => x.year === y && months.includes(x.month));
      if (sub.length > 0 || (y < 2026) || (y === 2026 && q <= 2)) {
        quarterly.push({
          yq: `${y}Q${q}`, y, q,
          s: sub.filter(x => x.bum === "수도권").length,
          j: sub.filter(x => x.bum === "지방").length,
          t: sub.length,
        });
      }
    }
  }
  extras.quarterly = quarterly;
  
  // 6. Halfly
  const halfly = [];
  for (const y of [2024, 2025, 2026]) {
    for (const h of ["상","하"]) {
      const months = h === "상" ? [1,2,3,4,5,6] : [7,8,9,10,11,12];
      const sub = df.filter(x => x.year === y && months.includes(x.month));
      if (sub.length > 0) {
        halfly.push({
          yh: `${y}${h}반기`, t: sub.length,
          s: sub.filter(x => x.bum === "수도권").length,
          j: sub.filter(x => x.bum === "지방").length,
        });
      }
    }
  }
  extras.halfly = halfly;
  
  // 7. Age histogram
  const ageHist = [];
  const bins = [[20,25],[25,30],[30,35],[35,40],[40,45],[45,50],[50,55],[55,60],[60,65],[65,70]];
  for (const [lo, hi] of bins) {
    const count = ds.filter(x => x.ageNum >= lo && x.ageNum < hi).length;
    ageHist.push({ range: `${lo}-${hi-1}`, count, lo });
  }
  extras.age_hist = ageHist;
  
  // 8. Sigungu / Guibun / Warehouse (need stores merged)
  if (stores && stores.length > 0) {
    const storeByName = new Map();
    for (const s of stores) {
      s.sigungu = extractSigungu(s.address);
      storeByName.set(s.store, s);
    }
    
    // Sigungu top 30
    const sgMap = new Map();
    for (const s of stores) {
      if (!s.sido || !s.sigungu) continue;
      const k = `${s.sido}|${s.sigungu}`;
      if (!sgMap.has(k)) sgMap.set(k, { 시도: s.sido, 시군구: s.sigungu, stores_count: 0, incidents: 0 });
      sgMap.get(k).stores_count++;
    }
    for (const a of ds) {
      const s = storeByName.get(a.store);
      if (!s || !s.sido || !s.sigungu) continue;
      const k = `${s.sido}|${s.sigungu}`;
      if (sgMap.has(k)) sgMap.get(k).incidents++;
    }
    const sgArr = [...sgMap.values()].map(x => ({ ...x, rate: x.stores_count > 0 ? Math.round(x.incidents/x.stores_count*1000)/10 : 0 }));
    sgArr.sort((a,b) => b.incidents - a.incidents);
    extras.sigungu_top = sgArr.slice(0, 30);
    extras.sigungu_total = sgMap.size;
    
    // Guibun
    const guibunStats = ["단품관리","금액관리"].map(g => {
      const sc = stores.filter(s => s.type === g).length;
      const ic = ds.filter(a => {
        const s = storeByName.get(a.store);
        return s && s.type === g;
      }).length;
      return { guibun: g, stores: sc, incidents: ic, rate: sc > 0 ? Math.round(ic/sc*1000)/10 : 0 };
    });
    extras.guibun = guibunStats;
    
    // Warehouse ratio
    const warehouseBucket = (r) => {
      if (r == null || isNaN(r)) return "미상";
      if (r < 5) return "5%미만";
      if (r < 10) return "5-10%";
      if (r < 15) return "10-15%";
      if (r < 20) return "15-20%";
      return "20%이상";
    };
    for (const s of stores) s.whBucket = warehouseBucket(s.warehouseRatio);
    const whStats = ["5%미만","5-10%","10-15%","15-20%","20%이상"].map(wb => {
      const sc = stores.filter(s => s.whBucket === wb).length;
      const ic = ds.filter(a => {
        const s = storeByName.get(a.store);
        return s && s.whBucket === wb;
      }).length;
      return { bucket: wb, stores: sc, incidents: ic, rate: sc > 0 ? Math.round(ic/sc*1000)/10 : 0 };
    });
    extras.warehouse = whStats;
  }
  
  return extras;
}

export { hashEmpId, maskName, parseHireDateYYYYMMDD, tenureYrFromHireDate, processWorkers };
import { extractSido, parseDate, categorizeBum, parseTenure, tenureBucket, WD_NAMES } from './parseHelpers.js';
import { computeStoreMerged } from './processStores.js';


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


function processAccidents(rows, storesData, workersData) {
  // Normalize
  const ds = [];
  for (const r of rows) {
    const y = parseInt(r["년"]);
    const m = parseInt(r["월"]);
    if (![2024, 2025, 2026].includes(y)) continue;
    const dept = r["부서"];
    const bum = categorizeBum(dept);
    const dt = parseDate(r["재해일자"]);
    const tenure = parseTenure(r["근속기간 (년)"]);
    ds.push({
      year: y, month: m, dept, team: r["팀명"], store: r["매장명"],
      bum, date: dt, wd: dt ? WD_NAMES[dt.getDay() === 0 ? 6 : dt.getDay() - 1] : null,
      age: r["나이대"], ageNum: parseInt(r["나이"]) || null, gender: r["성별"], emp: r["고용형태"],
      tenureYr: tenure, tenureBkt: tenureBucket(tenure),
      kind: r["재해 종류"], type: r["재해 유형"], cause: r["기인물"],
      site: r["상해부위 (근골격계)"], content: r["사고 내용"],
      cost: parseFloat(r["공상 비용 계"]) || null,
      submitted: r["근로복지공단 제출"] != null && r["근로복지공단 제출"] !== "",
      workerId: r["사번"], workerName: r["재해자명"],
      parjang: r["파트장"], applyType: r["신청유형"],
      dx: r["상병명"],
    });
  }
  
  const all = ds;
  const sales = ds.filter(x => x.bum === "수도권" || x.bum === "지방");
  
  // KPIs
  const kpis = {
    total: all.length,
    sudo: all.filter(x => x.bum === "수도권").length,
    jibang: all.filter(x => x.bum === "지방").length,
    etc: all.filter(x => x.bum === "기타").length,
    y2024: all.filter(x => x.year === 2024).length,
    y2025: all.filter(x => x.year === 2025).length,
    y2026: all.filter(x => x.year === 2026).length,
    cost_total: Math.round(all.reduce((s,x) => s + (x.cost || 0), 0)),
    cost_count: all.filter(x => x.cost).length,
    cost_avg: 0,
    submitted: all.filter(x => x.submitted).length,
    not_submitted: all.filter(x => !x.submitted).length,
    female: all.filter(x => x.gender === "여").length,
    male: all.filter(x => x.gender === "남").length,
    gender_unknown: all.filter(x => !x.gender).length,
    unique_stores: new Set(sales.map(x => x.store).filter(Boolean)).size,
  };
  kpis.cost_avg = kpis.cost_count > 0 ? Math.round(kpis.cost_total / kpis.cost_count) : 0;
  
  // Yearly
  const yearly = [2024, 2025, 2026].map(y => ({
    year: y,
    s: all.filter(x => x.year === y && x.bum === "수도권").length,
    j: all.filter(x => x.year === y && x.bum === "지방").length,
    e: all.filter(x => x.year === y && x.bum === "기타").length,
  }));
  
  // Monthly
  const monthly = [];
  for (const y of [2024, 2025, 2026]) {
    for (let m = 1; m <= 12; m++) {
      const filtered = all.filter(x => x.year === y && x.month === m);
      if (filtered.length > 0 || y < 2026 || (y === 2026 && m <= 4)) {
        monthly.push({
          ym: `${y}-${String(m).padStart(2,"0")}`, y, m,
          s: filtered.filter(x => x.bum === "수도권").length,
          j: filtered.filter(x => x.bum === "지방").length,
          t: filtered.length,
        });
      }
    }
  }
  
  // Dept-level data with heatmaps
  const depts = [];
  const deptMap = groupBy(sales.filter(x => x.dept), x => x.bum + "|" + x.dept);
  for (const [key, arr] of deptMap.entries()) {
    const [bum, dept] = key.split("|");
    const hm = {};
    for (const x of arr) {
      const k = `${x.year}-${String(x.month).padStart(2,"0")}`;
      hm[k] = (hm[k] || 0) + 1;
    }
    depts.push({
      bum, dept,
      total: arr.length,
      y24: arr.filter(x => x.year === 2024).length,
      y25: arr.filter(x => x.year === 2025).length,
      y26: arr.filter(x => x.year === 2026).length,
      stores: new Set(arr.map(x => x.store).filter(Boolean)).size,
      per_store: 0,
      hm,
    });
  }
  depts.forEach(d => d.per_store = d.stores > 0 ? Math.round(d.total / d.stores * 100) / 100 : 0);
  
  // Team-level
  const teams = [];
  const teamMap = groupBy(sales.filter(x => x.team), x => x.bum + "|" + x.dept + "|" + x.team);
  for (const [key, arr] of teamMap.entries()) {
    const [bum, dept, team] = key.split("|");
    const hm = {};
    for (const x of arr) {
      const k = `${x.year}-${String(x.month).padStart(2,"0")}`;
      hm[k] = (hm[k] || 0) + 1;
    }
    teams.push({
      bum, dept, team,
      total: arr.length,
      y24: arr.filter(x => x.year === 2024).length,
      y25: arr.filter(x => x.year === 2025).length,
      y26: arr.filter(x => x.year === 2026).length,
      stores: new Set(arr.map(x => x.store).filter(Boolean)).size,
      hm,
    });
  }
  
  // Store ranking
  const storeMap = groupBy(sales.filter(x => x.store), x => x.store);
  const stores = [];
  for (const [store, arr] of storeMap.entries()) {
    const types = countBy(arr, x => x.type);
    const topType = Object.entries(types).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-";
    const sample = arr[0];
    stores.push({
      store, dept: sample.dept, team: sample.team, bum: sample.bum,
      total: arr.length, top_type: topType,
    });
  }
  stores.sort((a,b) => b.total - a.total);
  
  // Weekday
  const weekday = WD_NAMES.map(wd => ({
    wd,
    s: sales.filter(x => x.wd === wd && x.bum === "수도권").length,
    j: sales.filter(x => x.wd === wd && x.bum === "지방").length,
    t: sales.filter(x => x.wd === wd).length,
  }));
  
  // Weekday x Month
  const wd_month = {};
  for (const wd of WD_NAMES) {
    for (let m = 1; m <= 12; m++) {
      wd_month[`${wd}-${m}`] = sales.filter(x => x.wd === wd && x.month === m).length;
    }
  }
  
  // Injury types
  const injury = countBy(sales, x => x.type);
  const injury_s = countBy(sales.filter(x => x.bum === "수도권"), x => x.type);
  const injury_j = countBy(sales.filter(x => x.bum === "지방"), x => x.type);
  
  // Cause (top 15)
  const cause = Object.fromEntries(topN(countBy(sales, x => x.cause), 15));
  const cause_s = Object.fromEntries(topN(countBy(sales.filter(x => x.bum === "수도권"), x => x.cause), 15));
  const cause_j = Object.fromEntries(topN(countBy(sales.filter(x => x.bum === "지방"), x => x.cause), 15));
  
  // Age
  const age = countBy(sales, x => x.age);
  const age_s = countBy(sales.filter(x => x.bum === "수도권"), x => x.age);
  const age_j = countBy(sales.filter(x => x.bum === "지방"), x => x.age);
  
  // Tenure
  const tenure = countBy(sales, x => x.tenureBkt);
  const tenure_s = countBy(sales.filter(x => x.bum === "수도권"), x => x.tenureBkt);
  const tenure_j = countBy(sales.filter(x => x.bum === "지방"), x => x.tenureBkt);
  
  // Others
  const gender = { "여": kpis.female, "남": kpis.male, "미상": kpis.gender_unknown };
  const kind = countBy(all, x => x.kind);
  const site = Object.fromEntries(topN(countBy(sales, x => x.site), 8));
  const emp = countBy(sales, x => x.emp);
  
  // Cross-tab: 재해유형 x 기인물
  const topTypes = topN(injury, 8).map(x => x[0]);
  const topCauses = topN(cause, 10).map(x => x[0]);
  const cross = topTypes.map(t => {
    const row = { type: t };
    for (const c of topCauses) {
      row[c] = sales.filter(x => x.type === t && x.cause === c).length;
    }
    return row;
  });
  
  // 연령 x 근속
  const ages = ["10 대","20 대","30 대","40 대","50 대","60 대"];
  const tenures = ["1년 미만","1-2년","3-4년","5-9년","10-14년","15년 이상"];
  const ageTenure = ages.map(a => {
    const row = { age: a };
    for (const t of tenures) {
      row[t] = sales.filter(x => x.age === a && x.tenureBkt === t).length;
    }
    return row;
  });
  
  // 부서 x 재해유형
  const deptType = depts.map(d => {
    const row = { dept: d.dept, bum: d.bum };
    for (const t of topTypes) {
      row[t] = sales.filter(x => x.dept === d.dept && x.type === t).length;
    }
    return row;
  });
  
  // 성별 x 재해유형
  const genderType = topTypes.map(t => ({
    type: t,
   "여": sales.filter(x => x.gender === "여" && x.type === t).length,
   "남": sales.filter(x => x.gender === "남" && x.type === t).length,
  }));
  
  // 고용형태 x 재해유형
  const empTypes = Object.keys(emp).slice(0, 4);
  const empType = empTypes.map(e => {
    const row = { emp: e, total: sales.filter(x => x.emp === e).length };
    for (const t of topTypes.slice(0, 6)) {
      row[t] = sales.filter(x => x.emp === e && x.type === t).length;
    }
    return row;
  });
  
  // Cost analysis
  const costType = {};
  const costRows = all.filter(x => x.cost);
  const costTypes = [...new Set(costRows.map(x => x.type).filter(Boolean))];
  for (const t of costTypes) {
    const sub = costRows.filter(x => x.type === t);
    costType[t] = {
      total: Math.round(sub.reduce((s,x) => s + x.cost, 0)),
      count: sub.length,
      avg: sub.length > 0 ? Math.round(sub.reduce((s,x) => s + x.cost, 0) / sub.length) : 0,
    };
  }
  
  // Risk matrix
  const risk = topTypes.map(t => {
    const sub = sales.filter(x => x.type === t);
    const subCost = sub.filter(x => x.cost);
    return {
      type: t, freq: sub.length,
      sev: subCost.length > 0 ? Math.round(subCost.reduce((s,x) => s + x.cost, 0) / subCost.length) : 0,
      cost_total: Math.round(subCost.reduce((s,x) => s + x.cost, 0)),
      cost_count: subCost.length,
    };
  });
  
  // Keywords
  const stopWords = new Set(["재해","사고","발생","이후","당시","현재","중이","있는","있었","되어","하는","하였","되는","하다","통증","부위","있음","되었","증상","관련","이동","상태","위해","때문","이상","매장","직원","병원","방문","진료","당사","이번","이때","그날","당일","다음","이로","그로","이에","판매","근무","동안","상품"]);
  const allText = sales.map(x => x.content || "").join(" ");
  const tokens = allText.match(/[\uAC00-\uD7AF]{2,}/g) || [];
  const wcount = {};
  for (const t of tokens) if (!stopWords.has(t)) wcount[t] = (wcount[t] || 0) + 1;
  const keywords = topN(wcount, 25).map(([word, count]) => ({ word, count }));
  
  // Projection with CI
  // === 개선된 월별 예측: 선형회귀 추세 + 계절성 조정 ===
  // 1) 선형회귀로 전반적 추세선 (y = a*x + b) 학습
  // 2) 과거 같은 월(예: 3월)의 평균 대비 비율로 계절계수 계산
  // 3) 예측값 = 추세선 × 계절계수
  // 4) 잔차의 표준편차로 95% 신뢰구간 생성
  const pastMonths = monthly.filter(x => x.y < 2026);
  const pastM = pastMonths.map(x => x.t);
  const mean = pastM.reduce((a,b)=>a+b,0) / pastM.length;
  
  // 선형회귀 계수 계산 (최소제곱법)
  const n = pastMonths.length;
  const xs = pastMonths.map((_, i) => i); // 0..23
  const xMean = xs.reduce((a,b)=>a+b,0) / n;
  const yMean = mean;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (pastM[i] - yMean);
    den += Math.pow(xs[i] - xMean, 2);
  }
  const slope = den > 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  
  // 계절 계수: 각 월(1~12) 별 평균 / 전체 평균
  const monthBuckets = {};
  for (const x of pastMonths) {
    if (!monthBuckets[x.m]) monthBuckets[x.m] = [];
    monthBuckets[x.m].push(x.t);
  }
  const seasonal = {};
  for (let m = 1; m <= 12; m++) {
    if (monthBuckets[m] && monthBuckets[m].length > 0) {
      const avg = monthBuckets[m].reduce((a,b)=>a+b,0) / monthBuckets[m].length;
      seasonal[m] = avg / mean; // 1.0 = 평균, >1 = 해당월 사고 많음
    } else {
      seasonal[m] = 1.0;
    }
  }
  
  // 잔차 표준편차 (회귀선으로부터)
  let sumSqErr = 0;
  for (let i = 0; i < n; i++) {
    const predicted = (intercept + slope * i) * seasonal[pastMonths[i].m];
    sumSqErr += Math.pow(pastM[i] - predicted, 2);
  }
  const residualStd = Math.sqrt(sumSqErr / Math.max(n - 2, 1));
  const std = Math.sqrt(pastM.reduce((s,x)=>s+Math.pow(x-mean,2),0) / (pastM.length - 1));
  
  // 2026년 5~12월 예측값 생성 (월별)
  const projMonths = [];
  for (let m = 5; m <= 12; m++) {
    const t_idx = 24 + (m - 1); // 2024-01부터 누적 월 인덱스
    const trendVal = Math.max(intercept + slope * t_idx, 0);
    const predicted = Math.max(Math.round(trendVal * seasonal[m]), 0);
    projMonths.push({ m, predicted, low: Math.max(Math.round(predicted - residualStd), 0), high: Math.round(predicted + residualStd) });
  }
  
  // 연간 누계 예측 (2026 1~4월 실적 + 5~12월 예측)
  const cur2026 = monthly.filter(x => x.y === 2026).reduce((s,x)=>s+x.t, 0);
  const projSum = projMonths.reduce((s,p)=>s+p.predicted, 0);
  const projLowSum = projMonths.reduce((s,p)=>s+p.low, 0);
  const projHighSum = projMonths.reduce((s,p)=>s+p.high, 0);
  
  const projection = {
    center: Math.round(cur2026 + projSum),
    low: Math.max(Math.round(cur2026 + projLowSum), kpis.y2026),
    high: Math.round(cur2026 + projHighSum),
    past_avg_per_month: Math.round(mean * 10) / 10,
    past_std: Math.round(std * 10) / 10,
    slope: Math.round(slope * 100) / 100,  // 월별 증가량
    intercept: Math.round(intercept * 10) / 10,
    residual_std: Math.round(residualStd * 10) / 10,
    seasonal: seasonal,
    monthly_predictions: projMonths,  // 각 월별 예측값
  };
  
  // v5 extras
  const v5Extras = computeV5Extras(sales, all, storesData);
  
  // Merge with store data if available
  let storeExtras = {};
  if (storesData && storesData.length > 0) {
    storeExtras = computeStoreMerged(sales, storesData, workersData);
  } else if (workersData) {
    // 매장DB 없이도 근로자DB만 있으면 팀별 IR 보강 (매장 커버리지는 사고DB의 matched stores로 대체)
    storeExtras = computeStoreMerged(sales, [], workersData);
  }

  // 근로자 KPI는 별도 노출 (매장DB 유무와 무관)
  if (workersData && workersData.kpis) {
    storeExtras.worker_kpis = workersData.kpis;
  }

  return {
    kpis, yearly, monthly, depts, teams, stores, weekday, wd_month,
    cross, crossTypes: topTypes, crossCauses: topCauses, ageTenure, deptType,
    gender, genderType, emp, empType, kind, site,
    costType, costDept: {}, risk, keywords, projection,
    injury, injury_s, injury_j, cause, cause_s, cause_j,
    age, age_s, age_j, tenure, tenure_s, tenure_j,
    accidents: all,   // 매장 상세 패널 · Gemini 프롬프트용 원본 레코드
    ...storeExtras,
    ...v5Extras,
  };
}

export { groupBy, countBy, topN, severityClass, cleanParjang, extractSigungu, computeV5Extras, processAccidents };
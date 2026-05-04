const SUDOGWON_DEPTS = ["강남/구리영업부","강북영업부","관악/평택/안산영업부","수원/용인영업부","인천영업부"];
const JIBANG_DEPTS = ["강원영업부","경남영업부","경북영업부","충청영업부","호남영업부"];
const WD_NAMES = ["월","화","수","목","금","토","일"];

function categorizeBum(dept) {
  if (SUDOGWON_DEPTS.includes(dept)) return "수도권";
  if (JIBANG_DEPTS.includes(dept)) return "지방";
  return "기타";
}

function parseTenure(val) {
  if (val == null || val === "") return null;
  const s = String(val).replace(/년/g, "").trim();
  const n = parseFloat(s);
  return isNaN(n) || n > 50 ? null : Math.floor(n);
}

function tenureBucket(v) {
  if (v == null) return "미상";
  if (v < 1) return "1년 미만";
  if (v < 3) return "1-2년";
  if (v < 5) return "3-4년";
  if (v < 10) return "5-9년";
  if (v < 15) return "10-14년";
  return "15년 이상";
}

function sizeBucket(a) {
  if (a == null || isNaN(a)) return "미상";
  if (a < 100) return "소형(~100평)";
  if (a < 250) return "중형(100-250)";
  if (a < 400) return "대형(250-400)";
  return "특대(400+)";
}

function ageBucket(dt) {
  if (!dt || isNaN(dt)) return "미상";
  const years = (new Date("2026-04-23") - dt) / (365 * 24 * 3600 * 1000);
  if (years < 1) return "1년 미만";
  if (years < 3) return "1-3년";
  if (years < 5) return "3-5년";
  if (years < 10) return "5-10년";
  return "10년+";
}

function extractSido(addr) {
  if (!addr) return null;
  const m = String(addr).trim().match(/^(\S+?(?:광역시|특별시|특별자치시|특별자치도|도|시))/);
  return m ? m[1] : null;
}

function parseDate(val) {
  if (!val) return null;
  if (val instanceof Date) return val;
  if (typeof val === "number") {
    // Excel serial date
    return new Date((val - 25569) * 86400 * 1000);
  }
  const d = new Date(val);
  return isNaN(d) ? null : d;
}

// ════════════════════════════════════════════════════════════
// 데이터 양식 표준화 — 스키마·검증·템플릿
// ════════════════════════════════════════════════════════════

export { SUDOGWON_DEPTS, JIBANG_DEPTS, WD_NAMES, categorizeBum, parseTenure, tenureBucket, sizeBucket, ageBucket, extractSido, parseDate };
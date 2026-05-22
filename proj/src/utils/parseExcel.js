import * as XLSX from 'xlsx';

function parseExcelFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
        resolve(rows);
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// 매장근로자DB 전용 파서 — '영업부' 시트 우선 (없으면 첫 시트)
function parseExcelFileWorkers(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array", cellDates: true });
        const targetSheet = wb.SheetNames.includes("영업부") ? "영업부" : wb.SheetNames[0];
        const ws = wb.Sheets[targetSheet];
        const rows = XLSX.utils.sheet_to_json(ws, { defval: null, raw: false });
        resolve({ rows, sheet: targetSheet, allSheets: wb.SheetNames });
      } catch (err) { reject(err); }
    };
    reader.onerror = reject;
    reader.readAsArrayBuffer(file);
  });
}

// PII 마스킹: 사번 → FNV-1a 해시 (deterministic, sync, 약 13K 레코드 충분)
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

export { parseExcelFile, parseExcelFileWorkers };
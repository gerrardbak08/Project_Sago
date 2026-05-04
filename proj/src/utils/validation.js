import { SCHEMA_ACCIDENT, SCHEMA_STORE, SCHEMA_WORKER, SCHEMA_CUSTOMER } from '../constants/schemas.js';
import * as XLSX from 'xlsx';

function downloadTemplate(schema) {
  if (typeof XLSX === "undefined") {
    alert("XLSX 라이브러리 로딩 중. 잠시 후 다시 시도해주세요.");
    return;
  }
  const allCols = [...schema.required, ...schema.optional];
  // 헤더 행
  const headers = allCols.map(c => c.col);
  // 안내 행 (필수/선택 + type + note)
  const guideRow = allCols.map(c => {
    const tag = schema.required.includes(c) ? "[필수]" : "[선택]";
    return `${tag} ${c.type}${c.note ? " - " + c.note : ""}`;
  });
  // 빈 데이터 행 1개
  const emptyRow = allCols.map(() => "");
  
  const aoa = [headers, guideRow, emptyRow];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  // 안내 행 스타일 (회색 음영) — XLSX 라이브러리가 스타일 지원 시
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, schema.sheet);
  XLSX.writeFile(wb, `${schema.filename}.xlsx`);
}

// ── 업로드된 파일 컬럼 검증 ──
function validateSchema(rows, schema) {
  if (!rows || rows.length === 0) {
    return { ok: false, errors: ["파일에 데이터 행이 없습니다."], warnings: [], stats: null };
  }
  // 첫 행에서 컬럼 추출 (rows[0]이 안내 행이면 rows[1])
  let headers = Object.keys(rows[0] || {});
  // 안내 행 필터링: 첫 행 값이 "[필수]" 같은 패턴으로 시작하는지
  let dataRows = rows;
  const firstVal = Object.values(rows[0])[0];
  if (typeof firstVal === "string" && (firstVal.startsWith("[필수]") || firstVal.startsWith("[선택]"))) {
    dataRows = rows.slice(1);
  }
  
  const errors = [];
  const warnings = [];
  
  // 필수 컬럼 누락 체크
  const missingRequired = schema.required.filter(c => !headers.includes(c.col));
  if (missingRequired.length > 0) {
    errors.push(`필수 컬럼 누락 (${missingRequired.length}개): ${missingRequired.map(c => `\"${c.col}\"`).join(", ")}`);
  }
  
  // 선택 컬럼 누락 (경고)
  const missingOptional = schema.optional.filter(c => !headers.includes(c.col));
  if (missingOptional.length > 0) {
    warnings.push(`선택 컬럼 ${missingOptional.length}개 누락 (분석 일부 기능 제한): ${missingOptional.map(c => c.col).slice(0, 5).join(", ")}${missingOptional.length > 5 ? " 외 " + (missingOptional.length - 5) + "개" : ""}`);
  }
  
  // 알 수 없는 컬럼 (경고)
  const allKnown = [...schema.required.map(c => c.col), ...schema.optional.map(c => c.col)];
  const unknown = headers.filter(h => !allKnown.includes(h) && h !== "_안내" && !h.startsWith("__EMPTY"));
  if (unknown.length > 0) {
    warnings.push(`정의되지 않은 컬럼 ${unknown.length}개 (무시됨): ${unknown.slice(0, 3).join(", ")}${unknown.length > 3 ? " 외" : ""}`);
  }
  
  // 데이터 행 표본 검증 (최대 5건)
  const sampleSize = Math.min(5, dataRows.length);
  let invalidRows = 0;
  for (let i = 0; i < sampleSize; i++) {
    const r = dataRows[i];
    for (const c of schema.required) {
      if (!headers.includes(c.col)) continue;
      const v = r[c.col];
      if (v == null || v === "") {
        invalidRows++;
        break;
      }
    }
  }
  if (invalidRows > 0) {
    warnings.push(`표본 ${sampleSize}행 중 ${invalidRows}행에 필수 값 누락 (가능하면 채워주세요)`);
  }
  
  return {
    ok: errors.length === 0,
    errors,
    warnings,
    stats: {
      totalRows: dataRows.length,
      headerCount: headers.length,
      requiredFound: schema.required.length - missingRequired.length,
      requiredTotal: schema.required.length,
      optionalFound: schema.optional.length - missingOptional.length,
      optionalTotal: schema.optional.length,
    },
  };
}

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
export { downloadTemplate, validateSchema };
function yoy(curr, prev) {
  if (!prev || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

// ===========================================================================
// === 연도 필터 적용 헬퍼: 누적 데이터를 기간 비례로 변환 ===
// 실제 연도별 breakdown DB 연동 전까지 사용하는 임시 추정 로직
// ===========================================================================

// 객체 타입 (예: {넘어짐: 156, 무리한 동작: 96}) 비례 축소
function scaleObj(obj, ratio) {
  if (!obj) return obj;
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    out[k] = typeof v === "number" ? Math.round(v * ratio) : v;
  }
  return out;
}

// 배열 행에서 숫자 필드만 비례 축소 (문자 키는 유지)
function scaleRow(row, ratio, skipKeys = []) {
  const out = {};
  for (const [k, v] of Object.entries(row)) {
    if (skipKeys.includes(k)) { out[k] = v; continue; }
    if (typeof v === "number") out[k] = Math.round(v * ratio);
    else out[k] = v;
  }
  return out;
}

// IR 재계산 (incidents/stores * 100)
function recalcRate(row) {
  let out = row;
  if (row.stores && row.stores > 0 && row.incidents !== undefined) {
    const r = Math.round(row.incidents / row.stores * 1000) / 10;
    out = { ...out, rate: r };
    if (row.coverage_rate !== undefined) out.coverage_rate = r;
  } else if (row.stores_count && row.stores_count > 0 && row.incidents !== undefined) {
    const r = Math.round(row.incidents / row.stores_count * 1000) / 10;
    out = { ...out, rate: r };
    if (row.coverage_rate !== undefined) out.coverage_rate = r;
  }
  // per-100 worker IR 재계산 — 인원수 1명 이상이면 모두 산출 (신뢰구간 플래그 부여)
  if (out.workers !== undefined && out.workers > 0 && out.incidents !== undefined) {
    out = {
      ...out,
      ir_per100: Math.round(out.incidents / out.workers * 100 * 100) / 100,
      ir_reliability: out.workers >= 20 ? "high" : out.workers >= 5 ? "low" : "unstable",
    };
  }
  return out;
}

// 메인 필터 함수
export { yoy, scaleObj, scaleRow, recalcRate };
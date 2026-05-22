import { LOSS_DAYS_ESTIMATE, MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../constants/metrics.js';

function estimateLossDays(dx) {
  if (!dx || dx === "-") return LOSS_DAYS_ESTIMATE.default;
  const s = String(dx);
  for (const [k, v] of Object.entries(LOSS_DAYS_ESTIMATE)) {
    if (k === "default") continue;
    if (s.includes(k)) return v;
  }
  return LOSS_DAYS_ESTIMATE.default;
}

// 재무손실 계산 (상병명 → 추정 근로손실일수 × 연도별 최저시급 일급 × 간접비계수)
function computeFinancialLoss(incidents) {
  let totalDays = 0, minLoss = 0, fullLoss = 0;
  for (const a of incidents) {
    const days = estimateLossDays(a.dx || a.site);
    const wage = MIN_WAGE_DAY[a.year] || MIN_WAGE_DAY[CURRENT_YEAR];
    totalDays += days;
    minLoss += days * wage;
    fullLoss += days * wage * (1 + INDIRECT_COST_MULTIPLIER);
  }
  return { totalDays, minLoss, fullLoss, equivalentSales: fullLoss / OPERATING_MARGIN };
}

// 원 단위 포맷 (억/만 자동 선택)
function fmtKRW(n) {
  if (!n || n === 0) return "0원";
  if (n >= 1e8) return `${(n/1e8).toFixed(1)}억원`;
  if (n >= 1e4) return `${(n/1e4).toFixed(0)}만원`;
  return `${Math.round(n).toLocaleString()}원`;
}

// 숫자 축약 (1234567 → 123만)
function fmtShort(n) {
  if (!n && n !== 0) return "-";
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${(n/1e8).toFixed(1)}억`;
  if (abs >= 1e4) return `${(n/1e4).toFixed(0)}만`;
  return n.toLocaleString();
}

// 근로자 수 추정 (1337 매장 × 평균 5명, 실제 DB 미연동)
const WORKER_COUNT_ESTIMATE = 1337 * 5;

// ===== 매장 위험지도 데이터 =====
// 매장현황DB 1,337개 + 사고DB 연도별 집계
export { estimateLossDays, computeFinancialLoss, fmtKRW, fmtShort };
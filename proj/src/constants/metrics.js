const MIN_WAGE_DAY = { 2022: 73280, 2023: 76960, 2024: 78880, 2025: 80240, 2026: 82560 };
const CURRENT_YEAR = 2026;
const INDIRECT_COST_MULTIPLIER = 4; // Heinrich 보수적 기본값 (직접:간접=1:4)
const OPERATING_MARGIN = 0.03; // 다이소 영업이익률 추정 3%

// 근로손실일수 추정 (상병명 키워드 기반 fallback, 실제 DB 제공 전까지 사용)
const LOSS_DAYS_ESTIMATE = {
  "골절": 90, "파열": 60, "진탕": 30, "추간판": 60, "척추": 120, "탈구": 45, "절단": 120,
  "염좌": 21, "긴장": 14, "타박": 10, "열린": 14, "열상": 14, "통증": 10, "좌상": 14, "찰과": 7,
  default: 21
};
export { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, LOSS_DAYS_ESTIMATE };

const MIN_WAGE_DAY = { 2022: 73280, 2023: 76960, 2024: 78880, 2025: 80240, 2026: 82560 };
const CURRENT_YEAR = 2026;
const INDIRECT_COST_MULTIPLIER = 4; // Heinrich 보수적 기본값 (직접:간접=1:4)
const OPERATING_MARGIN = 0.03; // 다이소 영업이익률 추정 3%

// ★ 추정손실 기준 — [사용자 추후 제공] 매장 인당 1일 생산성 비용(원).
//   값이 설정되면 추정 재무손실 = 실측 근로손실일수 × 이 값 으로 자동 전환되고,
//   하인리히 4배(일급×최저시급) 모델은 대체된다. null이면 현행(임시) 모델 유지.
const DAILY_VALUE_PER_WORKER = null;

// 법정 요양근로손실일수 — 「산업재해통계업무처리규정」(고용노동부예규 제190호) 별표1.
// ⚠️ 이 값은 '강도율'(안전성과 지표) 전용 정액치다. 금액(EAL) 환산에 쓰지 말 것 —
//    한국 공식 경제적 손실액은 산재보험 급여(유족보상 1,300일분+장의비 120일분)×5로 별도 산정한다.
//    사망은 EAL 집계에서 제외하고 건수+이 일수로만 별도 표기한다. (설계문서 §9.2)
const DEATH_LOSS_DAYS = 7500;

// 근로손실일수 추정 (상병명 키워드 기반 fallback, 실제 DB 제공 전까지 사용)
const LOSS_DAYS_ESTIMATE = {
  "골절": 90, "파열": 60, "진탕": 30, "추간판": 60, "척추": 120, "탈구": 45, "절단": 120,
  "염좌": 21, "긴장": 14, "타박": 10, "열린": 14, "열상": 14, "통증": 10, "좌상": 14, "찰과": 7,
  default: 21
};
export { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, LOSS_DAYS_ESTIMATE, DAILY_VALUE_PER_WORKER, DEATH_LOSS_DAYS };

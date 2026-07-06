// 사고절감 목표대비 진척 계산 (순수함수) — 대시보드 배지·정기 브리핑 공통.
// 사고는 '적을수록 좋음' → target은 감축된 목표건수, actual이 target 이하면 달성.
// 기존 ruleSummary.js YoY·PeriodComparison delta 패턴을 목표대비로 확장.

export const STATUS_LABEL = { exceed: '초과달성', met: '달성', near: '근접', miss: '미달', unknown: '—' };
export const STATUS_COLOR = { exceed: '#1C7A3E', met: '#2E8A57', near: '#C2410C', miss: '#D70011', unknown: '#9A8E84' };

/**
 * @param {{actual:number, target?:number|null, baseline?:number|null}} p
 *   actual=현재 실적 건수, target=목표 건수(감축치), baseline=기준연도(전년) 실적
 * @returns {{actual, target, baseline, delta, yoyDelta, yoyPct, achievedPct, status}}
 *   delta = actual - target  (+면 목표보다 많이 남음=나쁨, -면 목표보다 적음=좋음)
 *   achievedPct = 목표 절감분 대비 실제 절감 달성률 (>100 초과달성, <0 증가)
 *   status: exceed / met / near / miss / unknown
 */
export function computeProgress({ actual, target = null, baseline = null }) {
  const out = { actual, target, baseline, delta: null, yoyDelta: null, yoyPct: null, achievedPct: null, status: 'unknown' };
  if (target != null) out.delta = actual - target;
  if (baseline != null) {
    out.yoyDelta = actual - baseline;
    out.yoyPct = baseline > 0 ? Math.round((actual - baseline) / baseline * 1000) / 10 : null;
  }
  if (baseline != null && target != null && baseline - target !== 0) {
    out.achievedPct = Math.round((baseline - actual) / (baseline - target) * 1000) / 10;
  }
  if (target != null) {
    if (actual <= target) out.status = actual <= target * 0.95 ? 'exceed' : 'met';
    else if (actual <= target * 1.1) out.status = 'near';
    else out.status = 'miss';
  }
  return out;
}

// 목표대비 한 줄 문구 (알림톡 #{목표대비}·배지용)
export function formatVsTarget(p) {
  if (!p || p.delta == null) return '목표 미설정';
  if (p.delta < 0) return `${-p.delta}건 감축(목표 초과달성)`;
  if (p.delta === 0) return '목표 달성';
  return `▲${p.delta}건 초과`;
}

// YoY 한 줄 문구 (알림톡 #{전년대비}용)
export function formatYoy(p) {
  if (!p || p.yoyDelta == null) return '전년 데이터 없음';
  const sign = p.yoyDelta > 0 ? '+' : '';
  const pct = p.yoyPct != null ? ` (${sign}${p.yoyPct}%)` : '';
  return `${sign}${p.yoyDelta}건${pct}`;
}

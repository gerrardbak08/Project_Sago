// 연간 기대손실(EAL) 계산 엔진 — 순수 함수 모듈.
// React·데이터 import 없음. 설계문서: docs/superpowers/specs/2026-07-28-eal-risk-ranking-design.md
//
// 핵심: 사고 1건마다 연간 기여분(eal_i)을 배분해두면, 어떤 축으로 묶어도 단순 합산이라
//       전사 == Σ유형×장소 == Σ조직 가법성이 항상 성립한다.
import {
  MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, DAILY_VALUE_PER_WORKER,
} from '../constants/metrics.js';

// ── 손실 단가 ───────────────────────────────────────────────
// CostRisk.jsx가 이 함수를 import한다. 두 곳에서 정의하면 화면끼리 금액이 어긋난다.
export const USE_PRODUCTIVITY = DAILY_VALUE_PER_WORKER != null;
export const wageFor = (y) => MIN_WAGE_DAY[y] || MIN_WAGE_DAY[CURRENT_YEAR];
export const dayRate = (y) =>
  USE_PRODUCTIVITY ? DAILY_VALUE_PER_WORKER : wageFor(y) * (1 + INDIRECT_COST_MULTIPLIER);

// ── 판별 술어 ───────────────────────────────────────────────
// 사망 판별에 두 필드를 모두 보는 이유: LegalReporting은 kind를, EAL은 typeCanon을 쓴다.
// 두 필드가 갈리면 같은 대시보드가 서로 다른 사망 건수를 말하므로 validate-eal이 감시한다.
export const isFatal = (r) => r?.typeCanon === '사망' || r?.kind === '사망';
export const isSales = (r) => r?.bum === '수도권' || r?.bum === '지방';
export const salesOnly = (accidents) => (accidents || []).filter(isSales);

// KST(Asia/Seoul) 고정 포매터. 사고 데이터의 year/month가 KST 기준이므로
// "당월" 판정도 런타임 로컬 타임존이 아니라 KST로 고정해야 브라우저(KST)와
// UTC로 도는 CI/Node 스크립트가 같은 데이터에서 같은 관측 기간을 계산한다.
const KST_YM_FORMATTER = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit',
});
const kstYearMonth = (date) => KST_YM_FORMATTER.format(date); // "YYYY-MM"

// ── 관측 기간 ───────────────────────────────────────────────
// 진행 중인 당월은 분자·분모 양쪽에서 제외한다. 미완료 월을 온전한 1개월로 세면
// 빈도가 과소 추정되는데, 안전 지표에서 위험을 낮게 잡는 건 위험한 방향의 오차다.
export function observationPeriod(accidents, now = new Date()) {
  const EMPTY = { firstYm: null, lastCompleteYm: null, months: 0, years: 0 };
  const yms = [];
  for (const a of accidents || []) {
    const y = Number(a?.year), m = Number(a?.month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || y <= 0 || m < 1 || m > 12) continue;
    yms.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  if (!yms.length) return EMPTY;
  const currentYm = kstYearMonth(now);
  const complete = yms.filter((ym) => ym < currentYm).sort();
  if (!complete.length) return EMPTY;
  const firstYm = complete[0];
  const lastCompleteYm = complete[complete.length - 1];
  const [fy, fm] = firstYm.split('-').map(Number);
  const [ly, lm] = lastCompleteYm.split('-').map(Number);
  const months = (ly - fy) * 12 + (lm - fm) + 1;
  return { firstYm, lastCompleteYm, months, years: months / 12 };
}

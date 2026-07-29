// 연간 기대손실(EAL) 계산 엔진 — 순수 함수 모듈.
// React·데이터 import 없음. 설계문서: docs/superpowers/specs/2026-07-28-eal-risk-ranking-design.md
//
// 핵심: 사고 1건마다 연간 기여분(eal_i)을 배분해두면, 모든 비사망 레코드가 groupBy에서 non-null을 반환할 때
//       어떤 축으로 묶어도 단순 합산이라 전사 == Σ유형×장소 == Σ조직 가법성이 성립한다.
//       (결측이 있으면 해당 축의 합은 전사 총액과 달라진다.)
import {
  MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, DAILY_VALUE_PER_WORKER, DEATH_LOSS_DAYS,
} from '../constants/metrics.js';
import { sizeBucket } from './parseHelpers.js';

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

// ── 레코드 단위 EAL 배분 ────────────────────────────────────
// 그룹별 평균을 곱하는 방식은 축이 바뀌면 합계가 어긋난다. 레코드마다 연간 기여분을
// 미리 계산해두면 어떤 groupBy로 묶어도 단순 합산이라 가법성이 항상 성립한다.
//
// 사망은 1~3단계 전체에서 빠진다(typeMean 산출 시에도). 사유는 설계문서 §9.2.
export function withEal(accidents, period) {
  const T = period?.years || 0;
  const cutoff = period?.lastCompleteYm;
  if (!T || !cutoff) return [];

  const inRange = (accidents || []).filter((a) => {
    const y = Number(a?.year), m = Number(a?.month);
    if (!Number.isFinite(y) || !Number.isFinite(m)) return false;
    return `${y}-${String(m).padStart(2, '0')}` <= cutoff;
  });

  // 유형별 평균 (사망 제외, 관측치만)
  const sum = Object.create(null);
  const cnt = Object.create(null);
  let gSum = 0, gCnt = 0;
  for (const a of inRange) {
    if (isFatal(a) || !(a.loss_days > 0)) continue;
    const t = a.typeCanon;
    sum[t] = (sum[t] || 0) + a.loss_days;
    cnt[t] = (cnt[t] || 0) + 1;
    gSum += a.loss_days;
    gCnt++;
  }
  const globalMean = gCnt ? gSum / gCnt : 0;
  const typeMean = (t) => (cnt[t] ? sum[t] / cnt[t] : globalMean);

  return inRange.map((a) => {
    if (isFatal(a)) return { ...a, fatal: true, effLossDays: null, eal: 0 };
    const eff = a.loss_days > 0 ? a.loss_days : typeMean(a.typeCanon);
    return { ...a, fatal: false, effLossDays: eff, eal: (eff * dayRate(a.year)) / T };
  });
}

// ── 축별 집계 ───────────────────────────────────────────────
// 사망(fatal)은 어떤 축에도 계상하지 않는다. groupBy가 null/undefined를 주면 그 레코드는 건너뛴다.
export function sumEal(records, groupBy, period) {
  const T = period?.years || 0;
  const m = new Map();
  for (const r of records || []) {
    if (r.fatal) continue;
    const key = groupBy(r);
    if (key == null) continue;
    let g = m.get(key);
    if (!g) { g = { key, n: 0, eal: 0, _sum: 0, _cnt: 0 }; m.set(key, g); }
    g.n++;
    g.eal += r.eal;
    if (r.loss_days > 0) { g._sum += r.loss_days; g._cnt++; }
  }
  return [...m.values()]
    .map(({ _sum, _cnt, ...g }) => ({
      ...g,
      lambda: T ? g.n / T : 0,
      avgLossDays: _cnt ? Math.round(_sum / _cnt) : null,
    }))
    .sort((a, b) => b.eal - a.eal);
}

export function totalEal(records) {
  return (records || []).reduce((s, r) => (r.fatal ? s : s + r.eal), 0);
}

// ── 사망 레이어 ─────────────────────────────────────────────
// 금액이 아니라 건수 + 법정 요양근로손실일수(별표1)로만 표기한다. 설계문서 §9.2.
export function fatalitySummary(records) {
  const fatals = (records || []).filter((r) => r.fatal);
  return {
    n: fatals.length,
    statutoryLossDays: fatals.length * DEATH_LOSS_DAYS,
    records: fatals,
  };
}

// ── 매장별 신뢰도 가중 (Bühlmann) ───────────────────────────
// 매장 대부분이 사고 0건이라 실측 빈도를 그대로 쓰면 "과거에 없었으니 앞으로도 없다"는
// 잘못된 신호가 된다. 자기 실적과 동료집단(같은 평수 버킷) 평균을 건수에 따라 가중 혼합한다.
//
// ⚠️ 이 축만 peer 평균과 섞이므로 매장별 EAL 합계는 전사 총액과 일치하지 않는다.
//    0건 매장에 위험을 나눠주고 다발 매장에서 덜어내는 것이 목적이므로 의도된 동작이다.
//
// 건당 손실액은 전사 평균을 쓴다 — 매장별 평균은 표본이 1~2건이라 더 불안정하기 때문.
export function storeEal(records, stores, period, { k = 3 } = {}) {
  const T = period?.years || 0;
  if (!T || !stores?.length) return [];
  const kk = k > 0 ? k : 3;

  const nonFatal = (records || []).filter((r) => !r.fatal);
  const totalN = nonFatal.length;
  if (!totalN) return [];
  const lossPerIncident = (nonFatal.reduce((s, r) => s + r.eal, 0) * T) / totalN;

  const obs = new Map();
  for (const r of nonFatal) {
    if (!r.store) continue;
    obs.set(r.store, (obs.get(r.store) || 0) + 1);
  }

  const areaOf = new Map(stores.map((s) => [s.store, s.area]));
  const bucketStores = new Map();
  for (const s of stores) {
    const b = sizeBucket(s.area);
    bucketStores.set(b, (bucketStores.get(b) || 0) + 1);
  }
  const bucketIncidents = new Map();
  for (const [name, n] of obs) {
    const b = sizeBucket(areaOf.get(name));
    bucketIncidents.set(b, (bucketIncidents.get(b) || 0) + n);
  }
  const globalLambda = totalN / (stores.length * T);

  return stores
    .map((s) => {
      const n = obs.get(s.store) || 0;
      const b = sizeBucket(s.area);
      const bs = bucketStores.get(b) || 0;
      const lambdaPeer = bs > 0 ? (bucketIncidents.get(b) || 0) / (bs * T) : globalLambda;
      const Z = n / (n + kk);
      const lambda = Z * (n / T) + (1 - Z) * lambdaPeer;
      return { store: s.store, n, Z: Math.round(Z * 1000) / 1000, lambda, eal: lambda * lossPerIncident, bucket: b };
    })
    .sort((a, b) => b.eal - a.eal);
}

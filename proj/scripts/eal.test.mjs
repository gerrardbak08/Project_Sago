// eal.js 단위 테스트 — Node 내장 러너 (의존성 0)
// 실행: npm test   또는   node --test scripts/eal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wageFor, dayRate, isFatal, isSales, salesOnly, observationPeriod, withEal,
  sumEal, fatalitySummary, totalEal, storeEal,
} from '../src/utils/eal.js';

// ── 합성 픽스처 ─────────────────────────────────────────────
// 실데이터에 의존하지 않는다. 필드는 workerData.accidents 스키마를 따름.
const rec = (o = {}) => ({
  year: 2025, month: 3, typeCanon: '넘어짐', kind: '사고', locLabel: '계단',
  bum: '수도권', store: 'A점', dept: '인천영업부', team: '일산팀', loss_days: 10, ...o,
});

test('wageFor: 알려진 연도는 해당 일급, 미상 연도는 CURRENT_YEAR 폴백', () => {
  assert.equal(wageFor(2024), 78880);
  assert.equal(wageFor(2025), 80240);
  assert.equal(wageFor(1999), wageFor(2026));
});

test('dayRate: 하인리히 모델은 일급×5 (DAILY_VALUE_PER_WORKER=null 전제)', () => {
  assert.equal(dayRate(2025), 80240 * 5);
});

test('isFatal: typeCanon 또는 kind 중 하나만 사망이어도 참', () => {
  assert.equal(isFatal(rec({ typeCanon: '사망' })), true);
  assert.equal(isFatal(rec({ kind: '사망' })), true);
  assert.equal(isFatal(rec()), false);
  assert.equal(isFatal(null), false);
});

test('isSales/salesOnly: 수도권·지방만 통과, 기타부문 제외', () => {
  assert.equal(isSales(rec({ bum: '지방' })), true);
  assert.equal(isSales(rec({ bum: '기타' })), false);
  const out = salesOnly([rec(), rec({ bum: '지방' }), rec({ bum: '기타' })]);
  assert.equal(out.length, 2);
});

test('observationPeriod: 진행 중인 당월을 제외하고 완료월만 센다', () => {
  const accidents = [
    rec({ year: 2024, month: 1 }),
    rec({ year: 2026, month: 6 }),
    rec({ year: 2026, month: 7 }), // 당월 — 제외 대상
  ];
  const now = new Date('2026-07-29T00:00:00Z');
  const p = observationPeriod(accidents, now);
  assert.equal(p.firstYm, '2024-01');
  assert.equal(p.lastCompleteYm, '2026-06');
  assert.equal(p.months, 30);
  assert.equal(p.years, 2.5);
});

test('observationPeriod: 완료월이 없으면 years=0 (계산 생략 신호)', () => {
  const now = new Date('2026-07-29T00:00:00Z');
  const p = observationPeriod([rec({ year: 2026, month: 7 })], now);
  assert.equal(p.years, 0);
  assert.equal(p.lastCompleteYm, null);
});

test('observationPeriod: 빈 배열도 안전하게 0을 반환', () => {
  const p = observationPeriod([], new Date('2026-07-29T00:00:00Z'));
  assert.equal(p.years, 0);
});

test('observationPeriod: 당월 판정은 KST 고정 — UTC로는 7월이지만 KST로는 8월 1일', () => {
  // 2026-07-31T20:00:00Z = 2026-08-01T05:00:00+09:00 (KST)
  // UTC 기준으로 판정하면 당월이 2026-07이 되어 7월 데이터가 부당하게 제외된다.
  // KST 기준이면 당월은 2026-08이므로 2026-07은 완료월에 포함되어야 한다.
  const accidents = [rec({ year: 2026, month: 7 })];
  const now = new Date('2026-07-31T20:00:00Z');
  const p = observationPeriod(accidents, now);
  assert.equal(p.lastCompleteYm, '2026-07');
  assert.equal(p.months, 1);
  assert.equal(p.years, 1 / 12);
});

test('observationPeriod: year/month가 유효하지 않은 레코드는 무시하고 나머지로 계산', () => {
  const accidents = [
    rec({ year: 2026, month: 0 }), // month 하한 미만
    rec({ year: 2026, month: 13 }), // month 상한 초과
    rec({ year: null, month: 5 }), // year 결측
    rec({ year: 2026, month: 'abc' }), // month 비숫자
    rec({ year: 2025, month: 1 }), // 유효
    rec({ year: 2025, month: 3 }), // 유효
  ];
  const now = new Date('2026-07-29T00:00:00Z');
  const p = observationPeriod(accidents, now);
  assert.equal(p.firstYm, '2025-01');
  assert.equal(p.lastCompleteYm, '2025-03');
  assert.equal(p.months, 3);
});

const NOW = new Date('2026-07-29T00:00:00Z');

test('withEal: 관측된 손실일수는 그대로 쓰고 eal = 일수 × 단가 ÷ T', () => {
  const accidents = [rec({ year: 2025, month: 3, loss_days: 10 }), rec({ year: 2024, month: 1 })];
  const p = observationPeriod(accidents, NOW);          // 2024-01~2025-03 = 15개월 = 1.25년
  const out = withEal(accidents, p);
  const target = out.find((r) => r.year === 2025);
  assert.equal(target.effLossDays, 10);
  assert.equal(target.eal, 10 * dayRate(2025) / p.years);
});

test('withEal: 손실일수 결측은 같은 유형의 관측 평균으로 보정', () => {
  const accidents = [
    rec({ year: 2024, month: 1, typeCanon: '넘어짐', loss_days: 20 }),
    rec({ year: 2024, month: 2, typeCanon: '넘어짐', loss_days: 40 }),
    rec({ year: 2024, month: 3, typeCanon: '넘어짐', loss_days: null }), // 보정 대상 → 30
  ];
  const p = observationPeriod(accidents, NOW);
  const out = withEal(accidents, p);
  assert.equal(out.find((r) => r.month === 3).effLossDays, 30);
});

test('withEal: 해당 유형에 관측이 하나도 없으면 전사 평균으로 폴백', () => {
  const accidents = [
    rec({ year: 2024, month: 1, typeCanon: '넘어짐', loss_days: 60 }),
    rec({ year: 2024, month: 2, typeCanon: '끼임', loss_days: null }), // 끼임 관측 0 → 전사평균 60
  ];
  const p = observationPeriod(accidents, NOW);
  const out = withEal(accidents, p);
  assert.equal(out.find((r) => r.typeCanon === '끼임').effLossDays, 60);
});

test('withEal: 사망은 eal=0이고 typeMean 산출에서도 빠진다', () => {
  const accidents = [
    rec({ year: 2024, month: 1, typeCanon: '넘어짐', loss_days: 10 }),
    rec({ year: 2024, month: 2, typeCanon: '사망', kind: '사망', loss_days: null }),
    rec({ year: 2024, month: 3, typeCanon: '넘어짐', loss_days: null }),
  ];
  const p = observationPeriod(accidents, NOW);
  const out = withEal(accidents, p);
  const death = out.find((r) => r.fatal);
  assert.equal(death.eal, 0);
  assert.equal(death.effLossDays, null);
  // 사망이 평균을 오염시키지 않았는지 — 넘어짐 결측은 10일로 보정되어야 함
  assert.equal(out.find((r) => r.month === 3).effLossDays, 10);
});

test('withEal: 완료월을 넘어선 당월 레코드는 결과에서 제외', () => {
  const accidents = [rec({ year: 2024, month: 1 }), rec({ year: 2026, month: 7 })];
  const p = observationPeriod(accidents, NOW);
  const out = withEal(accidents, p);
  assert.equal(out.length, 1);
  assert.equal(out[0].year, 2024);
});

test('withEal: 관측 기간이 0이면 빈 배열', () => {
  assert.deepEqual(withEal([rec({ year: 2026, month: 7 })], { years: 0, lastCompleteYm: null }), []);
});

test('sumEal: 그룹별 합산 결과가 eal 내림차순으로 정렬된다', () => {
  const accidents = [
    rec({ year: 2024, month: 1, typeCanon: '넘어짐', locLabel: '계단', loss_days: 100 }),
    rec({ year: 2024, month: 2, typeCanon: '베임', locLabel: '매장·매대', loss_days: 10 }),
  ];
  const p = observationPeriod(accidents, NOW);
  const out = sumEal(withEal(accidents, p), (r) => `${r.typeCanon}|${r.locLabel}`, p);
  assert.equal(out[0].key, '넘어짐|계단');
  assert.equal(out[0].n, 1);
  assert.ok(out[0].eal > out[1].eal);
});

test('sumEal: 가법성 — 축을 바꿔도 전체 합이 같다', () => {
  const accidents = [
    rec({ year: 2024, month: 1, typeCanon: '넘어짐', locLabel: '계단', dept: 'A부', loss_days: 30 }),
    rec({ year: 2024, month: 2, typeCanon: '베임', locLabel: '매장·매대', dept: 'B부', loss_days: 20 }),
    rec({ year: 2024, month: 3, typeCanon: '넘어짐', locLabel: '계단', dept: 'B부', loss_days: null }),
  ];
  const p = observationPeriod(accidents, NOW);
  const recs = withEal(accidents, p);
  const byLoc = sumEal(recs, (r) => `${r.typeCanon}|${r.locLabel}`, p).reduce((s, g) => s + g.eal, 0);
  const byDept = sumEal(recs, (r) => r.dept, p).reduce((s, g) => s + g.eal, 0);
  assert.ok(Math.abs(byLoc - byDept) < 1e-6);
  assert.ok(Math.abs(byLoc - totalEal(recs)) < 1e-6);
});

test('sumEal: lambda는 연간 건수, avgLossDays는 관측분 평균', () => {
  const accidents = [
    rec({ year: 2024, month: 1, loss_days: 20 }),
    rec({ year: 2024, month: 2, loss_days: 40 }),
    rec({ year: 2024, month: 12, loss_days: null }),
  ];
  const p = observationPeriod(accidents, NOW);              // 2024-01~2024-12 = 1년
  const out = sumEal(withEal(accidents, p), () => 'all', p);
  assert.equal(out[0].n, 3);
  assert.equal(out[0].lambda, 3);
  assert.equal(out[0].avgLossDays, 30);
});

test('sumEal: 사망은 어떤 그룹에도 계상되지 않는다', () => {
  const accidents = [
    rec({ year: 2024, month: 1, loss_days: 10 }),
    rec({ year: 2024, month: 2, typeCanon: '사망', kind: '사망', loss_days: null }),
  ];
  const p = observationPeriod(accidents, NOW);
  const out = sumEal(withEal(accidents, p), (r) => r.typeCanon, p);
  assert.equal(out.length, 1);
  assert.equal(out.find((g) => g.key === '사망'), undefined);
});

test('sumEal: groupBy가 null을 반환하면 그 레코드는 건너뛴다', () => {
  const accidents = [rec({ year: 2024, month: 1, loss_days: 10, store: null })];
  const p = observationPeriod(accidents, NOW);
  assert.equal(sumEal(withEal(accidents, p), (r) => r.store, p).length, 0);
});

test('fatalitySummary: 건수와 법정 요양근로손실일수(7500×건)를 반환', () => {
  const accidents = [
    rec({ year: 2024, month: 1, loss_days: 10 }),
    rec({ year: 2024, month: 2, typeCanon: '사망', kind: '사망', loss_days: null }),
  ];
  const p = observationPeriod(accidents, NOW);
  const f = fatalitySummary(withEal(accidents, p));
  assert.equal(f.n, 1);
  assert.equal(f.statutoryLossDays, 7500);
  assert.equal(f.records[0].store, 'A점');
});

const STORES = [
  { store: 'A점', area: 150 }, { store: 'B점', area: 160 },
  { store: 'C점', area: 170 }, { store: 'D점', area: 180 },
];

test('storeEal: 사고 0건 매장도 EAL이 0이 아니다 (동료집단 평균으로 수렴)', () => {
  const accidents = [
    rec({ year: 2024, month: 1, store: 'A점', loss_days: 30 }),
    rec({ year: 2024, month: 6, store: 'A점', loss_days: 30 }),
    rec({ year: 2024, month: 12, store: 'B점', loss_days: 30 }),
  ];
  const p = observationPeriod(accidents, NOW);
  const out = storeEal(withEal(accidents, p), STORES, p);
  const c = out.find((s) => s.store === 'C점');
  assert.equal(c.n, 0);
  assert.equal(c.Z, 0);
  assert.ok(c.eal > 0, '0건 매장도 peer 평균 기반 EAL을 가져야 한다');
});

test('storeEal: Z는 [0,1] 범위이고 건수에 따라 단조증가', () => {
  const accidents = [
    rec({ year: 2024, month: 1, store: 'A점', loss_days: 10 }),
    rec({ year: 2024, month: 2, store: 'A점', loss_days: 10 }),
    rec({ year: 2024, month: 3, store: 'A점', loss_days: 10 }),
    rec({ year: 2024, month: 4, store: 'B점', loss_days: 10 }),
    rec({ year: 2024, month: 12, store: 'C점', loss_days: 10 }),
  ];
  const p = observationPeriod(accidents, NOW);
  const out = storeEal(withEal(accidents, p), STORES, p);
  for (const s of out) assert.ok(s.Z >= 0 && s.Z <= 1, `Z 범위 위반: ${s.Z}`);
  const a = out.find((s) => s.store === 'A점');   // n=3
  const b = out.find((s) => s.store === 'B점');   // n=1
  const d = out.find((s) => s.store === 'D점');   // n=0
  assert.ok(a.Z > b.Z && b.Z > d.Z);
});

test('storeEal: k=3 기본값 — n=3이면 Z=0.5', () => {
  const accidents = [1, 2, 3].map((m) => rec({ year: 2024, month: m, store: 'A점', loss_days: 10 }))
    .concat(rec({ year: 2024, month: 12, store: 'B점', loss_days: 10 }));
  const p = observationPeriod(accidents, NOW);
  const out = storeEal(withEal(accidents, p), STORES, p);
  assert.equal(out.find((s) => s.store === 'A점').Z, 0.5);
});

test('storeEal: k를 키우면 자기 실적 비중(Z)이 줄어든다', () => {
  const accidents = [1, 2, 3].map((m) => rec({ year: 2024, month: m, store: 'A점', loss_days: 10 }))
    .concat(rec({ year: 2024, month: 12, store: 'B점', loss_days: 10 }));
  const p = observationPeriod(accidents, NOW);
  const recs = withEal(accidents, p);
  const z3 = storeEal(recs, STORES, p, { k: 3 }).find((s) => s.store === 'A점').Z;
  const z9 = storeEal(recs, STORES, p, { k: 9 }).find((s) => s.store === 'A점').Z;
  assert.ok(z9 < z3);
});

test('storeEal: k=0을 넘겨도 기본값 3으로 방어', () => {
  const accidents = [1, 2, 3].map((m) => rec({ year: 2024, month: m, store: 'A점', loss_days: 10 }))
    .concat(rec({ year: 2024, month: 12, store: 'B점', loss_days: 10 }));
  const p = observationPeriod(accidents, NOW);
  assert.equal(storeEal(withEal(accidents, p), STORES, p, { k: 0 }).find((s) => s.store === 'A점').Z, 0.5);
});

test('storeEal: 사망 건은 매장 집계에 포함되지 않는다', () => {
  const accidents = [
    rec({ year: 2024, month: 1, store: 'A점', loss_days: 10 }),
    rec({ year: 2024, month: 2, store: 'A점', typeCanon: '사망', kind: '사망', loss_days: null }),
    rec({ year: 2024, month: 12, store: 'B점', loss_days: 10 }),
  ];
  const p = observationPeriod(accidents, NOW);
  assert.equal(storeEal(withEal(accidents, p), STORES, p).find((s) => s.store === 'A점').n, 1);
});

// eal.js 단위 테스트 — Node 내장 러너 (의존성 0)
// 실행: npm test   또는   node --test scripts/eal.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  wageFor, dayRate, isFatal, isSales, salesOnly, observationPeriod,
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

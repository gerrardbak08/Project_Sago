# 연간 기대손실(EAL) 리스크 정량화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 사고 리스크를 연간 기대손실(EAL) 금액으로 환산해, 평균 휴업일수로만 정렬되던 리스크 랭킹을 실제 손실 기여도 순으로 바로잡는다.

**Architecture:** 순수 함수 모듈 `src/utils/eal.js`가 사고 레코드마다 연간 기대손실 기여분(`eal_i`)을 배분하고, 화면은 `useMemo`로 원하는 축에 따라 합산만 한다. 레코드 단위 배분이라 어떤 축으로 묶어도 합계가 항상 정합한다. 사망 재해는 금액 축에서 제외하고 건수·법정일수로 별도 표기한다.

**Tech Stack:** JavaScript (ESM), React 18 + Vite, `node:test`(내장, 의존성 0), 기존 상수 `src/constants/metrics.js`

**설계 문서:** `docs/superpowers/specs/2026-07-28-eal-risk-ranking-design.md`

## Global Constraints

- **모수는 영업부문 고정** — `bum === '수도권' || bum === '지방'` (620건). 기존 `location`·`subCause` 집계와 동일해야 하며, 전체 646건을 쓰면 같은 화면에서 숫자가 어긋난다.
- **관측 기간 T** — 최초 월 ~ **마지막 완료 월**. 진행 중인 당월은 분자·분모 양쪽에서 제외. 현재 데이터 기준 2024-01~2026-06 = 30개월 = 2.5년, 609건.
- **사망 제외** — `isFatal(rec)`인 레코드는 EAL 집계·결측 보정·`typeMean` 산출 전 단계에서 빠진다. 별도 레이어로만 노출.
- **`dayRate` 단일 출처** — `eal.js`가 정의하고 `CostRisk.jsx`가 import. 두 곳에서 정의 금지.
- **무배지 방침** — 경고 배너·추정 배지 추가 금지. 모든 caveat는 카드 부제 라벨로만 전달. `Card.jsx`의 `EstimateBadge`는 `return null`로 강제돼 있으니 되살리지 말 것.
- **모든 EAL 카드 부제에 산출 근거 기간 명시** — 예: `관측 2024-01~2026-06 · 2.5년 · 영업부문 620건 기준`
- **테스트 러너는 Node 내장 `node:test`** — vitest 등 신규 의존성 추가 금지(별건 CI 과제). `node --test` 로 실행.
- **커밋 메시지는 한국어**, 기존 컨벤션(`feat:`/`fix:`/`test:`) 따름.

---

## File Structure

| 파일 | 책임 |
|---|---|
| `proj/src/utils/eal.js` (신규) | 계산 엔진 전체. 순수 함수만, React·데이터 import 없음. 의존은 `constants/metrics.js` + `utils/parseHelpers.js` |
| `proj/scripts/eal.test.mjs` (신규) | `eal.js` 단위 테스트. 합성 픽스처 사용, 실데이터 비의존 |
| `proj/scripts/validate-eal.mjs` (신규) | 실데이터 불변식 리포트 (스펙 §8의 7개 항목) |
| `proj/src/constants/metrics.js` (수정) | `DEATH_LOSS_DAYS = 7500` 추가 |
| `proj/src/components/tabs/worker/CostRisk.jsx` (수정) | `dayRate` import 전환 + EAL KPI + 중대재해 타일 + 매장 Top 20 |
| `proj/src/components/tabs/worker/CrossAnalysis.jsx` (수정) | 고위험 조합을 런타임 EAL 집계로 재구성 |
| `proj/src/components/tabs/worker/DeptTeamStore.jsx` (수정) | 부서·팀 테이블에 EAL 컬럼 |
| `proj/package.json` (수정) | `test`, `validate:eal` 스크립트 |

---

## Task 1: 상수 + 기간·단가·사망판별 기초 함수

**Files:**
- Create: `proj/src/utils/eal.js`
- Create: `proj/scripts/eal.test.mjs`
- Modify: `proj/src/constants/metrics.js`
- Modify: `proj/package.json`

**Interfaces:**
- Consumes: `MIN_WAGE_DAY`, `CURRENT_YEAR`, `INDIRECT_COST_MULTIPLIER`, `DAILY_VALUE_PER_WORKER` (기존 `metrics.js`)
- Produces:
  - `DEATH_LOSS_DAYS: number` (metrics.js)
  - `wageFor(year: number) => number`
  - `dayRate(year: number) => number`
  - `USE_PRODUCTIVITY: boolean`
  - `isFatal(rec: object) => boolean`
  - `isSales(rec: object) => boolean`
  - `salesOnly(accidents: object[]) => object[]`
  - `observationPeriod(accidents: object[], now?: Date) => { firstYm, lastCompleteYm, months, years }`

- [ ] **Step 1: `metrics.js`에 법정 상수 추가**

`proj/src/constants/metrics.js`의 `DAILY_VALUE_PER_WORKER` 선언 바로 아래에 추가하고, 마지막 `export` 목록에도 이름을 넣는다.

```js
// 법정 요양근로손실일수 — 「산업재해통계업무처리규정」(고용노동부예규 제190호) 별표1.
// ⚠️ 이 값은 '강도율'(안전성과 지표) 전용 정액치다. 금액(EAL) 환산에 쓰지 말 것 —
//    한국 공식 경제적 손실액은 산재보험 급여(유족보상 1,300일분+장의비 120일분)×5로 별도 산정한다.
//    사망은 EAL 집계에서 제외하고 건수+이 일수로만 별도 표기한다. (설계문서 §9.2)
const DEATH_LOSS_DAYS = 7500;
```

export 라인을 아래로 교체:

```js
export { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, LOSS_DAYS_ESTIMATE, DAILY_VALUE_PER_WORKER, DEATH_LOSS_DAYS };
```

- [ ] **Step 2: 실패하는 테스트 작성**

`proj/scripts/eal.test.mjs` 신규 생성:

```js
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
```

- [ ] **Step 3: 테스트 실행 — 실패 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: FAIL — `Cannot find module '../src/utils/eal.js'`

- [ ] **Step 4: `eal.js` 최소 구현**

`proj/src/utils/eal.js` 신규 생성:

```js
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

// ── 관측 기간 ───────────────────────────────────────────────
// 진행 중인 당월은 분자·분모 양쪽에서 제외한다. 미완료 월을 온전한 1개월로 세면
// 빈도가 과소 추정되는데, 안전 지표에서 위험을 낮게 잡는 건 위험한 방향의 오차다.
export function observationPeriod(accidents, now = new Date()) {
  const EMPTY = { firstYm: null, lastCompleteYm: null, months: 0, years: 0 };
  const yms = [];
  for (const a of accidents || []) {
    const y = Number(a?.year), m = Number(a?.month);
    if (!Number.isFinite(y) || !Number.isFinite(m) || m < 1 || m > 12) continue;
    yms.push(`${y}-${String(m).padStart(2, '0')}`);
  }
  if (!yms.length) return EMPTY;
  const currentYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const complete = yms.filter((ym) => ym < currentYm).sort();
  if (!complete.length) return EMPTY;
  const firstYm = complete[0];
  const lastCompleteYm = complete[complete.length - 1];
  const [fy, fm] = firstYm.split('-').map(Number);
  const [ly, lm] = lastCompleteYm.split('-').map(Number);
  const months = (ly - fy) * 12 + (lm - fm) + 1;
  return { firstYm, lastCompleteYm, months, years: months / 12 };
}
```

- [ ] **Step 5: 테스트 통과 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: PASS — 7 tests passing

- [ ] **Step 6: npm 스크립트 등록**

`proj/package.json`의 `scripts`에 추가 (기존 항목 유지):

```json
    "test": "node --test scripts/*.test.mjs",
    "validate:eal": "node scripts/validate-eal.mjs"
```

Run: `cd proj && npm test`
Expected: PASS

- [ ] **Step 7: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/utils/eal.js proj/scripts/eal.test.mjs proj/src/constants/metrics.js proj/package.json
git commit -m "feat(eal): 계산 엔진 기초 — 기간·단가·사망판별 + 단위테스트

관측 기간은 진행 중인 당월을 분자·분모 양쪽에서 제외한다(빈도 과소추정 방지).
dayRate는 CostRisk와 공유할 단일 출처로 이 모듈에 둔다.
DEATH_LOSS_DAYS(별표1 7500일)는 강도율 전용이며 금액 환산 금지 — 주석 명시.
테스트 러너는 Node 내장(node:test), 신규 의존성 없음."
```

---

## Task 2: 결측 보정 + 레코드 단위 EAL 배분

**Files:**
- Modify: `proj/src/utils/eal.js`
- Modify: `proj/scripts/eal.test.mjs`

**Interfaces:**
- Consumes: Task 1의 `dayRate`, `isFatal`, `observationPeriod`
- Produces: `withEal(accidents, period) => record[]` — 각 원소는 원본 필드 + `{ fatal: boolean, effLossDays: number|null, eal: number }`

- [ ] **Step 1: 실패하는 테스트 추가**

`proj/scripts/eal.test.mjs` 하단에 추가. import 라인에 `withEal`을 넣는다.

```js
import {
  wageFor, dayRate, isFatal, isSales, salesOnly, observationPeriod, withEal,
} from '../src/utils/eal.js';
```

```js
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: FAIL — `withEal is not a function` (또는 import 오류)

- [ ] **Step 3: `withEal` 구현**

`proj/src/utils/eal.js` 하단에 추가:

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: PASS — 13 tests passing

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/utils/eal.js proj/scripts/eal.test.mjs
git commit -m "feat(eal): 결측 보정 + 레코드 단위 EAL 배분

손실일수 결측 59%를 재해유형별 관측 평균으로 보정한다(유형 관측이 0이면 전사평균).
사망은 배분·보정·typeMean 산출 전 단계에서 제외해 평균 오염을 막는다.
완료월을 넘어선 당월 레코드도 함께 제외."
```

---

## Task 3: 축별 집계(sumEal) + 사망 레이어 요약

**Files:**
- Modify: `proj/src/utils/eal.js`
- Modify: `proj/scripts/eal.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `withEal` 산출 레코드
- Produces:
  - `sumEal(records, groupBy, period) => { key, n, lambda, avgLossDays, eal }[]` — `eal` 내림차순 정렬
  - `fatalitySummary(records) => { n, statutoryLossDays, records }`
  - `totalEal(records) => number`

- [ ] **Step 1: 실패하는 테스트 추가**

import 라인에 `sumEal, fatalitySummary, totalEal` 추가 후, 파일 하단에:

```js
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: FAIL — `sumEal is not a function`

- [ ] **Step 3: 집계 함수 구현**

`proj/src/utils/eal.js` 상단의 metrics import를 아래로 교체해 `DEATH_LOSS_DAYS`를 추가한다:

```js
import {
  MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, DAILY_VALUE_PER_WORKER, DEATH_LOSS_DAYS,
} from '../constants/metrics.js';
```

그리고 파일 하단에 추가:

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: PASS — 19 tests passing

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/utils/eal.js proj/scripts/eal.test.mjs
git commit -m "feat(eal): 축별 집계 + 사망 레이어 요약

sumEal은 어떤 groupBy로 묶어도 합계가 같다(가법성 테스트 포함).
사망은 모든 축에서 제외하고 fatalitySummary가 건수+법정일수만 반환한다."
```

---

## Task 4: 매장별 신뢰도 가중(Bühlmann)

**Files:**
- Modify: `proj/src/utils/eal.js`
- Modify: `proj/scripts/eal.test.mjs`

**Interfaces:**
- Consumes: Task 2의 `withEal` 레코드, `parseHelpers.sizeBucket`
- Produces: `storeEal(records, stores, period, opts?) => { store, n, Z, lambda, eal, bucket }[]`
  - `stores`: `{ store: string, area: number|null }[]` — 전체 매장 마스터(사고 0건 포함)
  - `opts`: `{ k?: number }` 기본 3

- [ ] **Step 1: 실패하는 테스트 추가**

import 라인에 `storeEal` 추가 후:

```js
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
```

- [ ] **Step 2: 테스트 실행 — 실패 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: FAIL — `storeEal is not a function`

- [ ] **Step 3: `storeEal` 구현**

`proj/src/utils/eal.js` 상단 import에 추가:

```js
import { sizeBucket } from './parseHelpers.js';
```

하단에 추가:

```js
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
```

- [ ] **Step 4: 테스트 통과 확인**

Run: `cd proj && node --test scripts/eal.test.mjs`
Expected: PASS — 25 tests passing

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/utils/eal.js proj/scripts/eal.test.mjs
git commit -m "feat(eal): 매장별 Bühlmann 신뢰도 가중

사고 0건 매장(전체의 87%)이 '0원'으로 표시되어 위험 없음으로 오독되는 문제를
동료집단(같은 평수 버킷) 평균과의 가중 혼합으로 해결한다.
Z=n/(n+k), k는 옵션 주입(기본 3). 매장 합계가 전사와 다른 건 의도된 동작."
```

---

## Task 5: 실데이터 불변식 검증 스크립트

**Files:**
- Create: `proj/scripts/validate-eal.mjs`

**Interfaces:**
- Consumes: `eal.js` 전체 API, `src/data/workerData.js`, `src/data/storesData.js`
- Produces: 없음 (리포트 출력 + 실패 시 exit 1)

- [ ] **Step 1: 검증 스크립트 작성**

`proj/scripts/validate-eal.mjs` 신규 생성:

```js
// EAL 실데이터 불변식 검증 리포트 (읽기전용)
// 실행: npm run validate:eal
// 설계문서 §8의 7개 항목을 확인한다. DAILY_VALUE_PER_WORKER 변경 시 회귀 확인용으로도 사용.
import DEFAULT_DATA from '../src/data/workerData.js';
import MAP_STORES from '../src/data/storesData.js';
import {
  salesOnly, observationPeriod, withEal, sumEal, totalEal, fatalitySummary, storeEal, isFatal, dayRate,
} from '../src/utils/eal.js';

const won = (v) => (v / 1e8).toFixed(2) + '억';
const fails = [];
const check = (ok, label, detail = '') => {
  console.log(`  ${ok ? '✓' : '✗'} ${label}${detail ? ' — ' + detail : ''}`);
  if (!ok) fails.push(label);
};

const accidents = DEFAULT_DATA.accidents || [];
const sales = salesOnly(accidents);
const period = observationPeriod(sales);
const records = withEal(sales, period);

console.log('=== EAL 검증 리포트 ===');
console.log(`전체 ${accidents.length}건 / 영업부문 ${sales.length}건 / 완료월 내 ${records.length}건`);
console.log(`관측 ${period.firstYm}~${period.lastCompleteYm} · ${period.months}개월 (${period.years}년)`);
console.log(`단가 dayRate(2025) = ${dayRate(2025).toLocaleString()}원/일`);
console.log(`전사 EAL = ${won(totalEal(records))}/년\n`);

// 1) 가법성 — 축을 바꿔도 합계가 같아야 한다
console.log('[1] 가법성');
const byLoc = sumEal(records, (r) => `${r.typeCanon}|${r.locLabel}`, period).reduce((s, g) => s + g.eal, 0);
const byDept = sumEal(records, (r) => r.dept, period).reduce((s, g) => s + g.eal, 0);
const byTeam = sumEal(records, (r) => r.team, period).reduce((s, g) => s + g.eal, 0);
const total = totalEal(records);
check(Math.abs(byLoc - total) < 1, 'Σ(유형×장소) == 전사', `차 ${Math.abs(byLoc - total).toFixed(4)}원`);
check(Math.abs(byDept - total) < 1, 'Σ(부서) == 전사', `차 ${Math.abs(byDept - total).toFixed(4)}원`);
check(Math.abs(byTeam - total) < 1, 'Σ(팀) == 전사', `차 ${Math.abs(byTeam - total).toFixed(4)}원`);

// 2) 보정 정합 — 사망은 관측·보정 어디에도 없어야 한다
console.log('\n[2] 결측 보정 정합');
const nonFatal = records.filter((r) => !r.fatal);
const observed = nonFatal.filter((r) => r.loss_days > 0);
const imputed = nonFatal.filter((r) => !(r.loss_days > 0));
check(observed.length + imputed.length === nonFatal.length, '관측 + 보정 == 비사망 전체',
  `${observed.length} + ${imputed.length} = ${nonFatal.length}`);
check(imputed.every((r) => r.effLossDays > 0), '보정된 레코드는 모두 양의 일수를 가짐');
console.log(`  ℹ 결측률 ${(imputed.length / nonFatal.length * 100).toFixed(1)}% — EAL의 상당 부분이 보정값`);

// 3) 신뢰도 경계
console.log('\n[3] 신뢰도 경계');
const storeList = MAP_STORES.map((s) => ({ store: s.n, area: s.ar }));
const se = storeEal(records, storeList, period);
check(se.every((s) => s.Z >= 0 && s.Z <= 1), 'Z ∈ [0,1]');
check(se.filter((s) => s.n === 0).every((s) => s.Z === 0), 'n=0 → Z=0');
const sorted = [...se].sort((a, b) => a.n - b.n);
let mono = true;
for (let i = 1; i < sorted.length; i++) if (sorted[i].n > sorted[i - 1].n && sorted[i].Z < sorted[i - 1].Z) mono = false;
check(mono, 'n 증가 시 Z 단조증가');

// 4) 매장 합계 괴리율 — 실패 아님(신뢰도 가중의 의도된 결과)
console.log('\n[4] 매장 합계 괴리 (리포트 전용)');
const storeSum = se.reduce((s, x) => s + x.eal, 0);
console.log(`  매장 합계 ${won(storeSum)} vs 전사 ${won(total)} — 괴리 ${((storeSum / total - 1) * 100).toFixed(1)}%`);
console.log('  ℹ 0건 매장에 위험을 배분하므로 불일치가 정상이다.');

// 5) 기간 계산 — 당월이 양쪽에서 빠졌는지
console.log('\n[5] 관측 기간');
const now = new Date();
const curYm = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
check(period.lastCompleteYm < curYm, '마지막 완료월이 당월보다 앞섬', `${period.lastCompleteYm} < ${curYm}`);
check(records.every((r) => `${r.year}-${String(r.month).padStart(2, '0')}` <= period.lastCompleteYm),
  '완료월 이후 레코드가 집계에 없음');

// 6) 사망 판별 일관성 — 두 필드가 갈리면 화면끼리 사망 건수가 달라진다
console.log('\n[6] 사망 판별 일관성');
const byTypeCanon = accidents.filter((a) => a.typeCanon === '사망').length;
const byKind = accidents.filter((a) => a.kind === '사망').length;
check(byTypeCanon === byKind, 'count(typeCanon=사망) == count(kind=사망)', `${byTypeCanon} vs ${byKind}`);

// 7) 사망 미포함 확인
console.log('\n[7] 사망 EAL 미포함');
const f = fatalitySummary(records);
check(records.filter((r) => r.fatal).every((r) => r.eal === 0), '사망 레코드의 eal이 모두 0');
check(!sumEal(records, (r) => r.typeCanon, period).some((g) => g.key === '사망'), '집계 결과에 사망 그룹 없음');
console.log(`  ℹ 중대재해 ${f.n}건 · 법정 요양근로손실일수 ${f.statutoryLossDays.toLocaleString()}일 (별도 표기)`);

console.log('\n' + (fails.length ? `✗ 실패 ${fails.length}건: ${fails.join(', ')}` : '✓ 전 항목 통과'));
process.exit(fails.length ? 1 : 0);
```

- [ ] **Step 2: 실행해 전 항목 통과 확인**

Run: `cd proj && npm run validate:eal`
Expected: 마지막 줄 `✓ 전 항목 통과`, exit 0.
전사 EAL이 약 `74.89억/년`, 중대재해 1건·7,500일로 나와야 한다. 값이 크게 다르면 이전 태스크의 구현을 재확인할 것.

- [ ] **Step 3: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/scripts/validate-eal.mjs
git commit -m "test(eal): 실데이터 불변식 검증 스크립트

가법성·보정정합·신뢰도경계·기간계산·사망판별일관성·사망미포함 7항목 확인.
매장 합계 괴리는 신뢰도 가중의 의도된 결과이므로 리포트만 하고 실패 처리하지 않는다."
```

---

## Task 6: CostRisk — dayRate 단일 출처로 전환 (동작 불변 리팩터)

**Files:**
- Modify: `proj/src/components/tabs/worker/CostRisk.jsx:14-20`

**Interfaces:**
- Consumes: Task 1의 `dayRate`, `wageFor`, `USE_PRODUCTIVITY`
- Produces: 없음 (기존 화면 동작 불변)

- [ ] **Step 1: 변경 전 화면 수치 기록**

Run: `cd proj && npm run dev -- --port 5178` 후 브라우저에서 `#tab=cost` 확인.
'총 추정 재무손실' 값을 메모한다(현재 데이터 기준 **83.1억**). 이 값이 리팩터 후에도 같아야 한다.

- [ ] **Step 2: import 교체**

`proj/src/components/tabs/worker/CostRisk.jsx` 5번째 줄의 metrics import에서 사용하지 않게 될 이름을 정리하고, `eal.js` import를 추가한다.

변경 전:
```js
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, DAILY_VALUE_PER_WORKER } from '../../../constants/metrics.js';
```

변경 후:
```js
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, DAILY_VALUE_PER_WORKER } from '../../../constants/metrics.js';
import { dayRate, wageFor, USE_PRODUCTIVITY } from '../../../utils/eal.js';
```

`MIN_WAGE_DAY`·`CURRENT_YEAR`·`INDIRECT_COST_MULTIPLIER`·`DAILY_VALUE_PER_WORKER`는 이 파일의 다른 곳(캡션 문구, `wY` 계산 등)에서 계속 쓰이므로 남겨둔다.

- [ ] **Step 3: 로컬 중복 정의 삭제**

14~18행의 다음 4줄을 삭제한다 (`HEINRICH`, `wageFor`, `USE_PRODUCTIVITY`, `dayRate`):

```js
const HEINRICH = 1 + INDIRECT_COST_MULTIPLIER;
const wageFor = (y) => MIN_WAGE_DAY[y] || MIN_WAGE_DAY[CURRENT_YEAR]; // 일급 = 최저시급 × 8시간
const USE_PRODUCTIVITY = DAILY_VALUE_PER_WORKER != null;
const dayRate = (y) => USE_PRODUCTIVITY ? DAILY_VALUE_PER_WORKER : wageFor(y) * HEINRICH;
```

`lossWon`·`eok`은 이 파일 전용이므로 남긴다. 단 `HEINRICH`를 참조하는 곳이 남아 있으면 `(1 + INDIRECT_COST_MULTIPLIER)`로 인라인 치환한다.

Run: `cd proj && grep -n "HEINRICH" src/components/tabs/worker/CostRisk.jsx`
Expected: 출력 없음 (남아 있으면 치환)

- [ ] **Step 4: 빌드 + 화면 수치 동일 확인**

Run: `cd proj && npm run build`
Expected: 빌드 성공, 에러 없음

브라우저에서 `#tab=cost`를 다시 열어 '총 추정 재무손실'이 **Step 1과 같은 값(83.1억)**인지 확인한다. 달라졌다면 되돌리고 원인을 찾을 것 — 이 태스크는 동작이 변하면 안 된다.

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/components/tabs/worker/CostRisk.jsx
git commit -m "refactor(cost): dayRate를 eal.js 단일 출처로 전환

컴포넌트 내부에 있던 손실 단가 로직을 eal.js에서 import하도록 변경.
두 화면이 서로 다른 금액을 말하는 상황을 구조적으로 차단한다. 동작·수치 불변."
```

---

## Task 7: CostRisk — EAL KPI + 중대재해 타일

**Files:**
- Modify: `proj/src/components/tabs/worker/CostRisk.jsx`
- Modify: `proj/src/App.jsx:790`

**Interfaces:**
- Consumes: `salesOnly`, `observationPeriod`, `withEal`, `totalEal`, `fatalitySummary`
- Produces: `CostRisk`가 새 prop `onNavigate?: (tabId: string) => void`를 받는다 (중대재해 타일 → 법적 보고 탭 이동용)

- [ ] **Step 0: App.jsx에서 네비 콜백 전달**

`proj/src/App.jsx:790`의 CostRisk 렌더를 아래로 교체한다. 기존 `onAlertClick` 패턴과 동일한 방식이다.

```jsx
            {tab === "cost" && <CostRisk D={dataFiltered} allYearly={scopedData.yearly} yearFilter={yearFilter} basis={basis} onNavigate={(t) => setTab(t)} />}
```

- [ ] **Step 1: EAL 계산 훅 추가**

`CostRisk.jsx`의 함수 시그니처에 새 prop을 받는다:

```js
function CostRisk({ D, allYearly, yearFilter, basis, onNavigate }) {
```

import에 `useMemo`를 넣고(기존 `import { useState, useRef } from 'react';` → `import { useState, useRef, useMemo } from 'react';`), `eal.js` import를 확장한다.

```js
import { dayRate, wageFor, USE_PRODUCTIVITY, salesOnly, observationPeriod, withEal, totalEal, fatalitySummary } from '../../../utils/eal.js';
```

컴포넌트 본문 상단(`const recs = ...` 아래)에 추가:

```js
  // ── 연간 기대손실(EAL) — 영업부문 모수, 사망 제외. 설계문서 §3 ──
  const ealPeriod = useMemo(() => observationPeriod(salesOnly(D.accidents || [])), [D.accidents]);
  const ealRecords = useMemo(
    () => withEal(salesOnly(D.accidents || []), ealPeriod),
    [D.accidents, ealPeriod],
  );
  const ealTotal = useMemo(() => totalEal(ealRecords), [ealRecords]);
  const fatality = useMemo(() => fatalitySummary(ealRecords), [ealRecords]);
  const ealBasisLabel = ealPeriod.years
    ? `관측 ${ealPeriod.firstYm}~${ealPeriod.lastCompleteYm} · ${ealPeriod.years}년 · 영업부문 ${ealRecords.length}건 기준`
    : '관측 기간 부족';
```

- [ ] **Step 2: 기존 KPI 부제에 산출 근거 명시**

기존 '총 추정 재무손실' 카드(약 123행)의 부제 `<div className="text-[11px] text-white/65 mt-2 break-keep">` 안 문구 끝에 ` · 실측분만`을 덧붙인다. EAL과 2.25배 차이 나는 이유를 라벨로 구분하기 위함이다.

```jsx
          <div className="text-[11px] text-white/65 mt-2 break-keep">
            {USE_PRODUCTIVITY
              ? `근로손실 ${fmt(periodDays)}일 × 인당 ${fmt(DAILY_VALUE_PER_WORKER)}원/일 · 실측분만`
              : `직접비 ${periodDirectEok.toFixed(1)}억 + 간접비 ${periodIndirectEok.toFixed(1)}억 · 실측분만`}
          </div>
```

- [ ] **Step 3: EAL KPI + 중대재해 타일 삽입**

'총 추정 재무손실' 카드를 감싸는 `</div>` 바로 뒤(같은 그리드 안, 형제 위치)에 두 카드를 추가한다.

```jsx
        {/* 연간 기대손실(EAL) — 누적이 아니라 연간 환산. 결측 보정 포함이라 위 카드와 배율이 다르다. */}
        <div className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ animationDelay: "60ms" }}>
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">연간 기대손실 (EAL)</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-[#071E4A]">
              {ealPeriod.years ? (ealTotal / 1e8).toFixed(1) : '—'}
            </span>
            <span className="text-base font-medium text-stone-400">억원/년</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 break-keep">
            {ealBasisLabel}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5 break-keep">
            결측 보정 포함 · 사망 제외
          </div>
        </div>

        {/* 중대재해 — 금액 환산 대상이 아니다. 법정 요양근로손실일수(별표1)로만 표기. 설계문서 §9.2 */}
        <div onClick={() => onNavigate?.('legal')} role={onNavigate ? 'button' : undefined}
          className={`rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md ${onNavigate ? 'cursor-pointer' : ''}`}
          style={{ animationDelay: "120ms" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: DAISO_RED }}>중대재해</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums" style={{ color: DAISO_RED }}>
              {fatality.n}
            </span>
            <span className="text-base font-medium text-stone-400">건</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 break-keep">
            법정 요양근로손실일수 {fmt(fatality.statutoryLossDays)}일
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5 break-keep">
            금액 환산 대상 아님 · 법적 보고 기준 별도 관리
          </div>
        </div>
```

- [ ] **Step 4: 빌드 + 화면 확인**

Run: `cd proj && npm run build`
Expected: 빌드 성공

브라우저 `#tab=cost`에서 확인:
- `연간 기대손실 (EAL)` 카드에 **74.9 억원/년**
- 부제에 `관측 2024-01~2026-06 · 2.5년 · 영업부문 609건 기준`
- `중대재해` 카드에 **1 건 · 법정 요양근로손실일수 7,500일**
- 기존 '총 추정 재무손실'은 여전히 83.1억이고 부제 끝에 `· 실측분만`

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/components/tabs/worker/CostRisk.jsx
git commit -m "feat(cost): 연간 기대손실(EAL) KPI + 중대재해 타일

EAL은 결측 보정을 포함하고 기존 누적 지표는 실측분만이라 배율이 다르다.
두 카드 부제에 산출 근거를 각각 명시해 구분한다(배너 없이 라벨로만).
사망은 금액이 아니라 건수+법정 요양근로손실일수로 형제 타일에 표기."
```

---

## Task 8: CostRisk — 연간 기대손실 상위 매장 Top 20

**Files:**
- Modify: `proj/src/components/tabs/worker/CostRisk.jsx`

**Interfaces:**
- Consumes: Task 4의 `storeEal`, `src/data/storesData.js`
- Produces: 없음

- [ ] **Step 1: 매장 EAL 계산 추가**

`CostRisk.jsx` import에 매장 마스터를 추가:

```js
import MAP_STORES from '../../../data/storesData.js';
```

`eal.js` import에 `storeEal`을 추가하고, Task 7의 훅 아래에:

```js
  // 매장별 EAL — 신뢰도 가중(Bühlmann). 0건 매장은 동료집단 평균으로 수렴한다.
  const storeRank = useMemo(() => {
    if (!ealPeriod.years) return [];
    const list = MAP_STORES.map((s) => ({ store: s.n, area: s.ar }));
    return storeEal(ealRecords, list, ealPeriod).slice(0, 20);
  }, [ealRecords, ealPeriod]);
  // 사망 보유 매장 — 금액 정렬엔 반영하지 않고 라벨로만 표기
  const fatalStores = useMemo(
    () => new Set(fatality.records.map((r) => r.store).filter(Boolean)),
    [fatality],
  );
```

- [ ] **Step 2: Top 20 카드 렌더 추가**

KPI 그리드가 닫힌 뒤, 기존 첫 `<Card>` 앞에 삽입:

```jsx
      {storeRank.length > 0 && (
        <Card title="연간 기대손실 상위 매장" titleIcon={Banknote}
          sub={`${ealBasisLabel} · 신뢰도 가중(Bühlmann) 적용 — 사고 0건 매장도 동료집단 평균으로 위험을 배분`}
          right={<ExportBtn rows={storeRank.map((s, i) => ({ 순위: i + 1, 매장: s.store, 사고건수: s.n, 신뢰도: s.Z, 연간기대손실_원: Math.round(s.eal) }))} filename="매장별_연간기대손실.csv" />}>
          <div className="space-y-1">
            {storeRank.map((s, i) => (
              <div key={s.store} className="flex items-center gap-2 py-1 border-b border-stone-50 text-[12px]">
                <span className="text-stone-400 tabular-nums w-6 text-right">{i + 1}</span>
                <span className="font-semibold text-stone-800 truncate flex-1">{s.store}</span>
                {fatalStores.has(s.store) && (
                  <span className="text-[10px] text-stone-400 whitespace-nowrap">중대재해 1건</span>
                )}
                <span className="text-stone-400 tabular-nums whitespace-nowrap">사고 {s.n}건 · 신뢰도 {Math.round(s.Z * 100)}%</span>
                <span className="font-bold tabular-nums text-[#071E4A] w-20 text-right whitespace-nowrap">
                  {(s.eal / 1e4).toFixed(0)}만원
                </span>
              </div>
            ))}
          </div>
          <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600 break-keep">
            매장별 기대손실은 자기 실적과 같은 평수대 매장 평균을 사고 건수에 따라 가중 혼합한 값입니다.
            <span className="text-stone-500"> 사고가 많은 매장일수록 자기 실적 비중(신뢰도)이 높고, 0건 매장은 동료집단 평균에 수렴합니다. 이 축만 혼합을 거치므로 매장 합계는 전사 총액과 일치하지 않습니다.</span>
          </div>
        </Card>
      )}
```

- [ ] **Step 3: 빌드 + 화면 확인**

Run: `cd proj && npm run build`
Expected: 빌드 성공

브라우저 `#tab=cost`에서 Top 20 리스트가 뜨고, 각 행에 `사고 n건 · 신뢰도 Z%`가 보이는지, 사고 0건 매장이 리스트에 들어올 경우 금액이 0이 아닌지 확인한다.

- [ ] **Step 4: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/components/tabs/worker/CostRisk.jsx
git commit -m "feat(cost): 연간 기대손실 상위 매장 Top 20

신뢰도 가중을 적용해 0건 매장도 동료집단 평균 기반 위험을 갖는다.
각 행에 사고건수·신뢰도를 노출해 추정 근거를 라벨로 드러낸다.
사망 보유 매장은 정렬 미반영 라벨로만 표기."
```

---

## Task 9: CrossAnalysis — 고위험 조합을 EAL 기준으로 재구성

**Files:**
- Modify: `proj/src/components/tabs/worker/CrossAnalysis.jsx:213-214` 및 고위험 조합 렌더 블록

**Interfaces:**
- Consumes: `observationPeriod`, `withEal`, `sumEal`
- Produces: 없음

**주의:** 기존 `D.location?.severity`는 `processAccidents.js:609-622`에서 **빌드타임**에 만들어진 값이라 연도 필터에 반응하지 않는다. 런타임 집계로 대체한다.

- [ ] **Step 1: import 추가**

`CrossAnalysis.jsx` 상단에 추가:

```js
import { observationPeriod, withEal, sumEal } from '../../../utils/eal.js';
```

- [ ] **Step 2: 빌드타임 severity를 런타임 EAL 집계로 교체**

발생 장소 카드 블록에서 다음 두 줄을 찾는다:

```js
        const isAllPeriod = !yearFilter || yearFilter === 'all';
        const severity = isAllPeriod ? (D.location?.severity || []) : [];
```

아래로 교체한다. `accs`는 이 블록에서 이미 영업부문 + 연도필터가 적용된 배열이다.

```js
        // 고위험 조합 — EAL(빈도×심각도) 기준. 기존 D.location.severity는 빌드타임 산출물이라
        // 연도 필터에 반응하지 않고 평균 휴업일수만으로 정렬돼, 표본 적은 조합이 상위에 올라왔다.
        const ealPeriod = observationPeriod(accs);
        const ealRecords = withEal(accs, ealPeriod);
        const severity = ealPeriod.years
          ? sumEal(ealRecords, (r) => (r.locMatched ? `${r.typeCanon}|${r.locLabel}` : null), ealPeriod)
              .filter((g) => g.n >= 5)
              .slice(0, 8)
          : [];
```

`locMatched`가 거짓인 레코드를 `null` 키로 걸러 '장소불명' 조합이 랭킹에 오르는 것을 막는다. `withEal`이 사망을 이미 제외하므로 이중 방어가 된다.

- [ ] **Step 3: 렌더부를 EAL 표시로 교체**

기존 고위험 조합 렌더 블록(`severity.slice(0, 8).map(...)` 부분)을 아래로 교체한다.

```jsx
            {severity.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-200">
                <div className="text-sm font-bold text-stone-700 mb-1">고위험 조합 <span className="text-xs font-normal text-stone-400">(유형×장소 · 연간 기대손실 순 · 표본 5건 이상)</span></div>
                <div className="text-xs text-stone-500 mb-2">관측 {ealPeriod.firstYm}~{ealPeriod.lastCompleteYm} · {ealPeriod.years}년 기준 · 사망 제외</div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                  {severity.map((c, i) => {
                    const [type, loc] = c.key.split('|');
                    return (
                      <div key={c.key} className="flex items-center gap-2 text-[12px] py-0.5">
                        <span className={`font-extrabold tabular-nums w-16 text-right ${i < 2 ? 'text-red-600' : 'text-stone-800'}`}>
                          {(c.eal / 1e8).toFixed(2)}억
                        </span>
                        <span className="text-stone-700 break-keep flex-1">{type} <span className="text-stone-400">@</span> {loc}</span>
                        <span className="text-stone-400 tabular-nums whitespace-nowrap">{c.n}건 · 평균 {c.avgLossDays ?? '—'}일</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
```

- [ ] **Step 4: 빌드 + 순위 검증**

Run: `cd proj && npm run build`
Expected: 빌드 성공

브라우저 `#tab=cross`에서 '고위험 조합' 1위가 **넘어짐 @ 계단** (약 10.80억 · 71건)인지 확인한다. 사다리 위(5건)가 1위로 뜨면 정렬이 반영되지 않은 것이다. `사망 @ 장소불명`이 보이면 `locMatched` 필터가 빠진 것이다.

연도 필터를 2025로 바꿨을 때 값이 함께 변하는지도 확인한다(기존 빌드타임 값은 반응하지 않았다).

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/components/tabs/worker/CrossAnalysis.jsx
git commit -m "fix(cross): 고위험 조합을 EAL(빈도×심각도) 기준으로 재정렬

기존엔 평균 휴업일수만으로 정렬해 표본 5건짜리 조합이 실제 손실 기여 1위를
밀어냈다. 빌드타임 D.location.severity를 런타임 EAL 집계로 대체해 연도 필터에도
반응하게 하고, locMatched 필터로 '장소불명' 조합이 상위에 오르는 것을 막는다."
```

---

## Task 10: DeptTeamStore — 조직 계층 EAL 컬럼

**Files:**
- Modify: `proj/src/components/tabs/worker/DeptTeamStore.jsx`

**Interfaces:**
- Consumes: `salesOnly`, `observationPeriod`, `withEal`, `sumEal`
- Produces: 없음

**주의:** `dept_ir`/`team_ir`은 `processStores.js`에서 baked되며 사고 레코드를 갖고 있지 않다. 부서·팀명을 키로 런타임 EAL 맵을 조인한다.

- [ ] **Step 1: import + EAL 맵 계산**

`DeptTeamStore.jsx` 상단에 추가:

```js
import { salesOnly, observationPeriod, withEal, sumEal } from '../../../utils/eal.js';
```

컴포넌트 본문 상단(`const hasWorker = ...` 근처)에 추가:

```js
  // 조직별 EAL — dept_ir/team_ir은 baked라 사고 레코드가 없으므로 이름으로 조인한다.
  const ealPeriod = useMemo(() => observationPeriod(salesOnly(D.accidents || [])), [D.accidents]);
  const ealRecords = useMemo(
    () => withEal(salesOnly(D.accidents || []), ealPeriod),
    [D.accidents, ealPeriod],
  );
  const ealByDept = useMemo(
    () => new Map(sumEal(ealRecords, (r) => r.dept, ealPeriod).map((g) => [g.key, g.eal])),
    [ealRecords, ealPeriod],
  );
  const ealByTeam = useMemo(
    () => new Map(sumEal(ealRecords, (r) => r.team, ealPeriod).map((g) => [g.key, g.eal])),
    [ealRecords, ealPeriod],
  );
  const ealCell = (v) => (v == null ? '—' : `${(v / 1e8).toFixed(2)}억`);
```

`useMemo`가 아직 import되지 않았다면 react import에 추가한다.

- [ ] **Step 2: 부서 테이블에 컬럼 추가**

`<th ...>매장당 사고율</th>` 바로 뒤에 헤더를 추가:

```jsx
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">연간 기대손실</th>
```

대응하는 `<td>`를 '매장당 사고율' 셀 바로 뒤에 추가:

```jsx
                  <td className="py-2 px-3 text-right tabular-nums text-stone-700 whitespace-nowrap">{ealCell(ealByDept.get(d.dept))}</td>
```

- [ ] **Step 3: 팀 테이블에도 동일 적용**

먼저 팀 테이블 위치를 찾는다:

Run: `cd proj && grep -n "team_ir\|<th" src/components/tabs/worker/DeptTeamStore.jsx`

`D.team_ir`을 `.map(...)`으로 렌더하는 `<tbody>`와 짝이 되는 `<thead>`를 찾아, 부서 테이블과 같은 위치(사고율 계열 컬럼 뒤)에 헤더와 셀을 넣는다. 행 변수명이 `t`가 아니면 그 이름에 맞춘다.

헤더:
```jsx
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">연간 기대손실</th>
```

셀:
```jsx
                  <td className="py-2 px-3 text-right tabular-nums text-stone-700 whitespace-nowrap">{ealCell(ealByTeam.get(t.team))}</td>
```

⚠️ 헤더 `<th>`와 본문 `<td>` 개수가 어긋나면 표가 밀린다. 추가 후 브라우저에서 컬럼 정렬을 눈으로 확인할 것.

- [ ] **Step 4: 빌드 + 정합성 확인**

Run: `cd proj && npm run build`
Expected: 빌드 성공

Run: `cd proj && npm run validate:eal`
Expected: `✓ 전 항목 통과` — 특히 `Σ(부서) == 전사`가 통과해야 한다.

브라우저 `#tab=dept`에서 부서·팀 테이블에 '연간 기대손실' 컬럼이 보이고, 부서 값의 합이 CostRisk 탭의 EAL 총액(74.9억)과 맞는지 눈으로 확인한다.

- [ ] **Step 5: 커밋**

```bash
cd /Users/gerrard/Project_Sago
git add proj/src/components/tabs/worker/DeptTeamStore.jsx
git commit -m "feat(dept): 부서·팀 테이블에 연간 기대손실 컬럼

dept_ir/team_ir은 baked라 사고 레코드가 없으므로 조직명으로 런타임 EAL 맵을 조인.
부서 합계가 전사 총액과 일치함을 validate:eal이 확인한다."
```

---

## 최종 확인

- [ ] **전체 테스트 통과**

Run: `cd proj && npm test && npm run validate:eal && npm run build`
Expected: 단위 테스트 25건 PASS, 검증 7항목 전 통과, 빌드 성공

- [ ] **화면 회귀 확인**

브라우저에서 세 탭을 순서대로 확인:
- `#tab=cost` — EAL 74.9억/년, 중대재해 1건·7,500일, 매장 Top 20, 기존 83.1억 유지
- `#tab=cross` — 고위험 조합 1위가 넘어짐 @ 계단, 연도 필터에 반응
- `#tab=dept` — 부서·팀 EAL 컬럼, 합계 정합

- [ ] **커밋되지 않은 변경 없음 확인**

Run: `cd /Users/gerrard/Project_Sago && git status --short`
Expected: 출력 없음

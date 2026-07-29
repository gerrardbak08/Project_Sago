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

#!/usr/bin/env node
// 원본DB(workerData.js) 최신화 — 라이브 사고경위 스냅샷(liveSnapshot.js)에서 신규 사고를
// 이어붙여 전체 집계를 재계산한다. DB/*.xlsx 가 로컬에 없어도 동작하는 상시 경로.
//
//   1) 기존 baked accidents(나이·근속·상병명·비용 등 풍부한 필드) → 원시 한글컬럼 역매핑 (무손실)
//   2) liveSnapshot.rows 중 기존과 매칭 안 되는 신규 행 → liveRowToAcc() (라이브 미보유 필드는 null)
//   3) processAccidents(합본, processStores(raw/stores.json), workersData) 로 전체 재계산
//      — 근로자 분모(worker_kpis·store_workers·팀/부서 인원)는 기존 시점 스냅샷에서 재구성(동결 방침)
//   4) 사고 내용 속 제3자 실명(직함 수반 패턴) 마스킹
//
// 실행: node scripts/update-accidents-from-live.mjs   (proj/ 에서. or npm run data:accidents:live)
// 멱등: 같은 liveSnapshot 에 대해 재실행해도 결과 동일.
import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

import OLD_DATA from '../src/data/workerData.js';
import LIVE_SNAPSHOT from '../src/data/liveSnapshot.js';
import { processAccidents } from '../src/utils/processAccidents.js';
import { processStores } from '../src/utils/processStores.js';
import { liveRowToAcc } from '../src/utils/liveSource.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(__dirname, '..', 'src', 'data', 'workerData.js');
const STORES_RAW = JSON.parse(readFileSync(resolve(__dirname, '..', 'src', 'data', 'raw', 'stores.json'), 'utf8'));

// ── 제3자 실명 마스킹 — "홍길동 사원" 류 직함 수반 이름만 표적 ──
const TITLE_RE = /(^|[\s(,.·])([가-힣]{2,4})(?=\s?(사원|주임|대리|과장|점장|파트장|매니저|팀장|부장)(님|이|은|과|의|에)?)/g;
const NOT_NAMES = new Set([
  '현장', '담당', '신입', '파견', '협력', '용역', '배송', '매장', '안전', '소속', '당직',
  '야간', '주간', '청소', '보안', '계약', '정규', '상주', '해당', '타사', '당사', '경비',
  '동료', '기존', '남자', '여자', '다른', '휴게', '위해', '사실',
  '이후', '이전', '당시', '이상', '통증', '증상', '상품', '박스',
]);
const VERB_TAIL = /[던는할된올갈간온둔친고]$/; // "작업하던 사원"·"있다고 점장에게" 류 오탐 방지
const scrubbedTokens = new Map();
function scrubTitles(text) {
  if (!text) return text ?? null;
  return String(text).replace(TITLE_RE, (m, pre, name) => {
    // "사고 사실이 파트장…" 류 — 조사(이/가)가 이름창에 흡수된 경우 어간으로 재검사
    const stem = /[이가]$/.test(name) ? name.slice(0, -1) : null;
    if (stem && (NOT_NAMES.has(stem) || VERB_TAIL.test(stem))) return m;
    if (NOT_NAMES.has(name) || VERB_TAIL.test(name) || name.includes('*')) return m;
    if (!scrubbedTokens.has(name)) scrubbedTokens.set(name, { count: 0, ctx: String(text).slice(0, 40) });
    scrubbedTokens.get(name).count++;
    return pre + name[0] + '*'.repeat(name.length - 1);
  });
}

// ── 1) 기존 baked accidents → 원시 한글컬럼 역매핑 ──
function accToRaw(a) {
  return {
    '년': a.year, '월': a.month, '부서': a.dept, '팀명': a.team, '매장명': a.store,
    '파트장': a.parjang, '재해자명': a.workerName,
    '재해일자': a.date,
    '재해 종류': a.kind, '재해 유형': a.type, '기인물': a.cause,
    '사고 내용': scrubTitles(a.content),
    '나이대': a.age, '나이': a.ageNum, '성별': a.gender, '고용형태': a.emp,
    '근속기간 (년)': a.tenureYr != null ? `${a.tenureYr}년` : null,
    '상해부위 (근골격계)': a.site, '상병명': a.dx,
    '근로손실일수': a.loss_days, '공상 비용 계': a.cost,
    '사번': a.workerId, '근로복지공단 제출': a.submitted ? 'Y' : null,
    '신청유형': a.applyType,
  };
}
const oldAccidents = OLD_DATA.accidents || [];
const oldRaw = oldAccidents.map(accToRaw);

// ── 2) 라이브 rows 중 신규분 선별 — 그룹 카운트 대조 2단계 ──
// 라이브 시트가 유형 표기를 세분화('질병(만성질환)' 등, '사망' 신설, 빈 유형)했으므로
// 괄호 이하를 뗀 기본유형으로 정규화해 대조한다.
//   1차: (년월|매장|기본유형) 정확 매칭
//   2차: 남은 것끼리 (년월|기본유형) — 매장명 표기 차이('영업지원팀' vs '영업지원부 영업지원팀') 흡수
// 초과분(늦게 등록된 행 = originalRow 큰 순)만 신규 편입 → 과거 월 소급 등록도 잡힌다.
const norm = (s) => String(s ?? '').trim();
const baseType = (t) => norm(t).replace(/\s*\(.*$/, '') || '기타';
const ymOf = (y, m) => `${parseInt(y)}-${parseInt(m)}`;

const oldStrict = new Map();
for (const a of oldAccidents) {
  const k = `${ymOf(a.year, a.month)}|${norm(a.store)}|${baseType(a.type)}`;
  oldStrict.set(k, (oldStrict.get(k) || 0) + 1);
}

const liveRows = [...(LIVE_SNAPSHOT.rows || [])].sort((a, b) => (a.originalRow || 0) - (b.originalRow || 0));
let matchedCount = 0;
// 1차: 정확 그룹에서 소진
const pass1Left = [];
for (const r of liveRows) {
  const k = `${ymOf(r.year, r.month)}|${norm(r.store)}|${baseType(r.accidentType)}`;
  if ((oldStrict.get(k) || 0) > 0) { oldStrict.set(k, oldStrict.get(k) - 1); matchedCount++; }
  else pass1Left.push(r);
}
// 2차: 미소진 기존분을 (년월|기본유형)으로 투영해 남은 라이브 행과 대조
const oldRelaxed = new Map();
for (const [k, n] of oldStrict.entries()) {
  if (n <= 0) continue;
  const [ym, , bt] = k.split('|');
  const rk = `${ym}|${bt}`;
  oldRelaxed.set(rk, (oldRelaxed.get(rk) || 0) + n);
}
const newLiveRows = [];
for (const r of pass1Left) {
  const rk = `${ymOf(r.year, r.month)}|${baseType(r.accidentType)}`;
  if ((oldRelaxed.get(rk) || 0) > 0) { oldRelaxed.set(rk, oldRelaxed.get(rk) - 1); matchedCount++; }
  else newLiveRows.push(r);
}
const unmatchedOld = [...oldRelaxed.values()].reduce((s, n) => s + n, 0);
const liveTotal = liveRows.length;
console.log(`[update] 기존 baked: ${oldAccidents.length}건 / 라이브: ${liveTotal}건 (bakedAt ${LIVE_SNAPSHOT.bakedAt})`);
console.log(`[update] 매칭: ${matchedCount}건 · 신규 편입: ${newLiveRows.length}건 · 라이브 미대응 기존분: ${unmatchedOld}건(보존)`);

const nameSet = new Set(newLiveRows.map((r) => r.victimName).filter(Boolean));
const newRaw = newLiveRows
  .sort((a, b) => norm(a.accidentDate).localeCompare(norm(b.accidentDate)))
  .map((r) => {
    const acc = liveRowToAcc(r, nameSet);
    // 유형을 기존 택소노미로 정규화 — '질병(만성질환)'→'질병', 빈값→'기타'. '사망'은 신규 유형으로 유지.
    acc['재해 유형'] = baseType(r.accidentType);
    acc['재해 종류'] = baseType(r.accidentType);
    acc['사고 내용'] = scrubTitles(acc['사고 내용']);
    return acc;
  });

// ── 3) 전체 재계산 — 매장 마스터 + 근로자 시점 스냅샷 재구성 ──
const stores = processStores(STORES_RAW.data || []);
const irRec = (t) => ({
  workers: t.workers, stores_count: t.stores_with_workers,
  new_hires_1y: t.new_hires_1y, avg_tenure_yr: t.avg_tenure_yr,
});
const workersData = {
  kpis: OLD_DATA.worker_kpis || null,
  teamMap: new Map((OLD_DATA.team_ir || []).map((t) => [t.team, irRec(t)])),
  deptMap: new Map((OLD_DATA.dept_ir || []).map((d) => [d.dept, irRec(d)])),
  storeMap: new Map(Object.entries(OLD_DATA.store_workers || {}).map(([n, w]) => [n, { workers: w }])),
  bumunMap: new Map(),
};

const merged = [...oldRaw, ...newRaw];
const newData = processAccidents(merged, stores, workersData);

// 기존에만 있는 키(시점 스냅샷 산출물 등)는 보존, 겹치는 키는 재계산 값으로 교체
const finalData = { ...OLD_DATA, ...newData };

// ── 4) 검증 ──
const errs = [];
if (newData.kpis.total !== oldAccidents.length + newRaw.length)
  errs.push(`총계 불일치: ${newData.kpis.total} ≠ ${oldAccidents.length}+${newRaw.length}`);
// 월별: 재계산 결과가 라이브 월별 건수와 일치해야 함 (라이브가 정본)
const liveMonthly = new Map();
for (const r of LIVE_SNAPSHOT.rows || []) {
  const ym = `${parseInt(r.year)}-${String(parseInt(r.month)).padStart(2, '0')}`;
  liveMonthly.set(ym, (liveMonthly.get(ym) || 0) + 1);
}
console.log('\n ym      | 기존 | 라이브 | 재계산');
for (const m of newData.monthly) {
  const oldT = (OLD_DATA.monthly.find((x) => x.ym === m.ym) || {}).t ?? '-';
  const liveT = liveMonthly.get(m.ym) ?? '-';
  const mark = m.t === liveT ? '' : '  ← 라이브와 상이';
  console.log(` ${m.ym} | ${String(oldT).padStart(4)} | ${String(liveT).padStart(5)} | ${String(m.t).padStart(5)}${mark}`);
  // 라이브가 정본: 미달은 무조건 오류, 초과는 시트에서 삭제된 기존분 보존일 때(unmatchedOld)만 허용
  if (liveT !== '-' && m.t < liveT) errs.push(`${m.ym} 재계산(${m.t}) < 라이브(${liveT})`);
  if (liveT !== '-' && m.t > liveT && unmatchedOld === 0) errs.push(`${m.ym} 재계산(${m.t}) > 라이브(${liveT}) — 매칭 실패로 이중 계상 의심`);
}
console.log(`\n[update] KPI: total ${OLD_DATA.kpis.total} → ${newData.kpis.total}` +
  ` (24년 ${newData.kpis.y2024} · 25년 ${newData.kpis.y2025} · 26년 ${newData.kpis.y2026})`);
const scrubTotal = [...scrubbedTokens.values()].reduce((s, x) => s + x.count, 0);
console.log(`[update] 제3자 실명 마스킹: ${scrubbedTokens.size}명 ${scrubTotal}회 (아래 원문 눈검증 필수)`);
for (const [nm, v] of scrubbedTokens) console.log(`         - "${nm}" ${v.count}회 | 문맥: ${v.ctx}…`);

if (errs.length) {
  console.error('\n!! 검증 실패 — 파일 미변경:\n' + errs.map((e) => '   ' + e).join('\n'));
  process.exit(1);
}

// ── 5) 저장 (regenerate-data.mjs 와 동일 포맷) ──
const out = `const DEFAULT_DATA = ${JSON.stringify(finalData)};\n// === DAISO BRAND LOGO ===\nexport default DEFAULT_DATA;\n`;
writeFileSync(OUT, out, 'utf-8');
console.log(`\n✓ ${OUT} 갱신 (${(out.length / 1024).toFixed(1)} KB)`);

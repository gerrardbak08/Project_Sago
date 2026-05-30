#!/usr/bin/env node
/**
 * 산재 승인 현황 Excel → src/data/approvalData.js
 *
 * [1차] DB/산재승인현황.xlsx (산재 승인된 건만 모은 권위 데이터) 를 집계하고,
 *       DB/근로자사고DB.xlsx (전체 사고 이력) 와 매칭해 "사고이력 연계" 지표를 산출.
 * [2차] HR API 엔드포인트 연동 후 이 스크립트 대신 API 호출로 교체 예정.
 *
 * Usage:
 *   cd proj && node scripts/extract-approval.mjs    (또는 npm run data:approval)
 *
 * 설계 노트:
 *   - 승인DB 에는 불승인/심사중 컬럼이 없다 (전부 승인 건). 따라서 핵심 통계
 *     (연도별/유형별/부서별/근로손실일수) 는 승인DB 만으로 산출한다.
 *   - 두 DB 는 기간·모집단이 다르다 (승인DB 2023~, 사고DB 2024~). 매칭은
 *     "사고이력에서 이 승인건을 찾을 수 있는가" 라는 연계 확인 보조 지표이며,
 *     이름+재해일자(정확) + 동일인 ±3일(근접) 2단계로 본다.
 *   - 개인정보(이름/주민번호)는 출력하지 않는다 — 집계값만 approvalData.js 로.
 *
 * ── 실제 Excel 헤더 매핑 ────────────────────────────────────────
 *   승인DB 데이터시트: 년도 | 월 | 반기 | 분기 | 부서 | 팀명 | 매장명 | 이름 |
 *     주민등록번호 | 나이 | 연령대 | 재해일자 | 입사일자 | 근속기간(년) |
 *     고용형태 | 재해유형 | 기인물 | 사고 내용 | 요양시작일 | 요양종료일 | 근로손실일수
 */
import * as XLSX from 'xlsx';
import { writeFileSync, readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT     = resolve(__dirname, '..', '..');
const DB       = resolve(ROOT, 'DB');
const OUT      = resolve(__dirname, '..', 'src', 'data', 'approvalData.js');

const APPROVAL_XLSX = resolve(DB, '산재승인현황.xlsx');
const ACCIDENT_XLSX = resolve(DB, '근로자사고DB.xlsx');

// 승인DB 컬럼
const A_YEAR  = '년도';
const A_DEPT  = '부서';
const A_NAME  = '이름';
const A_DATE  = '재해일자';
const A_TYPE  = '재해유형';
const A_LOSS  = '근로손실일수';
const A_STORE = '매장명';
// 사고DB 컬럼
const C_NAME  = '재해자명';
const C_DATE  = '재해일자';
const C_YEAR  = '년';           // 데이터셋 귀속 연도 (개별 재해일자보다 신뢰)
const C_APPLY = '신청유형';     // "산재" | "공상" | ...

// ── 헬퍼 ────────────────────────────────────────────────────────
function nfc(s) {
  return s == null ? '' : String(s).normalize('NFC').trim();
}

/** 다양한 날짜 표기를 YYYY-MM-DD 로 정규화. 실패 시 원문 반환. */
function normDate(v) {
  if (v == null) return '';
  if (v instanceof Date) {
    const y = v.getFullYear(), m = v.getMonth() + 1, d = v.getDate();
    return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  }
  const s = String(v).trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s);           // 2026-04-18
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(s);          // 4/18/26  (M/D/YY)
  if (m) { let y = +m[3]; if (y < 100) y += 2000; return `${y}-${String(+m[1]).padStart(2, '0')}-${String(+m[2]).padStart(2, '0')}`; }
  m = /^(\d{4})\.(\d{1,2})\.(\d{1,2})/.exec(s);             // 2026.04.18
  if (m) return `${m[1]}-${String(+m[2]).padStart(2, '0')}-${String(+m[3]).padStart(2, '0')}`;
  return s;
}

function dayDiff(d1, d2) {
  const t1 = Date.parse(d1), t2 = Date.parse(d2);
  if (Number.isNaN(t1) || Number.isNaN(t2)) return Infinity;
  return Math.abs(t1 - t2) / 86400000;
}

/** 부서명 표기 흔들림 정규화: "…영업부문" → "…영업부" (경남영업부 ⇄ 경남영업부문 병합). */
function normDept(s) {
  const d = nfc(s);
  if (!d) return null;
  return d.replace(/영업부문$/, '영업부');
}

// 사고내용에서 재해유형을 복원하기 위한 키워드 맵 (위에서부터 우선 매칭).
const TYPE_KEYWORDS = [
  [/(넘어|미끄러|헛디|단차)/, '넘어짐'],
  [/(베|절단|칼|날에)/, '베임'],
  [/(끼|협착)/, '끼임'],
  [/(부딪|충돌)/, '부딪힘'],
  [/(떨어|추락|낙하)/, '떨어짐'],
  [/(물체에 ?맞|낙하물)/, '물체에 맞음'],
  [/(무리한|반복작업|삐끗|염좌|근골)/, '무리한 동작'],
  [/(깔림|깔려)/, '깔림'],
];
// 재해유형 칸에 잘못 들어온 신청유형/오염값.
const INVALID_TYPE = new Set(['산재', '공상']);

/**
 * 재해유형 정제: 유효한 한글 유형은 그대로, 빈값·날짜오염·신청유형누수("산재")는
 * 사고내용에서 키워드 복원을 시도하고, 그래도 불가하면 "미분류" 로 버킷팅한다.
 * (조용히 누락하지 않아 byType 합계가 totalApproved 와 일치)
 */
function cleanType(rawType, content) {
  const t = nfc(rawType);
  const valid = t && !/^\d+[/.\-]\d+/.test(t) && !INVALID_TYPE.has(t);
  if (valid) return t;
  const c = nfc(content);
  if (c) {
    for (const [re, label] of TYPE_KEYWORDS) if (re.test(c)) return label;
  }
  return '미분류';
}

function toInt(v) {
  const n = parseInt(String(v ?? '').replace(/[^\d.-]/g, ''), 10);
  return Number.isFinite(n) ? n : 0;
}

// ── 시트 로딩 ───────────────────────────────────────────────────
function readApprovalRows() {
  if (!existsSync(APPROVAL_XLSX)) {
    console.error(`[ERROR] 파일 없음: ${APPROVAL_XLSX}`);
    console.error('  → DB/산재승인현황.xlsx 를 배치 후 다시 실행하세요.');
    process.exit(1);
  }
  const wb = XLSX.read(readFileSync(APPROVAL_XLSX), { type: 'buffer', cellDates: true });
  // "피벗" 등 요약 시트는 건너뛰고, 원자료(이름/재해일자 컬럼 보유) 시트를 고른다.
  let sheetName = wb.SheetNames.find(n => /산업재해|산재|DB|raw|데이터/i.test(n) && !/피벗|pivot|요약/i.test(n));
  if (!sheetName) {
    sheetName = wb.SheetNames.find(n => {
      const r = XLSX.utils.sheet_to_json(wb.Sheets[n], { defval: null })[0] || {};
      return A_NAME in r && A_DATE in r;
    });
  }
  sheetName = sheetName || wb.SheetNames[wb.SheetNames.length - 1];
  console.log(`   승인DB 시트: "${sheetName}"`);
  return XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: false });
}

function readAccidentIndex() {
  if (!existsSync(ACCIDENT_XLSX)) {
    console.warn(`[WARN] 사고DB 없음 (${ACCIDENT_XLSX}) — 연계 매칭 생략.`);
    return null;
  }
  const wb = XLSX.read(readFileSync(ACCIDENT_XLSX), { type: 'buffer', cellDates: true });
  const sn = wb.SheetNames.find(n => n.includes('사고경위서')) || wb.SheetNames[0];
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[sn], { defval: null, raw: false });

  const exact = new Set();          // "name|date"
  const byName = new Map();         // name -> [date, ...]
  const years = new Set();
  let sanjaeApplied = 0;
  for (const r of rows) {
    const name = nfc(r[C_NAME]);
    const date = normDate(r[C_DATE]);
    if (nfc(r[C_APPLY]) === '산재') sanjaeApplied++;
    if (!name || !date) continue;
    exact.add(`${name}|${date}`);
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(date);
    // 겹치는 기간은 데이터셋 귀속 연도(년 컬럼) 기준 — 개별 재해일자에는
    // 과거(2020/2023 등) 발생·후신고 건이 섞여 있어 분모를 왜곡시킨다.
    const yr = toInt(r[C_YEAR]);
    if (yr >= 2000) years.add(yr);
  }
  return { total: rows.length, exact, byName, years, sanjaeApplied };
}

// ── 집계 + 매칭 ─────────────────────────────────────────────────
function processApproval(rows, accIdx) {
  const byYear = {};   // year -> { count, lossDays }
  const byType = {};   // type -> count
  const byDept = {};   // dept -> { count, lossDays }
  let totalApproved = 0;
  let lossDaysTotal = 0;

  // 연계 매칭 카운터 (사고DB 기간과 겹치는 승인건만 대상)
  const overlapYears = accIdx ? accIdx.years : new Set();
  let approvedInOverlap = 0, matchedExact = 0, matchedFuzzy = 0;

  for (const r of rows) {
    const year = toInt(r[A_YEAR]) || null;
    const dept = normDept(r[A_DEPT]) || '미상';
    const type = cleanType(r[A_TYPE], r['사고 내용']);
    const loss = toInt(r[A_LOSS]);
    const name = nfc(r[A_NAME]);
    const date = normDate(r[A_DATE]);

    // 유효 행 판정: 최소한 연도가 있어야 승인건으로 집계
    if (!year) continue;
    totalApproved++;
    lossDaysTotal += loss;

    if (!byYear[year]) byYear[year] = { count: 0, lossDays: 0 };
    byYear[year].count++;
    byYear[year].lossDays += loss;

    byType[type] = (byType[type] || 0) + 1;

    if (!byDept[dept]) byDept[dept] = { count: 0, lossDays: 0 };
    byDept[dept].count++;
    byDept[dept].lossDays += loss;

    // ── 연계 매칭 ──
    if (accIdx && overlapYears.has(year) && name && date) {
      approvedInOverlap++;
      if (accIdx.exact.has(`${name}|${date}`)) {
        matchedExact++;
      } else {
        const cands = accIdx.byName.get(name) || [];
        if (cands.some(d => dayDiff(d, date) <= 3)) matchedFuzzy++;
      }
    }
  }

  const yearArr = Object.entries(byYear)
    .map(([year, v]) => ({ year: +year, count: v.count, lossDays: v.lossDays }))
    .sort((a, b) => a.year - b.year);
  const typeArr = Object.entries(byType)
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count);
  const deptArr = Object.entries(byDept)
    .map(([dept, v]) => ({ dept, count: v.count, lossDays: v.lossDays }))
    .sort((a, b) => b.count - a.count);

  const matchedTotal = matchedExact + matchedFuzzy;
  const linkage = accIdx ? {
    accidentTotal: accIdx.total,
    accidentSanjaeApplied: accIdx.sanjaeApplied,
    overlapYears: [...overlapYears].sort(),
    approvedInOverlap,
    matchedExact,
    matchedFuzzy,
    matchedTotal,
    unmatchedInOverlap: approvedInOverlap - matchedTotal,
    matchRate: approvedInOverlap > 0
      ? parseFloat((matchedTotal / approvedInOverlap * 100).toFixed(1))
      : null,
    note: '사고이력(근로자사고DB)에서 해당 승인건을 찾은 비율. 이름+재해일자(정확) 또는 동일인 ±3일(근접). 2023년 등 사고DB 미수록 기간은 제외.',
  } : null;

  return {
    totalApproved,
    lossDaysTotal,
    lossDaysAvg: totalApproved > 0 ? parseFloat((lossDaysTotal / totalApproved).toFixed(1)) : 0,
    byYear: yearArr,
    byType: typeArr,
    byDept: deptArr,
    linkage,
  };
}

// ── 실행 ────────────────────────────────────────────────────────
console.log('산재 승인 현황 집계 시작...');
const approvalRows = readApprovalRows();
console.log(`   승인DB 행수: ${approvalRows.length}`);
const accIdx = readAccidentIndex();
if (accIdx) console.log(`   사고DB 행수: ${accIdx.total} (산재 신청 ${accIdx.sanjaeApplied}건)`);

const data = processApproval(approvalRows, accIdx);

const output = `// === Auto-generated by proj/scripts/extract-approval.mjs ===
// 1차: DB/산재승인현황.xlsx (전부 승인 건) × DB/근로자사고DB.xlsx (전체 사고 이력) 매칭
// 2차: HR API 자동 연동 예정.  개인정보 없이 집계값만 포함.
// processed/*.csv 는 절대 수정 금지.

const APPROVAL_DATA = ${JSON.stringify(data, null, 2)};
export default APPROVAL_DATA;
`;

writeFileSync(OUT, output, 'utf8');
console.log(`\n✓ approvalData.js 생성 완료`);
console.log(`  승인 ${data.totalApproved}건 · 근로손실 ${data.lossDaysTotal.toLocaleString()}일 (평균 ${data.lossDaysAvg}일)`);
if (data.linkage) {
  const L = data.linkage;
  console.log(`  연계: 겹치는기간 승인 ${L.approvedInOverlap}건 중 ${L.matchedTotal}건 매칭 (${L.matchRate}%) — 정확 ${L.matchedExact} + 근접 ${L.matchedFuzzy}`);
}

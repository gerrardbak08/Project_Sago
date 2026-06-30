// 라이브 데이터 소스 어댑터 + 변환기 (Source of Truth)
// ─────────────────────────────────────────────────────────────────────────
// 기본 원칙: 데이터 출처는 여기 한 곳에서만 정의. 시트 갱신 → 자동 수치 전환.
//   현재: Google Sheet(사고경위DB/산재승인DB) ← Apps Script "산재 대시보드 API v4.0"
//   추후: 사내 API 로 교체 시 SOURCE/fetchLiveSnapshot 만 바꾸면 화면 무수정.
//
// 라이브 rows(영문 필드) → 우리 processAccidents 가 기대하는 한글 컬럼 스키마로
// 매핑한 뒤 processAccidents() 에 먹여, 기존 workerData.js 와 동일한 shape 를 만든다.
// (탭 코드 재작성 0). 성명·사번은 클라이언트 도달 즉시 마스킹.

import { processAccidents } from './processAccidents.js';
import { processStores }    from './processStores.js';
import PARJANG_BY_STORE     from '../data/parjangByStore.js';

export const SOURCE = {
  kind: 'apps-script',
  endpoint:
    'https://script.google.com/macros/s/AKfycbzOV88CCiR7bgoMOfvFESik2mWtKoD6VJFQnS1-L6dFF2us2BYM9KzQjFHMmMk8VBYk/exec',
  rawDbUrl:
    'https://docs.google.com/spreadsheets/d/1pWfoDWXSowQRHBbIiVDgEd_0oK2XcFxtG4R5Kryvfus/edit',
};

// ── PII 마스킹 ──
function maskName(name) {
  const s = String(name ?? '').trim();
  if (!s) return null;
  return s[0] + '*'.repeat(Math.max(1, s.length - 1));   // 홍길동 → 홍**
}
function hashEmp(emp) {
  const s = String(emp ?? '').trim();
  if (!s) return null;
  let h = 0x811c9dc5;                                     // FNV-1a 32bit
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return 'AD-' + h.toString(36).toUpperCase().slice(0, 6); // 사번 → 안정적 익명 키(재발재해자 추적용)
}
// 자유텍스트(사고 내용)에 등장하는 알려진 성명 일괄 마스킹 — 본인/타인 교차언급 모두 차단
function scrubNames(text, nameSet) {
  let s = String(text ?? '');
  if (!s || !nameSet || !nameSet.size) return s || null;
  for (const nm of nameSet) {
    if (nm && nm.length >= 2 && s.includes(nm)) s = s.split(nm).join(nm[0] + '*'.repeat(nm.length - 1));
  }
  return s || null;
}

const toInt = (v) => { const n = Number(String(v ?? '').replace(/,/g, '').trim()); return Number.isFinite(n) ? n : 0; };

// ── 라이브 row → 사고경위서(accRows) 한글 컬럼 스키마 ──
// 라이브가 못 채우는 컬럼(파트장·나이·성별·고용형태·근속·상해부위·상병명·공상비용·
// 근로복지공단 제출)은 null → 해당 파생(인적요인·심각도상병·비용·법적제출)은 '비자동'.
export function liveRowToAcc(r, nameSet) {
  const date = String(r.accidentDate ?? '').slice(0, 10);
  const approved = String(r.approvalYn ?? '').trim() === 'Y';
  return {
    '년': toInt(r.year),
    '월': toInt(r.month),
    '부서': r.stdDept || '정보 없음',
    '팀명': r.stdTeam || '정보 없음',
    '파트장': PARJANG_BY_STORE[r.store] || null,   // 라이브 시트에 파트장 없음 → 매장명으로 기존 데이터 매칭 보강
    '매장명': r.store || '정보 없음',
    '재해자명': maskName(r.victimName),
    '재해일자': date ? `${date}T00:00:00` : null,
    '재해 종류': r.accidentType || '기타',
    '재해 유형': r.accidentType || '기타',
    '기인물': r.causeObject || null,
    '사고 내용': scrubNames(r.accidentContent, nameSet),
    '나이대': null,
    '나이': null,
    '성별': null,
    '고용형태': null,
    '근속기간 (년)': null,
    '상해부위 (근골격계)': null,
    '상병명': null,
    '근로손실일수': r.lostDays != null ? toInt(r.lostDays) : null,
    '공상 비용 계': null,
    '사번': hashEmp(r.employeeNo),
    '신청유형': approved ? '산재' : null,
    '근로복지공단 제출': approved ? 'Y' : null,
  };
}

// 산재승인 기준 = 사고경위에서 승인(approvalYn=Y) & 출퇴근재해 제외 (라이브 검증: 210건)
export function isApprovalRow(r) {
  return String(r.approvalYn ?? '').trim() === 'Y' && String(r.accidentType ?? '') !== '출퇴근';
}

// ── 라이브 rows + 매장 마스터(raw) → workerData.js 동일 shape ──
// storesRaw = data/raw/stores.json 의 .data (매장 좌표/형태/평수 마스터; 라이브 미보유분 보충)
// opts.basis: 'incident'(사고경위 612 · 기본) | 'approval'(산재승인 210)
// opts.approvalIds: 산재승인DB recordId Set (정본). 있으면 이 집합으로 정확히 필터(=210).
export function buildWorkerDataFromLive(liveRows, storesRaw, opts = {}) {
  const all = liveRows || [];
  const nameSet = new Set(all.map((r) => r.victimName).filter(Boolean)); // 전체 기준으로 스크럽
  let scope = all;
  if (opts.basis === 'approval') {
    scope = opts.approvalIds ? all.filter((r) => opts.approvalIds.has(r.recordId)) : all.filter(isApprovalRow);
  }
  const accRows = scope.map((r) => liveRowToAcc(r, nameSet));
  const stores  = processStores(storesRaw || []);
  return processAccidents(accRows, stores, null);   // workers=null → IR/인적 섹션은 비자동
}

// ── 출처에서 raw rows 가져오기 (브라우저/Node18+) ──
export async function fetchLiveSnapshot({ division = '안전보건팀', year = '전체', month = '전체' } = {}) {
  if (SOURCE.kind !== 'apps-script') throw new Error(`unknown source: ${SOURCE.kind}`);
  const u = new URL(SOURCE.endpoint);
  u.searchParams.set('action', 'startup');
  u.searchParams.set('division', division);
  u.searchParams.set('year', String(year));
  u.searchParams.set('month', String(month));
  const res = await fetch(u, { redirect: 'follow', cache: 'no-store' });
  if (!res.ok) throw new Error(`source HTTP ${res.status}`);
  const j = await res.json();
  if (!j || j.ok !== true) throw new Error('source returned not ok');
  return { rows: j.rows || [], approvalRows: j.approvalRows || [], init: j.init, fetchedAt: new Date().toISOString() };
}

// ── 앱 진입점: fetch → 변환 → workerData shape ──
export async function loadLiveWorkerData(params, storesRaw) {
  const snap = await fetchLiveSnapshot(params);
  return buildWorkerDataFromLive(snap.rows, storesRaw);
}

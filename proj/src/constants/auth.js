// 부문별 접근 로그인 (코드 고정 · 소프트 게이트)
// ─────────────────────────────────────────────────────────────────────────
// ⚠️ 여기 비밀번호는 클라이언트 번들에 그대로 노출됩니다. 이 로그인은 "부문 편의 분리"용
//    소프트 게이트이며 실제 기밀 격리가 아닙니다(전체 데이터는 여전히 브라우저에 로드됨).
//    진짜 부서/부문 데이터 격리가 필요해지면 서버(Apps Script)가 스코프별 데이터만
//    반환하도록 승격해야 합니다. — 플랜: Track A "소프트 게이트 한계" 참고.
//
// 비밀번호 변경: 아래 pw 값만 바꾸면 됩니다(재배포 필요).

// label = 로그인 화면 표시명, bum = 데이터의 x.bum 값(수도권/지방), master = 전사 전체 접근
// 부문(수도권/지방) 로그인은 보류 — 부문 데이터 나누기를 추후로 미룸. 되살리려면 아래 두 줄 복원:
//   { label: '수도권영업부문', bum: '수도권', pw: '1111' },
//   { label: '지방영업부문',   bum: '지방',   pw: '2222' },
export const DIVISIONS = [
  { label: '안전보건팀', bum: null, pw: '9999', master: true },
];

// 로그인 성공 → scope 객체. { all:true } = 전사, { bum } = 해당 부문만.
// 스코프는 데이터만 부문으로 나눈다(탭/기능 제한 없음 — "부문별로만 나누도록" 결정 반영).
export function verifyLogin(label, pw) {
  const d = DIVISIONS.find((x) => x.label === label);
  if (!d || String(pw) !== String(d.pw)) return null;
  return d.master ? { all: true, label: d.label } : { bum: d.bum, label: d.label };
}

export const SCOPE_STORAGE_KEY = 'sago_scope_v1';

const DAISO_RED = "#D70011";
const ALERT_RED = "#B91C1C";    // 위험 경고 (Tailwind red-700)
const SAFE_GREEN = "#047857";   // 안전·정상 (emerald-700 — 기존 green-700 #15803D 대비 톤다운·고급화)
const CUSTOMER_BLUE = "#0EA5E9"; // 고객사고 모드 (Tailwind sky-500)
const DEEP_BLUE = "#13245A";    // 공식 Pantone 별색 기준
const DAISO_GRAY = "#96969A";   // 공식 다크 그레이

// === UI TOKENS ===
const CANVAS = "#FAFAF9";       // 페이지 배경
const SURFACE = "#FFFFFF";      // 카드 
const SUBTLE = "#F5F5F4";       // 섹션·호버
const BORDER = "#E7E5E4";       // 경계선 (통일)
const BORDER_HOVER = "#D6D3D1";

// === INK (Text Hierarchy) ===
const INK = "#1C1917";          // near-black
const INK2 = "#44403C";         // 본문
const INK3 = "#78716C";         // 캡션
const INK4 = "#96969A";         // 다이소 공식 gray (단위·연한 텍스트)

// === SEMANTIC ===
const DANGER = "#D70011";       // = 다이소 레드 (브랜드=의미 일치)
const WARN = "#D97706";         // 주의 (amber-600 — 기존 황토 #B45309 교체)
const OK = "#047857";           // 안전 (emerald-700 — 기존 green-700 교체)

// === 차트 색 (newjuna 톤 — 색을 살림) ===
const CHART_BLUE = "#003B8F";   // newjuna 로열 블루 (rank 2위·카드 등)
const BL = "#1D4ED8";           // 수도권 = 선명한 블루
const OR = "#93C5FD";           // 지방 = 연한 블루 (동계열 명도차)
const NV = "#071E4A";           // 네이비
const GR = "#A8A29E";
const RD = DANGER;
const GN = OK;
const PR = "#6366F1";           // 특수 강조용 (매우 제한적)
const AM = WARN;
const PAL = ["#1D4ED8", "#93C5FD", "#CBD5E1", DAISO_RED, OK, WARN]; // 수도권·지방·기타 블루명도차 + 추가카테고리

// 순위 강조 팔레트 — 1위 레드 · 2위 블루 · 나머지 그레이 (newjuna rankColors)
const RANK_COLORS = [DAISO_RED, CHART_BLUE, "#A8A29E", "#A8A29E", "#A8A29E", "#A8A29E"];
const rankColor = (i) => RANK_COLORS[i] || "#A8A29E";

export { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, DAISO_GRAY, CANVAS, SURFACE, SUBTLE, BORDER, BORDER_HOVER, INK, INK2, INK3, INK4, DANGER, WARN, OK, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CHART_BLUE, RANK_COLORS, rankColor };

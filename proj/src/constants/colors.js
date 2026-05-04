const DAISO_RED = "#D70011";
const ALERT_RED = "#B91C1C";    // 위험 경고 (Tailwind red-700)
const SAFE_GREEN = "#15803D";   // 안전·정상 (Tailwind green-700)
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
const WARN = "#B45309";
const OK = "#15803D";

// === 기존 변수명 호환 (차트 등에서 사용) ===
const BL = INK;                 // 수도권 (진한 ink)
const OR = INK4;                // 지방 (다이소 gray) - 모노크롬 구분
const NV = INK;
const GR = "#A8A29E";
const RD = DANGER;
const GN = OK;
const PR = "#6366F1";           // 특수 강조용 (매우 제한적)
const AM = WARN;
const PAL = [INK, INK4, WARN, DAISO_RED, OK, "#6366F1"]; // 6-color minimalist palette

export { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, DAISO_GRAY, CANVAS, SURFACE, SUBTLE, BORDER, BORDER_HOVER, INK, INK2, INK3, INK4, DANGER, WARN, OK, BL, OR, NV, GR, RD, GN, PR, AM, PAL };

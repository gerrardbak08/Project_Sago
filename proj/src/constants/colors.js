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
const AM = "#EA580C";           // 차트 주의/경상 (orange-600 — RISK.mid와 통일, 기존 amber #D97706 흡수)
const PAL = ["#1D4ED8", "#93C5FD", "#CBD5E1", DAISO_RED, OK, AM]; // 수도권·지방·기타 블루명도차 + 추가카테고리

// 순위 강조 팔레트 — 1위 레드 · 2위 블루 · 나머지 그레이 (newjuna rankColors)
const RANK_COLORS = [DAISO_RED, CHART_BLUE, "#A8A29E", "#A8A29E", "#A8A29E", "#A8A29E"];
const rankColor = (i) => RANK_COLORS[i] || "#A8A29E";

// === 통일 차트 팔레트 (옵션 B: 블루 시퀀셜 + 의미색 최소 · 2026-07 정본화) ===
// 색 정본은 이 파일 하나. riskColors.js 는 하위호환 re-export shim.
// 카테고리 계열 — 대부분 차트(계열 ≤5). 명도·hue 분산으로 흑백 인쇄도 구분.
const CHART_CATEGORICAL = ["#003B8F", "#1D4ED8", "#93C5FD", "#6366F1", "#A8A29E"];
// 지도 등 진짜 다항목(6+) 전용 — 빨강·주황 배제(위험마커 의미충돌 방지), 색각안전 큐레이션.
const CHART_CATEGORICAL_MAP = ["#003B8F", "#0F766E", "#6366F1", "#0891B2", "#7C3AED", "#64748B", "#A16207", "#BE185D"];
// 순차(heat) 2종 — 개념별 분리. NEUTRAL=밀도/볼륨, RISK=위험/심각 강도.
const HEAT_NEUTRAL = ["#EFF6FF", "#BFDBFE", "#60A5FA", "#1D4ED8", "#003B8F"];
const HEAT_RISK    = ["#FEF2F2", "#FECACA", "#F97316", "#EA580C", "#D70011"];
// 의미색 — 브랜드 레드=위험 독점.
const SEVERITY_COLORS = { "중상": "#D70011", "경상": "#EA580C", "기타": "#A8A29E", "미상": "#CBD5E1" };
const REGION_COLORS   = { "수도권": "#1D4ED8", "지방": "#93C5FD", "기타": "#CBD5E1" };
const RISK_COLORS     = { high: "#D70011", mid: "#EA580C", low: "#F59E0B", safe: "#78716C" };

export { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, DAISO_GRAY, CANVAS, SURFACE, SUBTLE, BORDER, BORDER_HOVER, INK, INK2, INK3, INK4, DANGER, WARN, OK, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CHART_BLUE, RANK_COLORS, rankColor, CHART_CATEGORICAL, CHART_CATEGORICAL_MAP, HEAT_NEUTRAL, HEAT_RISK, SEVERITY_COLORS, REGION_COLORS, RISK_COLORS };

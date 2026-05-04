import { CUSTOMER_BLUE } from './colors.js';

const CUST_BLUE  = CUSTOMER_BLUE;
const CUST_AMBER = "#F59E0B";
const CUST_TEAL  = "#14B8A6";
const CUST_ROSE  = "#F43F5E";
const CUST_GRAY  = "#6B7280";
const CUST_PAL   = [CUST_BLUE, CUST_AMBER, CUST_TEAL, CUST_ROSE, CUST_GRAY, "#A78BFA", "#34D399", "#FB923C"];
const TYPE_COLOR = {"낙상":CUST_BLUE,"재물":CUST_AMBER,"충돌":CUST_TEAL,"자상":CUST_ROSE,"클레임":CUST_GRAY,"낙성":"#A78BFA"};

// 새 메뉴 순서: 요약 → 부서·팀 → 유형·장소 → 보상·처리 → 매장워치 → 피해자현황

// ── 연도별 정확한 필터: y24/y25/y26 컬럼이 있는 항목은 직접 사용 ──
export { CUST_BLUE, CUST_AMBER, CUST_TEAL, CUST_ROSE, CUST_GRAY, CUST_PAL, TYPE_COLOR };

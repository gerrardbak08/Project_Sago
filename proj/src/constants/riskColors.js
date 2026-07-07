// 색 정본은 colors.js 하나로 통합됨. 이 파일은 하위호환 re-export shim.
// (기존 8개 컴포넌트가 여기서 RISK_COLORS를 import 중 — 임포트 경로 유지)
import { RISK_COLORS } from './colors.js';

export { RISK_COLORS };

// 공통 포맷 유틸 + 공유 컴포넌트 단일 소스 재노출
// TT·EmptyState·Card 는 shared/Card.jsx 가 유일 정의 — 여기서 re-export 만 한다.
// (기존 import 경로 무변경 유지: 소비 파일들이 uiHelpers 에서 가져와도 동일 컴포넌트)
export { TT, EmptyState, Card } from '../components/shared/Card.jsx';

export const pct = (v, t) => t ? ((v / t) * 100).toFixed(1) : "0.0";
export const fmt = (n) => n?.toLocaleString?.() ?? n;
export const fmtKrw = (n) => n ? `${(n / 10000).toFixed(0)}만` : "0";

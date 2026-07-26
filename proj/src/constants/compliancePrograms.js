// 안전보건 활동(컴플라이언스) 프로그램 단일 소스
// ─────────────────────────────────────────────────────────────────────────
// 위험성평가 · 비상대응훈련 · TBM 은 "매장이 주기적으로 해야 하는 활동을 했는가/최신인가"를
// 추적한다는 점에서 구조가 동일하다. 프로그램별 차이(주기·라벨·색)만 여기서 정의하고,
// 공통 ComplianceMonitor 뷰가 이 설정을 받아 렌더한다. → 새 활동 추가 = 여기 항목 1개.

export const PROGRAMS = {
  risk: {
    id: 'risk', label: '위험성평가', short: '위험성평가',
    cadenceDays: 180, unit: '평가', accent: '#B45309',
    desc: '매장별 위험성평가 실시·갱신 현황 (반기 1회 이상)',
    kpi: { done: '평가 완료 매장', rate: '실시율', overdue: '미실시·기한초과', recent: '최근 반기 실시' },
    period: '반기',
    // 실시 기록 입력 필드(매장·일자·담당자·비고는 공통, 아래는 프로그램 고유)
    fields: [
      { key: 'assessType', label: '평가 유형', type: 'select', options: ['정기', '수시', '최초'] },
      { key: 'hazards', label: '발굴 위험요인', type: 'number', unit: '건' },
    ],
  },
  drill: {
    id: 'drill', label: '비상대응훈련', short: '비상훈련',
    cadenceDays: 180, unit: '훈련', accent: '#D70011',
    desc: '화재·대피 등 비상대응훈련 실시 현황 (반기 1회 이상)',
    kpi: { done: '훈련 실시 매장', rate: '실시율', overdue: '미실시·기한초과', recent: '최근 반기 실시' },
    period: '반기',
    fields: [
      { key: 'scenario', label: '훈련 시나리오', type: 'select', options: ['화재대피', '지진', '정전', '응급처치', '기타'] },
      { key: 'attendees', label: '참석 인원', type: 'number', unit: '명' },
    ],
  },
  tbm: {
    id: 'tbm', label: 'TBM현황', short: 'TBM',
    cadenceDays: 7, unit: 'TBM', accent: '#1D4ED8',
    desc: '매장별 일일 안전미팅(TBM) 실시 현황 (주 단위 점검)',
    kpi: { done: '금주 실시 매장', rate: '주간 실시율', overdue: '금주 미실시', recent: '평균 참석' },
    period: '주간',
    fields: [
      { key: 'topic', label: '주제', type: 'text', placeholder: '예: 지게차 주변 통행 주의' },
      { key: 'attendees', label: '참석 인원', type: 'number', unit: '명' },
    ],
  },
};

// 마지막 실시 이후 경과일 → 상태. cadence 이내=정상, 1.5배 이내=임박, 초과=기한초과, 기록없음=미실시.
export function statusOf(daysSince, cadenceDays) {
  if (daysSince == null) return 'never';
  if (daysSince <= cadenceDays) return 'ok';
  if (daysSince <= cadenceDays * 1.5) return 'due';
  return 'overdue';
}

export const STATUS_META = {
  ok:      { label: '정상',     color: '#047857', soft: '#ECFDF5', border: '#A7F3D0' },
  due:     { label: '임박',     color: '#B45309', soft: '#FFFBEB', border: '#FDE68A' },
  overdue: { label: '기한초과', color: '#D70011', soft: '#FEF2F2', border: '#FECACA' },
  never:   { label: '미실시',   color: '#78716C', soft: '#F5F5F4', border: '#E7E5E4' },
};

export const STATUS_ORDER = ['ok', 'due', 'overdue', 'never'];

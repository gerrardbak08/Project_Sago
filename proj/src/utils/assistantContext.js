// 안전 도우미 데이터 컨텍스트 — 대시보드 집계를 챗봇 system 프롬프트용 다이제스트로 변환.
// ─────────────────────────────────────────────────────────────────────────
// 핵심 원칙: 소스 무관. baked(workerData/customerData)든 향후 실시간 연동이든
//   동일한 `data`(processAccidents 형태) + CUSTOMER_DATA 형태만 유지되면 자동 반영된다.
//   → 나중에 라이브가 붙어도 이 파일·챗봇 무수정. (liveSource 어댑터가 같은 shape 유지)
// raw rows 전체가 아니라 '집계/Top-N'만 넣어 토큰을 제한한다.

import CUSTOMER_DATA from '../data/customerData.js';
import { STORE_SNAPSHOTS, WORKER_SNAPSHOTS } from '../data/snapshots.js';
import { SAFETY_ASSISTANT_SYSTEM } from '../data/guideKnowledge.js';

const won = (v) => {
  v = Number(v) || 0;
  if (v >= 1e8) return (v / 1e8).toFixed(1) + '억원';
  if (v >= 1e4) return Math.round(v / 1e4).toLocaleString() + '만원';
  return Math.round(v).toLocaleString() + '원';
};
const num = (v) => (Number(v) || 0).toLocaleString();
const last = (a) => (Array.isArray(a) && a.length ? a[a.length - 1] : null);
const topObj = (o, k = 6) =>
  Object.entries(o || {}).filter(([, c]) => Number(c) > 0).sort((a, b) => b[1] - a[1]).slice(0, k)
    .map(([t, c]) => `${t} ${num(c)}`).join(' · ') || '—';
const topArr = (arr, k, fn) =>
  [...(arr || [])].slice(0, k).map(fn).filter(Boolean).join(' · ') || '—';

// 근로자 산재 다이제스트
function workerDigest(data, basisLabel) {
  if (!data || !data.kpis) return '';
  const k = data.kpis;
  const depts = [...(data.depts || [])].sort((a, b) => b.total - a.total);
  const teams = [...(data.teams || [])].sort((a, b) => b.total - a.total);
  const stores = [...(data.stores || [])].sort((a, b) => (b.total || 0) - (a.total || 0));
  const rs = data.repeat_stores || {};
  const rw = data.repeat_workers || {};
  const sev = (data.severity && data.severity.dist) || {};
  const ap = data.apply_type || {};
  const loc = data.location || {};
  const lastM = last(data.monthly || []);
  const y26Label = lastM && lastM.y === 2026 ? `(1~${lastM.m}월)` : '';
  const lines = [
    `### 근로자 산재 (기준: ${basisLabel} · 연도 전체)`,
    `- 총 ${num(k.total)}건 — 수도권 ${num(k.sudo)} · 지방 ${num(k.jibang)} · 기타 ${num(k.etc)}`,
    `- 연도별: 2024 ${num(k.y2024)} · 2025 ${num(k.y2025)} · 2026 ${num(k.y2026)}${y26Label}`,
    `- 재해유형(정본) Top: ${topObj(data.injuryCanon || data.injury, 7)}`,
    `- 기인물 Top: ${topObj(data.cause, 5)}`,
    `- 심각도: 중상 ${num(sev['중상'])} · 경상 ${num(sev['경상'])} · 기타 ${num(sev['기타'])} · 미상 ${num(sev['미상'])}`,
    `- 산재 신청: ${num(ap['산재'] ?? k.submitted)}건 / 미신청 ${num(ap['null'] ?? k.not_submitted)}건`,
    (k.loss_days_total ? `- 근로손실: 총 ${num(k.loss_days_total)}일(평균 ${k.loss_days_avg || 0}일)` : ''),
    (k.cost_count ? `- 공상비용(실측 일부): 총 ${won(k.cost_total)} · 평균 ${won(k.cost_avg)}(${num(k.cost_count)}건)` : ''),
    (k.female || k.male ? `- 성별(참고): 여 ${num(k.female)} · 남 ${num(k.male)}` : ''),
    `- 사고 많은 부서 Top3: ${topArr(depts, 3, d => `${d.dept} ${num(d.total)}건`)}`,
    `- 사고 많은 팀 Top3: ${topArr(teams, 3, t => `${t.team}(${t.dept}) ${num(t.total)}건`)}`,
    `- 사고 다발 매장 Top5: ${topArr(stores, 5, s => `${s.store} ${num(s.total)}건${s.top_type ? `(${s.top_type})` : ''}`)}`,
    (rs.list && rs.list.length ? `- 반복사고 매장 Top5: ${topArr(rs.list, 5, s => `${s.store} ${num(s.count)}건`)}` : ''),
    (rw.repeat_count ? `- 재발재해자: ${num(rw.repeat_count)}명 / ${num(rw.repeat_incidents)}건 (사고자 ${num(rw.total_workers)}명 중)` : ''),
    (loc.totals && loc.totals.length ? `- 발생 장소 Top5(사고경위 서술 추출 · 장소 확인 ${num(loc.matched)}/${num(loc.total)}건): ${topArr(loc.totals.filter(l => l.id !== 'unknown'), 5, l => `${l.label} ${num(l.n)}건${l.loss_days_avg != null ? `(평균휴업 ${l.loss_days_avg}일)` : ''}`)}` : ''),
    (loc.severity && loc.severity.length ? `- 고위험 유형×장소(평균 휴업일수 순 · 표본 5건+): ${topArr(loc.severity, 3, c => `${c.type}@${c.locLabel} ${c.loss_days_avg}일(${c.n}건)`)}` : ''),
  ];
  return lines.filter(Boolean).join('\n');
}

// 고객 안전사고 다이제스트
function customerDigest(c) {
  if (!c || !c.kpis_all) return '';
  const k = c.kpis_all;
  const yr = (c.yearly || []).map(y => `${y.y} ${num(y.t)}`).join(' · ');
  return `### 고객 안전사고 (연도 전체)
- 총 ${num(k.total)}건 — 보상 ${num(k.comp_count)}건 · 총보상 ${won(k.total_comp)} · 평균 ${won(k.avg_comp)} · 평균해결 ${k.avg_days}일 · 진행중 ${num(k.still_open)}건
- 성별: 여 ${num(k.female)} · 남 ${num(k.male)}
- 연도별: ${yr}
- 사고유형 Top5: ${topArr(c.types, 5, t => `${t.type} ${num(t.total)}건(${won(t.comp)})`)}
- 사고장소 Top5: ${topArr(c.places, 5, p => `${p.place} ${num(p.total)}`)}
- 원인 Top: ${topArr(c.causes1, 5, x => `${x.c} ${num(x.n)}`)}
- 위험매장 Top5: ${topArr(c.store_watchlist, 5, s => `${s.store} ${num(s.total)}건(${s.tp || '-'})`)}`;
}

/**
 * 챗봇 system 프롬프트 전체 = 매뉴얼·규칙(SAFETY_ASSISTANT_SYSTEM) + 대시보드 데이터 다이제스트.
 * @param {object|null} data  processAccidents 형태(근로자 산재, 현재 basis·연도 전체)
 * @param {{basis?: 'incident'|'approval'}} opts
 */
export function buildAssistantSystem(data, { basis = 'incident' } = {}) {
  const basisLabel = basis === 'approval' ? '산재승인' : '사고경위';
  const s = last(STORE_SNAPSHOTS);
  const w = last(WORKER_SNAPSHOTS);
  const scale = s || w
    ? `### 규모 (${(s || w).ym} 기준)
- 영업매장 약 ${num(s?.count)}개 · 평균 ${s?.avg_area ?? '-'}평 · 근로자 약 ${num(w?.workers)}명`
    : '';

  const digest = [
    '## 대시보드 데이터 다이제스트 (집계 · 참고자료)',
    '아래는 대시보드 집계 수치다. 데이터 질문은 반드시 이 수치에 근거해 답한다.',
    '- 여기 없는 특정 개인(직원명·사번)·특정 매장의 상세 이력은 아직 제공되지 않는다. 그런 질문에는 "현재는 집계 수준만 제공되며, 개인·매장 단위 상세는 데이터 실시간 연동 후 제공될 예정"이라고 안내한다.',
    '- 추정하지 말고 제시된 수치 그대로 사용한다. 없는 수치는 지어내지 않는다.',
    scale,
    workerDigest(data, basisLabel),
    customerDigest(CUSTOMER_DATA),
  ].filter(Boolean).join('\n\n');

  return `${SAFETY_ASSISTANT_SYSTEM}\n\n${digest}`;
}

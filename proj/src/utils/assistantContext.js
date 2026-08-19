// 안전 도우미 데이터 컨텍스트 — 대시보드 집계를 챗봇 system 프롬프트용 다이제스트로 변환.
// ─────────────────────────────────────────────────────────────────────────
// 핵심 원칙: 소스 무관. baked(workerData/customerData)든 향후 실시간 연동이든
//   동일한 `data`(processAccidents 형태) + CUSTOMER_DATA 형태만 유지되면 자동 반영된다.
//   → 나중에 라이브가 붙어도 이 파일·챗봇 무수정. (liveSource 어댑터가 같은 shape 유지)
// raw rows 전체가 아니라 '집계/Top-N'만 넣어 토큰을 제한한다.

import CUSTOMER_DATA from '../data/customerData.js';
import { STORE_SNAPSHOTS, WORKER_SNAPSHOTS } from '../data/snapshots.js';
import { SAFETY_ASSISTANT_SYSTEM } from '../data/guideKnowledge.js';
import { salesOnly, observationPeriod, withEal, totalEal } from './eal.js';

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
  // 재해종류(kind) — 법적·산재 탭이 쓰는 정본. 모수가 전체(all)라 아래 injuryCanon(영업부문만)과
  // 같은 항목이라도 건수가 다르다. 예: 출퇴근 kind=41 vs injuryCanon=39. 모수를 명시하지 않으면
  // 챗봇이 화면과 다른 숫자를 말한다(같은 사실, 두 숫자).
  const kindLine = topObj(data.kind, 8);

  // 심각도는 원본에 상병 정보가 없어 사실상 전 건이 '미상'이다. "중상 0건"으로 답하면
  // '중상이 없다'는 뜻이 되어버려 사실과 다르다 — 0이 아니라 '모른다'가 정답이다.
  const sevKnown = (Number(sev['중상']) || 0) + (Number(sev['경상']) || 0) + (Number(sev['기타']) || 0);

  // EAL(연간 기대손실) — 비용 손실 탭 정본. 사망 제외·신뢰도 가중. 설계문서 §3.
  let ealLine = '';
  try {
    const sales = salesOnly(data.accidents || []);
    const p = observationPeriod(sales);
    if (p.years) {
      const eal = totalEal(withEal(sales, p));
      ealLine = `- 연간 기대손실(EAL): ${won(eal)}/년 (관측 ${p.firstYm}~${p.lastCompleteYm} · ${p.years.toFixed(1)}년 · 영업부문 기준 · 사망 제외)`;
    }
  } catch { /* 집계 실패 시 EAL 줄만 생략 */ }

  const lines = [
    `### 근로자 산재 (기준: ${basisLabel} · 연도 전체)`,
    `- 총 ${num(k.total)}건 — 수도권 ${num(k.sudo)} · 지방 ${num(k.jibang)} · 기타 ${num(k.etc)}`,
    `- 연도별: 2024 ${num(k.y2024)} · 2025 ${num(k.y2025)} · 2026 ${num(k.y2026)}${y26Label}`,
    `- 재해종류(전체 ${num(k.total)}건 기준 · 법적 보고 정본): ${kindLine}`,
    `- 재해유형(영업부문 ${num((data.accidents || []).length ? salesOnly(data.accidents).length : 0)}건 기준 · 위 재해종류와 모수가 달라 같은 항목도 건수가 다를 수 있다): ${topObj(data.injuryCanon || data.injury, 7)}`,
    `- 기인물 Top: ${topObj(data.cause, 5)}`,
    // subCauseTotals 는 객체가 아니라 [{type,id,label,n}] 배열이다(topObj 를 쓰면 조용히 빈 값이 된다).
    (Array.isArray(data.subCauseTotals) && data.subCauseTotals.length
      ? `- 세부원인 Top(재해유형별 causeTaxonomy): ${topArr([...data.subCauseTotals].sort((a, b) => b.n - a.n), 6, c => `${c.label}(${c.type}) ${num(c.n)}`)}` : ''),
    (sevKnown > 0
      ? `- 심각도: 중상 ${num(sev['중상'])} · 경상 ${num(sev['경상'])} · 기타 ${num(sev['기타'])} · 미상 ${num(sev['미상'])}`
      : `- 심각도: 원본에 상병 정보가 없어 전 건 '미상'이다. 중상·경상 건수를 묻는 질문에는 "심각도는 기록되지 않아 알 수 없다"고 답하고, 0건이라고 말하지 않는다.`),
    `- 산재 신청 확인: ${num(ap['산재'] ?? k.submitted)}건. 나머지는 신청 여부가 기록되지 않은 건으로 '미신청'과 구분되지 않는다. 미신청·미제출 건수로 답하지 말 것(법정 의무 미이행으로 오해됨).`,
    (k.loss_days_total ? `- 근로손실: 총 ${num(k.loss_days_total)}일(평균 ${k.loss_days_avg || 0}일)` : ''),
    ealLine,
    (k.cost_count ? `- 공상비용(실측 일부): 총 ${won(k.cost_total)} · 평균 ${won(k.cost_avg)}(${num(k.cost_count)}건)` : ''),
    (k.female || k.male ? `- 성별(참고): 여 ${num(k.female)} · 남 ${num(k.male)}` : ''),
    `- 사고 많은 부서 Top3: ${topArr(depts, 3, d => `${d.dept} ${num(d.total)}건`)}`,
    `- 사고 많은 팀 Top3: ${topArr(teams, 3, t => `${t.team}(${t.dept}) ${num(t.total)}건`)}`,
    `- 사고 다발 매장 Top5: ${topArr(stores, 5, s => `${s.store} ${num(s.total)}건${s.top_type ? `(${s.top_type})` : ''}`)}`,
    (rs.list && rs.list.length ? `- 반복사고 매장 Top5: ${topArr(rs.list, 5, s => `${s.store} ${num(s.count)}건`)}` : ''),
    (rw.repeat_count ? `- 재발재해자: ${num(rw.repeat_count)}명 / ${num(rw.repeat_incidents)}건 (사고자 ${num(rw.total_workers)}명 중)` : ''),
    (loc.totals && loc.totals.length ? `- 발생 장소 Top5(사고경위 서술 추출 · 장소 확인 ${num(loc.matched)}/${num(loc.total)}건): ${topArr(loc.totals.filter(l => l.id !== 'unknown'), 5, l => `${l.label} ${num(l.n)}건${l.loss_days_avg != null ? `(평균휴업 ${l.loss_days_avg}일)` : ''}`)}` : ''),
    (loc.severity && loc.severity.length ? `- 고위험 유형×장소(평균 휴업일수 순 · 표본 5건+): ${topArr(loc.severity, 3, c => `${c.type}@${c.locLabel} ${c.loss_days_avg}일(${c.n}건)`)}` : ''),
    // 화면(법적·산재·비용 손실 탭)은 이 건을 '사고사망'·'중대재해'로 단정하지 않는다.
    // 챗봇만 단정하면 같은 시스템이 다른 말을 하게 되므로 판단 근거를 함께 준다.
    (Number(data.kind?.['사망']) > 0
      ? `- 사망 ${num(data.kind['사망'])}건: 원본 '재해 종류'가 사고에도 질병에도 속하지 않는 "사망" 단독값이고 산재 미승인 상태다. '사고사망'이나 '중대재해'로 단정하지 말고, 재해 종류가 확정되지 않았음을 함께 알린다.`
      : ''),
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
 * @param {{basis?: 'incident'|'approval', yearFilter?: string}} opts
 *   yearFilter: 화면 상단 연도 필터('all'|'2024'|'2025'|'2026'). 사용자는 필터를 건 화면을
 *   보면서 "몇 건이야?"라고 묻는다. 다이제스트는 연도 전체라, 필터를 알려주지 않으면
 *   챗봇이 화면과 다른 수(전체 664 vs 화면 223)를 말한다.
 */
export function buildAssistantSystem(data, { basis = 'incident', yearFilter = 'all' } = {}) {
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
    yearFilter && yearFilter !== 'all'
      ? `- 사용자는 지금 화면에서 **${yearFilter}년** 필터를 걸어 두고 보고 있다. 아래 수치는 연도 전체 기준이므로, 연도를 특정하지 않은 질문("몇 건이야?")에는 연도별 항목에서 ${yearFilter}년 값을 찾아 답하고 어느 연도 기준인지 함께 밝힌다.`
      : '- 사용자는 지금 화면에서 연도 필터를 "전체"로 두고 보고 있다.',
    scale,
    workerDigest(data, basisLabel),
    customerDigest(CUSTOMER_DATA),
  ].filter(Boolean).join('\n\n');

  return `${SAFETY_ASSISTANT_SYSTEM}\n\n${digest}`;
}

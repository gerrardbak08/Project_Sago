// 규칙기반 안전 현황 자동 브리핑 — LLM 없이 실데이터에서 직접 생성.
// AI 서비스(VITE_AI_URL, Bedrock Claude Lambda) 미연결 시 폴백으로 사용.
// buildRuleBasedBriefing   : 마크다운 문자열 (AiOutput 렌더 — 레거시)
// buildRuleBasedBriefingStructured : aiSchema.js 스키마 객체 (AiBriefing 렌더 — Phase3 이후)

const pct = (n, d) => (d ? Math.round((n / d) * 1000) / 10 : 0);

export function buildRuleBasedBriefing(D) {
  const k = D?.kpis || {};
  const total = k.total || 0;
  const injury = Object.entries(D?.injury || {}).sort((a, b) => b[1] - a[1]);
  const depts = (D?.depts || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
  const stores = (D?.stores || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
  const sev = D?.severe91 || {};
  const yoy = k.y2024 ? pct(k.y2025 - k.y2024, k.y2024) : null;

  const topTypes = injury.slice(0, 3).map(([t, n]) => `${t} ${n}건`).join(' · ');
  const topDepts = depts.slice(0, 3).map((d) => `${d.dept} ${d.total}건`).join(' · ');
  const topStores = stores.slice(0, 3).map((s) => `${s.store}(${s.total}건)`).join(' · ');

  const L = [];
  L.push('## 📊 안전 현황 자동 브리핑 (규칙기반)');
  L.push('');
  L.push('**1. 핵심 현황 요약**');
  L.push(`- 전체 **${total}건** — 2024 ${k.y2024 || 0} → 2025 ${k.y2025 || 0}${yoy != null ? ` (전년比 ${yoy > 0 ? '▲' : '▼'}${Math.abs(yoy)}%)` : ''} → 2026 ${k.y2026 || 0}`);
  if (topTypes) L.push(`- 재해유형 상위: ${topTypes}`);
  if (topDepts) L.push(`- 영업부 상위: ${topDepts}`);
  if (sev.total != null) L.push(`- 중상해(근로손실 91일↑): **${sev.total}건** · 총 근로손실 ${(k.loss_days_total || 0).toLocaleString()}일`);
  L.push('');
  L.push('**2. 가장 시급한 위험 요소**');
  if (injury[0]) L.push(`- 최다 유형 '${injury[0][0]}' ${injury[0][1]}건 = 전체의 ${pct(injury[0][1], total)}% → 집중 예방 대상`);
  if (depts[0]) L.push(`- '${depts[0].dept}' ${depts[0].total}건 최다 발생 → 부문장 우선 점검`);
  if (sev.total) L.push(`- 중상해 ${sev.total}건은 중대재해 인접 사고 → 91일↑ 매장 별도 관리`);
  L.push('');
  L.push('**3. 즉시 실행 권장**');
  if (injury[0]) L.push(`- '${injury[0][0]}' 다발 작업의 표준작업절차(SOP)·안전교육 재점검`);
  if (topStores) L.push(`- 사고 다발 매장 현장 점검: ${topStores}`);
  L.push('- 중상해 발생 매장 재발방지 대책 수립 및 이행 확인');
  L.push('');
  L.push('**4. 모니터링 포인트**');
  L.push('- 월별 사고 추세 · 반복사고 매장(2건↑) · 중상해(91일↑) 건수 · 영업부별 발생률(per-100)');
  L.push('');
  L.push('_※ 데이터 규칙 기반 자동 요약. LLM 정밀 분석은 AI 서비스 연결(VITE_AI_URL) 후 제공됩니다._');
  return L.join('\n');
}

/**
 * aiSchema.js 스키마 형식의 브리핑 객체를 규칙 기반으로 생성.
 * parseAiResponse 가 바로 사용할 수 있는 객체를 반환하므로 JSON.stringify 후
 * aiSummary.setResult() 에 전달한다.
 *
 * @param {object} D  — 대시보드 데이터 (Overview.jsx 의 D prop)
 * @param {{kpiSudo?:object, kpiJibang?:object, monthsElapsed?:number}} opts
 * @returns {{ headline:string, briefing:{현황,위험,권장}, insight_cards:Array }}
 */
export function buildRuleBasedBriefingStructured(D, opts = {}) {
  const { kpiSudo, kpiJibang, monthsElapsed = 6 } = opts;
  const k = D?.kpis || {};
  const total = k.total || 0;
  const injury = Object.entries(D?.injury || {}).sort((a, b) => b[1] - a[1]);
  const stores = (D?.stores || []).slice().sort((a, b) => (b.total || 0) - (a.total || 0));
  const yoy24_25 = k.y2024 ? pct(k.y2025 - k.y2024, k.y2024) : null;

  /* ─── headline ─── */
  const trendStr =
    yoy24_25 !== null
      ? ` · 전년比 ${yoy24_25 > 0 ? '▲' : '▼'}${Math.abs(yoy24_25)}%`
      : '';
  const topTypeName = injury[0]?.[0] || '';
  const headline = `사고 누계 ${total}건${trendStr}${topTypeName ? ' — ' + topTypeName + ' 집중' : ''}`;

  /* ─── briefing ─── */
  const 현황 =
    `전체 사고 ${total}건 (수도권 ${k.sudo || 0}건 · 지방 ${k.jibang || 0}건). ` +
    `연도별 2024년 ${k.y2024 || 0}건 → 2025년 ${k.y2025 || 0}건` +
    (yoy24_25 !== null ? ` (${yoy24_25 > 0 ? '+' : ''}${yoy24_25}%)` : '') +
    ` → 2026년 ${k.y2026 || 0}건 진행 중.`;

  const top1 = injury[0];
  const top2 = injury[1];
  const topStore = stores[0];
  const 위험 =
    (top1
      ? `'${top1[0]}' 유형이 ${top1[1]}건(전체 ${pct(top1[1], total)}%)으로 최다 발생. `
      : '') +
    (top2 ? `'${top2[0]}' ${top2[1]}건이 뒤를 이음. ` : '') +
    (topStore ? `'${topStore.store}' 매장에서 ${topStore.total}건 집중 발생.` : '');

  const 권장 =
    (top1 ? `'${top1[0]}' 다발 작업 SOP·안전교육 즉시 재점검. ` : '') +
    (topStore ? `'${topStore.store}' 등 사고다발 매장 현장 점검 실시. ` : '') +
    `반복사고(2건 이상) 매장 재발방지 대책 수립 및 월별 이행 확인.`;

  /* ─── insight_cards ─── */
  const cards = [];

  // 전년대비 카드
  if (yoy24_25 !== null) {
    const diff = (k.y2025 || 0) - (k.y2024 || 0);
    cards.push({
      title: '전년대비',
      metric: `${yoy24_25 > 0 ? '+' : ''}${yoy24_25}%`,
      delta: `${diff > 0 ? '▲' : '▼'}${Math.abs(diff)}건`,
      tone: yoy24_25 > 0 ? 'up' : 'down',
      note: `'24년 ${k.y2024}건 → '25년 ${k.y2025}건`,
    });
  }

  // 최다 재해유형 카드
  if (top1) {
    cards.push({
      title: '최다유형',
      metric: `${top1[1]}건`,
      delta: `${pct(top1[1], total)}%`,
      tone: 'alert',
      note: top1[0],
    });
  }

  // 수도권 KPI 카드
  if (kpiSudo && kpiSudo.status !== 'unknown') {
    const deltaN = kpiSudo.delta != null ? Math.abs(Math.round(kpiSudo.delta)) : null;
    cards.push({
      title: '수도권 KPI',
      metric: `${kpiSudo.actual}건`,
      delta: deltaN != null ? `${kpiSudo.delta > 0 ? '▲' : '▼'}${deltaN}건` : '',
      tone:
        kpiSudo.status === 'miss' ? 'up' :
        kpiSudo.status === 'near' ? 'alert' : 'down',
      note: `${monthsElapsed}M 목표 ${kpiSudo.target != null ? Math.round(kpiSudo.target) : '—'}건`,
    });
  }

  // 지방 KPI 카드
  if (kpiJibang && kpiJibang.status !== 'unknown') {
    const deltaN = kpiJibang.delta != null ? Math.abs(Math.round(kpiJibang.delta)) : null;
    cards.push({
      title: '지방 KPI',
      metric: `${kpiJibang.actual}건`,
      delta: deltaN != null ? `${kpiJibang.delta > 0 ? '▲' : '▼'}${deltaN}건` : '',
      tone:
        kpiJibang.status === 'miss' ? 'up' :
        kpiJibang.status === 'near' ? 'alert' : 'down',
      note: `${monthsElapsed}M 목표 ${kpiJibang.target != null ? Math.round(kpiJibang.target) : '—'}건`,
    });
  }

  // 중상해 점유율 카드
  if (D?.severity?.dist) {
    const sevTotal = Object.values(D.severity.dist).reduce((s, v) => s + v, 0);
    const severe = D.severity.dist['중상'] || 0;
    const sp = pct(severe, sevTotal);
    cards.push({
      title: '중상해',
      metric: `${severe}건`,
      delta: `${sp}%`,
      tone: sp >= 20 ? 'alert' : 'flat',
      note: '근로손실 91일 이상',
    });
  }

  // 3개 미만이면 2026 YTD 카드로 채움
  if (cards.length < 3) {
    cards.push({
      title: '2026 YTD',
      metric: `${k.y2026 || 0}건`,
      delta: '',
      tone: 'flat',
      note: '2026년 누계',
    });
  }

  return {
    headline,
    briefing: { 현황, 위험, 권장 },
    insight_cards: cards,
  };
}

// 규칙기반 안전 현황 자동 브리핑 — LLM 없이 실데이터에서 직접 생성.
// AI 서비스(VITE_AI_URL, Bedrock Claude Lambda) 미연결 시 폴백으로 사용.
// AiOutput 의 마크다운(## · ** · -)을 그대로 렌더한다.

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

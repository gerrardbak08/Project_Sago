// AI 브리핑 공용 스키마 · 프롬프트 빌더 · 응답 파서
// 대시보드 요약 카드와 (향후) 정기 알림 브리핑이 이 모듈을 공유한다.
// Lambda(ai.js)는 건드리지 않는다 — {prompt, system, max_tokens} → {text} 계약 유지.

/**
 * AI System Prompt — Lambda 에 system 파라미터로 전달.
 * "반드시 JSON만" 지시를 엄격하게 명시한다.
 */
export const AI_SYSTEM =
  '당신은 ㈜아성다이소 안전보건 분석가입니다. ' +
  '사용자가 제공하는 사고 데이터를 분석하여 반드시 아래 JSON 스키마 형식으로만 응답하십시오. ' +
  '마크다운 코드블록(```), 설명 텍스트, 추가 주석 일절 금지. 순수 JSON만 출력하십시오.\n\n' +
  '스키마:\n' +
  '{\n' +
  '  "headline": "한 줄 핵심 메시지 (30자 내외)",\n' +
  '  "briefing": {\n' +
  '    "현황": "현황 서술 2~3문장 (수치 포함)",\n' +
  '    "위험": "가장 시급한 위험 요소 2~3문장",\n' +
  '    "권장": "즉시 실행 권장사항 2~3문장 (구체적 조치 포함)"\n' +
  '  },\n' +
  '  "insight_cards": [\n' +
  '    {\n' +
  '      "title": "카드 제목 (6자 내외)",\n' +
  '      "metric": "핵심 수치 (숫자+단위)",\n' +
  '      "delta": "증감 표현 (예: ▲5건, -12.3%)",\n' +
  '      "tone": "up 또는 down 또는 flat 또는 alert",\n' +
  '      "note": "한 줄 설명 (15자 내외)"\n' +
  '    }\n' +
  '  ]\n' +
  '}\n\n' +
  'tone 규칙: up=악화(빨강표시), down=개선(초록표시), flat=중립(회색표시), alert=긴급주의(주황표시).\n' +
  'insight_cards 는 반드시 3~5개 작성.';

/**
 * 조직명·기간·KPI 수치를 받아 AI 브리핑 요청 프롬프트 문자열 생성.
 * 전사(전체) 및 특정 조직 둘 다 지원.
 *
 * @param {Object} p
 * @param {string}       p.scopeLabel     표시 범위 (예: "전체 기간", "2026년")
 * @param {number}       p.total          기간 내 총 사고 건수
 * @param {number}       p.y2024          2024년 사고 건수
 * @param {number}       p.y2025          2025년 사고 건수
 * @param {number}       p.y2026          2026년 사고 건수 (YTD)
 * @param {number}       p.sudo           수도권 사고 건수
 * @param {number}       p.jibang         지방 사고 건수
 * @param {number|null}  p.yoyPct         전년대비 % (null=산출불가)
 * @param {Array}        p.topTypes       [{type, freq}] 상위 재해유형 배열
 * @param {Object|null}  p.kpiSudo        수도권 KPI 진척 (computeProgress 반환값)
 * @param {Object|null}  p.kpiJibang      지방 KPI 진척 (computeProgress 반환값)
 * @param {number}       p.monthsElapsed  2026년 경과 개월 수
 * @param {string}       p.severeShare    중상해 점유율 문자열 (예: "12.5")
 * @param {string}       p.submitRate     산재 신청률 문자열 (예: "67.2")
 * @param {string}       p.lossStr        추정 재무 손실 사람이 읽을 수 있는 형식 (예: "2.3억원")
 * @param {string}       p.topStoreLine   사고 다발 매장 한 줄 (예: "XX점(5건)·YY점(4건)")
 * @returns {string} Lambda 에 보낼 user prompt
 */
export function buildBriefingPrompt(p) {
  const {
    scopeLabel,
    total, y2024, y2025, y2026,
    sudo, jibang,
    yoyPct,
    topTypes,
    kpiSudo, kpiJibang, monthsElapsed,
    severeShare, submitRate,
    lossStr,
    topStoreLine,
  } = p;

  const yoyStr =
    yoyPct !== null && yoyPct !== undefined
      ? `${yoyPct > 0 ? '▲' : '▼'}${Math.abs(yoyPct).toFixed(1)}%`
      : '산출불가';

  const fmtKpi = (prog) => {
    if (!prog || prog.status === 'unknown') return '목표 미설정';
    const tgt = prog.target != null ? prog.target.toFixed(1) : '—';
    const ach = prog.achievedPct != null ? ` · 달성률 ${prog.achievedPct.toFixed(0)}%` : '';
    return `YTD ${prog.actual}건 / ${monthsElapsed}M 목표 ${tgt}건 · 상태: ${prog.status}${ach}`;
  };

  const typesStr =
    (topTypes || [])
      .slice(0, 4)
      .map(t => `${t.type} ${t.freq}건`)
      .join(' / ') || '데이터 없음';

  return (
    `㈜아성다이소 사고 현황(${scopeLabel}) 브리핑을 JSON 스키마로 작성해 주십시오.\n\n` +
    `[사고 현황]\n` +
    `- 총 사고: ${total}건 (수도권 ${sudo}건 / 지방 ${jibang}건)\n` +
    `- 연도별: 2024년 ${y2024}건 → 2025년 ${y2025}건 (YoY ${yoyStr}) → 2026년 ${y2026}건(YTD)\n` +
    `- 추정 재무손실: ${lossStr}\n\n` +
    `[재해 패턴]\n` +
    `- 상위 유형: ${typesStr}\n` +
    `- 산재 승인률: ${submitRate}%\n` +
    `- 중상해 점유율: ${severeShare}%\n` +
    `- 사고 다발 매장: ${topStoreLine || '없음'}\n\n` +
    `[목표대비 진척 (2026 KPI)]\n` +
    `- 수도권: ${fmtKpi(kpiSudo)}\n` +
    `- 지방: ${fmtKpi(kpiJibang)}\n`
  );
}

/**
 * Lambda 응답 텍스트(또는 직접 JSON.stringify 된 문자열)를 파싱해 스키마 객체 반환.
 * ```json 펜스 제거 → JSON.parse → 필수 필드 검증.
 *
 * @param {string} text
 * @returns {{ headline:string, briefing:object, insight_cards:Array }|null}
 *   검증 실패 또는 비어있을 때 null 반환 → 호출부에서 폴백 렌더 사용.
 */
export function parseAiResponse(text) {
  if (!text || typeof text !== 'string') return null;
  let cleaned = text.trim();
  // ```json ... ``` 또는 ``` ... ``` 코드블록 제거
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim();
  try {
    const obj = JSON.parse(cleaned);
    // 필수 필드 검증
    if (typeof obj.headline !== 'string' || !obj.headline) return null;
    if (!obj.briefing || typeof obj.briefing !== 'object') return null;
    if (typeof obj.briefing['현황'] !== 'string') return null;
    if (!Array.isArray(obj.insight_cards) || obj.insight_cards.length === 0) return null;
    return obj;
  } catch {
    return null;
  }
}

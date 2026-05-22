// 대시보드 AI(요약·안전가이드) 호출 — Bedrock Claude 경유 ai Lambda.
// VITE_AI_URL 은 deploy.sh 가 terraform output(ai_url)에서 .env.production 에 주입한다.
// 브라우저는 Bedrock 을 직접 호출하지 않으므로 API 키가 노출되지 않는다.
const AI_URL = import.meta.env.VITE_AI_URL || '';

// ai Lambda 에 프롬프트를 보내고 생성된 텍스트를 받는다 (비스트리밍).
export async function requestAiGuide(prompt, { system, maxTokens, signal } = {}) {
  if (!AI_URL) {
    throw new Error('AI 서비스 URL이 설정되지 않았습니다 (VITE_AI_URL). 배포 후 사용 가능합니다.');
  }
  const res = await fetch(AI_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      prompt,
      ...(system ? { system } : {}),
      ...(maxTokens ? { max_tokens: maxTokens } : {}),
    }),
  });
  if (!res.ok) {
    let msg = `AI 서비스 오류 (${res.status})`;
    try {
      const j = await res.json();
      if (j && j.error) msg = j.error;
    } catch { /* 본문 파싱 실패 시 기본 메시지 유지 */ }
    throw new Error(msg);
  }
  const data = await res.json();
  return (data && data.text) || '';
}

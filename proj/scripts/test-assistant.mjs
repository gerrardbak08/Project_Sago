// 안전 도우미 백엔드 스모크 테스트 — ai Lambda(Bedrock Claude)에 실제 질문을 던져 답변 확인.
// 실행: AI_URL=... AI_API_TOKEN=... node scripts/test-assistant.mjs "질문" (.env.production 값 사용)
import { SAFETY_ASSISTANT_SYSTEM } from '../src/data/guideKnowledge.js';

const URL = process.env.AI_URL || process.env.VITE_AI_URL;
const TOKEN = process.env.AI_API_TOKEN || process.env.VITE_AI_API_TOKEN || '';
if (!URL) { console.error('AI_URL(또는 VITE_AI_URL) 환경변수가 필요합니다.'); process.exit(1); }
const q = process.argv[2] || '손이 기계에 끼었어요. 어떻게 하죠?';

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(TOKEN ? { 'x-api-key': TOKEN } : {}) },
  body: JSON.stringify({ prompt: `[현재 질문]\n${q}\n\n위 질문에 '현장 대응 가이드'에 근거해 답하세요.`, system: SAFETY_ASSISTANT_SYSTEM, max_tokens: 1024 }),
});
console.log('HTTP', res.status);
const j = await res.json();
console.log('Q:', q);
console.log('A:', j.text || JSON.stringify(j));

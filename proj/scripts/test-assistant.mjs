// 안전 도우미 백엔드 스모크 테스트 — ai Lambda(Bedrock Claude)에 실제 질문을 던져 답변 확인.
import { SAFETY_ASSISTANT_SYSTEM } from '../src/data/guideKnowledge.js';

const URL = 'https://fvgkkbvansbuixc5y2plcax5ta0dogfk.lambda-url.ap-northeast-2.on.aws/';
const q = process.argv[2] || '손이 기계에 끼었어요. 어떻게 하죠?';

const res = await fetch(URL, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: `[현재 질문]\n${q}\n\n위 질문에 '현장 대응 가이드'에 근거해 답하세요.`, system: SAFETY_ASSISTANT_SYSTEM, max_tokens: 1024 }),
});
console.log('HTTP', res.status);
const j = await res.json();
console.log('Q:', q);
console.log('A:', j.text || JSON.stringify(j));

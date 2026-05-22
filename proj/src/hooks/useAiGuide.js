import { useState, useRef } from 'react';
import { requestAiGuide } from '../constants/ai.js';

// 대시보드 AI 요약·안전가이드 훅 — ai Lambda(Bedrock Claude) 호출. 비스트리밍.
function useAiGuide() {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const run = async (prompt, opts = {}) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setText(''); setError(null); setLoading(true);
    try {
      const result = await requestAiGuide(prompt, { ...opts, signal: abortRef.current.signal });
      setText(result);
    } catch (e) {
      if (e.name !== 'AbortError') setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => abortRef.current?.abort();
  const reset = () => { setText(''); setError(null); };
  return { text, loading, error, run, stop, reset };
}

export { useAiGuide };

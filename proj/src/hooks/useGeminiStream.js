import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';

const GEMINI_API_KEY = '';
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:streamGenerateContent';

function useGeminiStream() {
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const abortRef = useRef(null);

  const run = async (prompt) => {
    if (abortRef.current) abortRef.current.abort();
    abortRef.current = new AbortController();
    setText(""); setError(null); setLoading(true);
    try {
      const res = await fetch(GEMINI_URL + "&alt=sse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: abortRef.current.signal,
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.4, maxOutputTokens: 1024 },
        }),
      });
      if (!res.ok) {
        const s = res.status;
        throw new Error(
          s === 429 ? "Gemini API 무료 할당량을 초과했습니다. 잠시 후 다시 시도해주세요."
          : s === 403 ? "API 키 권한이 없습니다. Google AI Studio에서 키를 확인해주세요."
          : `Gemini API 오류 (${s}). 네트워크 또는 API 키를 확인해주세요.`
        );
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop();
        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const json = line.slice(6).trim();
          if (json === "[DONE]") continue;
          try {
            const delta = JSON.parse(json).candidates?.[0]?.content?.parts?.[0]?.text ?? "";
            if (delta) setText(p => p + delta);
          } catch {}
        }
      }
    } catch (e) {
      if (e.name !== "AbortError") setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const stop = () => abortRef.current?.abort();
  const reset = () => { setText(""); setError(null); };
  return { text, loading, error, run, stop, reset };
}

// ── 재사용 가능한 Gemini AI 카드 컴포넌트 ──
export { useGeminiStream };

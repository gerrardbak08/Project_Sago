// 안전 도우미 — 현장 대응 가이드 기반 챗봇 (플로팅)
// ─────────────────────────────────────────────────────────────────────────
// 데이터 흐름: 브라우저 → requestAiGuide(ai Lambda) → Bedrock Claude.
//   system = SAFETY_ASSISTANT_SYSTEM (가이드 전문 + 그라운딩 규칙)
//   prompt = 최근 대화 기록 + 현재 질문 (Lambda 가 단발성이라 히스토리를 프롬프트에 포함)
// 가이드에 근거해서만 답하고, 없는 건 안전보건팀 문의로 안내한다(환각 방지).

import { useState, useRef, useEffect, useCallback } from 'react';
import { LifeBuoy, X, Send, AlertTriangle, RotateCcw } from 'lucide-react';
import { requestAiGuide } from '../constants/ai.js';
import { SUGGESTED_QUESTIONS, ASSISTANT_GREETING } from '../data/guideKnowledge.js';
import { buildAssistantSystem } from '../utils/assistantContext.js';

// ── 미니 마크다운 렌더러 (의존성 없이 안전하게 JSX 생성) ──
function inline(text, key) {
  // **굵게** 만 처리 — 나머지는 평문
  const parts = String(text).split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${key}-${i}`} className="font-bold text-stone-900">{p.slice(2, -2)}</strong>
      : <span key={`${key}-${i}`}>{p}</span>
  );
}
function Markdown({ text }) {
  const lines = String(text ?? '').split('\n');
  const out = [];
  let list = null; // { type:'ol'|'ul', items:[] }
  const flush = () => {
    if (!list) return;
    const Tag = list.type;
    out.push(
      <Tag key={`l-${out.length}`} className={`${list.type === 'ol' ? 'list-decimal' : 'list-disc'} pl-5 my-1.5 space-y-1`}>
        {list.items.map((it, i) => <li key={i} className="leading-relaxed">{inline(it, `li-${out.length}-${i}`)}</li>)}
      </Tag>
    );
    list = null;
  };
  lines.forEach((raw, idx) => {
    const line = raw.trimEnd();
    const ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
    const ul = line.match(/^\s*[-*·]\s+(.*)$/);
    const h = line.match(/^\s*#{1,4}\s+(.*)$/);
    if (ol) { if (list?.type !== 'ol') { flush(); list = { type: 'ol', items: [] }; } list.items.push(ol[1]); return; }
    if (ul) { if (list?.type !== 'ul') { flush(); list = { type: 'ul', items: [] }; } list.items.push(ul[1]); return; }
    flush();
    if (h) { out.push(<div key={`h-${idx}`} className="font-bold text-stone-900 mt-1.5 mb-0.5">{inline(h[1], `h-${idx}`)}</div>); return; }
    if (!line.trim()) { out.push(<div key={`s-${idx}`} className="h-1.5" />); return; }
    out.push(<p key={`p-${idx}`} className="leading-relaxed my-0.5">{inline(line, `p-${idx}`)}</p>);
  });
  flush();
  return <div className="text-[13.5px] text-stone-700">{out}</div>;
}

// 최근 대화(히스토리)를 하나의 프롬프트로 직렬화 — Lambda 가 단발성이라 문맥을 넣어준다.
function buildPrompt(history, question) {
  const recent = history.slice(-6).filter(m => m.role !== 'error');
  const convo = recent.map(m => `${m.role === 'user' ? '현장관리자' : '안전 도우미'}: ${m.text}`).join('\n');
  return (convo ? `[지금까지의 대화]\n${convo}\n\n` : '') +
    `[현재 질문]\n${question}\n\n위 질문에 '현장 대응 가이드'에 근거해 현장에서 바로 실행할 수 있게 답하세요.`;
}

export default function SafetyAssistant({ data = null, basis = 'incident', yearFilter = 'all' }) {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState([]); // { role:'user'|'assistant'|'error', text }
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const abortRef = useRef(null);
  const scrollRef = useRef(null);
  const inputRef = useRef(null);

  const scrollToEnd = useCallback(() => {
    requestAnimationFrame(() => { const el = scrollRef.current; if (el) el.scrollTop = el.scrollHeight; });
  }, []);

  useEffect(() => { if (open) { scrollToEnd(); inputRef.current?.focus(); } }, [open, messages, loading, scrollToEnd]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const send = useCallback(async (raw) => {
    const q = (raw ?? input).trim();
    if (!q || loading) return;
    setInput('');
    const history = messages;
    setMessages(m => [...m, { role: 'user', text: q }]);
    setLoading(true);
    abortRef.current?.abort();
    abortRef.current = new AbortController();
    try {
      const text = await requestAiGuide(buildPrompt(history, q), {
        system: buildAssistantSystem(data, { basis, yearFilter }),
        maxTokens: 1024,
        signal: abortRef.current.signal,
      });
      setMessages(m => [...m, { role: 'assistant', text: text || '죄송합니다. 답변을 생성하지 못했습니다. 안전보건팀에 문의해 주세요.' }]);
    } catch (e) {
      if (e.name !== 'AbortError') {
        const net = e.name === 'TypeError' || /fetch|network|failed/i.test(e.message || '');
        const msg = net
          ? 'AI 서비스에 연결하지 못했습니다. 잠시 후 다시 시도하거나, 왼쪽 「현장 대응 가이드」 메뉴에서 절차를 바로 확인하세요.'
          : (e.message || 'AI 서비스에 연결하지 못했습니다.');
        setMessages(m => [...m, { role: 'error', text: msg }]);
      }
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, data, basis, yearFilter]);

  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  };

  const reset = () => { abortRef.current?.abort(); setMessages([]); setLoading(false); setInput(''); };
  const showSuggestions = !loading && messages.filter(m => m.role === 'user').length === 0;

  return (
    <>
      {/* ─── 플로팅 버튼 ─── */}
      {!open && (
        <button onClick={() => setOpen(true)}
          className="fixed z-50 bottom-20 right-4 lg:bottom-6 lg:right-6 flex items-center gap-2 pl-3.5 pr-4 py-3 rounded-full text-white shadow-xl active:scale-95 transition hover:brightness-110"
          style={{ background: 'linear-gradient(135deg,#0A3E8F,#071E4A)', boxShadow: '0 10px 30px rgba(7,30,74,0.35)' }}
          aria-label="안전 도우미 열기">
          <LifeBuoy size={20} strokeWidth={2.2} />
          <span className="text-[13px] font-bold whitespace-nowrap">안전 도우미</span>
        </button>
      )}

      {/* ─── 챗 패널 ─── */}
      {open && (
        <div className="fixed z-50 inset-x-3 bottom-3 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:w-[380px] flex flex-col rounded-2xl bg-white shadow-2xl border border-stone-200 overflow-hidden"
          style={{ height: 'min(76vh, 620px)', boxShadow: '0 24px 60px rgba(7,30,74,0.28)' }}>

          {/* 헤더 */}
          <div className="px-4 py-3 flex items-center gap-2.5 text-white flex-shrink-0"
            style={{ background: 'linear-gradient(135deg,#0A3E8F,#071E4A)' }}>
            <div className="w-8 h-8 rounded-xl bg-white/15 grid place-items-center flex-shrink-0">
              <LifeBuoy size={17} strokeWidth={2.3} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] font-extrabold leading-tight">안전 도우미</div>
              <div className="text-[10.5px] text-white/60 leading-tight">사고 대응, 바로 물어보세요</div>
            </div>
            {messages.length > 0 && (
              <button onClick={reset} className="p-1.5 rounded-lg hover:bg-white/10 transition" title="대화 초기화">
                <RotateCcw size={15} />
              </button>
            )}
            <button onClick={() => setOpen(false)} className="p-1.5 rounded-lg hover:bg-white/10 transition" aria-label="닫기">
              <X size={17} />
            </button>
          </div>

          {/* 긴급 안내 스트립 */}
          <div className="px-3.5 py-1.5 bg-red-50 border-b border-red-100 flex items-center gap-1.5 flex-shrink-0">
            <AlertTriangle size={12} className="text-red-600 flex-shrink-0" strokeWidth={2.5} />
            <span className="text-[11px] font-semibold text-red-700">생명이 위급하면 지금 즉시 <b>119</b></span>
          </div>

          {/* 메시지 영역 */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3.5 py-3 space-y-3 bg-stone-50/60">
            {/* 인사말 */}
            <div className="flex justify-start">
              <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-white border border-stone-200 px-3.5 py-2.5 shadow-sm">
                <Markdown text={ASSISTANT_GREETING} />
              </div>
            </div>

            {messages.map((m, i) => {
              if (m.role === 'user') return (
                <div key={i} className="flex justify-end">
                  <div className="max-w-[86%] rounded-2xl rounded-tr-sm px-3.5 py-2.5 text-[13.5px] leading-relaxed text-white shadow-sm whitespace-pre-wrap"
                    style={{ background: '#071E4A' }}>{m.text}</div>
                </div>
              );
              if (m.role === 'error') return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[86%] rounded-2xl rounded-tl-sm bg-red-50 border border-red-100 px-3.5 py-2.5 text-[12.5px] text-red-700">
                    <b>연결 오류</b> — {m.text}
                  </div>
                </div>
              );
              return (
                <div key={i} className="flex justify-start">
                  <div className="max-w-[90%] rounded-2xl rounded-tl-sm bg-white border border-stone-200 px-3.5 py-2.5 shadow-sm">
                    <Markdown text={m.text} />
                  </div>
                </div>
              );
            })}

            {/* 타이핑 인디케이터 */}
            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl rounded-tl-sm bg-white border border-stone-200 px-4 py-3 shadow-sm flex items-center gap-1">
                  {[0, 1, 2].map(i => (
                    <span key={i} className="w-1.5 h-1.5 rounded-full bg-stone-400 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />
                  ))}
                </div>
              </div>
            )}

            {/* 추천 질문 */}
            {showSuggestions && (
              <div className="flex flex-col gap-1.5 pt-1">
                {SUGGESTED_QUESTIONS.map((q) => (
                  <button key={q} onClick={() => send(q)}
                    className="text-left px-3 py-2 rounded-xl bg-white border border-stone-200 text-[12.5px] font-medium text-stone-600 hover:border-brand-navy hover:text-brand-navy transition active:scale-[0.99]">
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* 입력 */}
          <div className="p-2.5 border-t border-stone-200 bg-white flex-shrink-0">
            <div className="flex items-end gap-2">
              <textarea ref={inputRef} value={input} rows={1}
                onChange={(e) => setInput(e.target.value)} onKeyDown={onKeyDown}
                placeholder="사고 상황이나 절차를 입력…"
                className="flex-1 resize-none max-h-24 px-3 py-2 rounded-xl border border-stone-200 text-[13.5px] text-stone-800 placeholder:text-stone-400 focus:outline-none focus:border-brand-navy leading-relaxed"
                style={{ fontFamily: 'inherit' }} />
              <button onClick={() => send()} disabled={!input.trim() || loading}
                className="flex-shrink-0 w-10 h-10 rounded-xl grid place-items-center text-white disabled:opacity-40 transition active:scale-95"
                style={{ background: 'linear-gradient(135deg,#0A3E8F,#071E4A)' }} aria-label="보내기">
                <Send size={16} strokeWidth={2.4} />
              </button>
            </div>
            <div className="text-[10px] text-stone-400 mt-1.5 px-1 leading-tight">
              현장 대응 가이드 기반 안내입니다. 응급·법적 판단은 안전보건팀에 확인하세요.
            </div>
          </div>
        </div>
      )}
    </>
  );
}

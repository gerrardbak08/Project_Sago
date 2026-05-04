import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED } from '../../constants/colors.js';
import { useGeminiStream } from '../../hooks/useGeminiStream.js';

function GeminiAiCard({ title = "AI 분석", sub, buildPrompt, buttonLabel = "AI 분석 실행" }) {
  const { text, loading, error, run, stop, reset } = useGeminiStream();
  return (
    <Card title={title} titleIcon={Sparkles} sub={sub || "Gemini AI가 데이터를 분석합니다"}>
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {!loading ? (
          <button onClick={() => run(buildPrompt())}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition"
            style={{ background: DAISO_RED, color: "white" }}>
            <Sparkles size={13} /> {buttonLabel}
          </button>
        ) : (
          <button onClick={stop}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer border border-stone-200 bg-white text-stone-600">
            <span className="animate-spin inline-block">⏳</span> 중지
          </button>
        )}
        {text && <button onClick={reset} className="text-xs text-stone-400 hover:text-stone-600 cursor-pointer">초기화</button>}
      </div>
      {error && <div className="text-xs text-red-600 mb-2 p-2 bg-red-50 rounded">{error}</div>}
      {text ? (
        <MarkdownView text={text} />
      ) : !loading && (
        <div className="text-xs text-stone-400 text-center py-4 flex flex-col items-center gap-1">
          <Sparkles size={20} className="text-stone-300" />
          <span>버튼을 눌러 AI 분석을 시작하세요</span>
        </div>
      )}
      {loading && !text && (
        <div className="text-xs text-stone-400 text-center py-4 animate-pulse">분석 중...</div>
      )}
    </Card>
  );
}

// 마크다운 간단 렌더 컴포넌트
function GeminiOutput({ text, loading, compact = false }) {
  if (!text && !loading) return null;
  return (
    <div className={`text-xs text-stone-700 leading-relaxed break-keep whitespace-pre-wrap ${compact ? "" : "rounded-lg border border-stone-200 p-3"}`}>
      {text.split("\n").map((line, i) => {
        if (line.startsWith("## ")) return <div key={i} className="font-bold text-stone-900 text-sm mt-3 mb-1 border-b border-stone-100 pb-0.5">{line.slice(3)}</div>;
        if (line.startsWith("### ")) return <div key={i} className="font-bold text-stone-800 mt-2 mb-0.5">{line.slice(4)}</div>;
        const parts = line.split(/\*\*(.+?)\*\*/g);
        return (
          <div key={i} className={line.startsWith("- ") || line.startsWith("• ") ? "ml-2 my-0.5" : "my-0.5"}>
            {parts.map((p, j) => j % 2 === 1 ? <b key={j} className="text-stone-900">{p}</b> : p)}
          </div>
        );
      })}
      {loading && <span className="inline-block w-1.5 h-3.5 bg-violet-500 animate-pulse ml-0.5 rounded-sm" />}
    </div>
  );
}

export { GeminiAiCard, GeminiOutput };

// AI 응답 마크다운 간단 렌더 컴포넌트.
function AiOutput({ text, loading, compact = false }) {
  if (!text && !loading) return null;
  return (
    <div className={`text-xs text-stone-700 leading-relaxed break-keep whitespace-pre-wrap ${compact ? "" : "rounded-lg border border-stone-200 p-3"}`}>
      {(text || "").split("\n").map((line, i) => {
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

export { AiOutput };

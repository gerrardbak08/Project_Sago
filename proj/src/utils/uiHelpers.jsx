import { useState, useEffect, useMemo, useRef, useCallback, Fragment, Component } from 'react';

const pct = (v, t) => t ? ((v / t) * 100).toFixed(1) : "0.0";
const fmt = (n) => n?.toLocaleString?.() ?? n;
const fmtKrw = (n) => n ? `${(n/10000).toFixed(0)}만` : "0";

const TT = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs">
      {label !== undefined && <div className="font-bold text-stone-800 mb-1">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <span className="inline-block w-2 h-2 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-stone-500">{p.name}:</span>
          <span className="font-semibold">{fmt(p.value)}{typeof p.value === 'number' && p.value > 10000 ? '원' : '건'}</span>
        </div>
      ))}
    </div>
  );
};

// 빈 상태 컴포넌트
const EmptyState = ({ message = "데이터가 없습니다", icon = "📭" }) => (
  <div className="flex flex-col items-center justify-center py-8 text-stone-400">
    <span className="text-3xl mb-2">{icon}</span>
    <span className="text-sm">{message}</span>
  </div>
);

const Card = ({ title, sub, titleIcon: TitleIcon, children, right, className = "" }) => (
  <div className={`bg-white/95 backdrop-blur-sm border border-stone-200/60 rounded-xl p-4 sm:p-5 ${className}`} style={{boxShadow:"0 4px 20px rgba(0,0,0,0.06), 0 1px 3px rgba(0,0,0,0.04)", backdropFilter:"blur(8px)"}}>
    {(title || right) && (
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          {TitleIcon && <TitleIcon size={16} strokeWidth={2} className="text-stone-600" />}
          <div>
            {title && <div className="font-semibold text-stone-800 text-sm tracking-tight">{title}</div>}
            {sub && <div className="text-xs text-stone-500 mt-0.5">{sub}</div>}
          </div>
        </div>
        {right}
      </div>
    )}
    {children}
  </div>
);

export { pct, fmt, fmtKrw, TT, EmptyState };
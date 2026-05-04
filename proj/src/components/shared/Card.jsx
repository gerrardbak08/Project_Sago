import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, BORDER, SURFACE, INK2 } from '../../constants/colors.js';

function EstimateBadge({ D }) {
  if (!D._isEstimated) return null;
  return (
    <div className="rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-xs text-amber-800 flex items-start gap-2 mb-3" style={{wordBreak:"keep-all"}}>
      <span style={{flexShrink:0}}>ⓘ</span>
      <span><b>{D._yearFilter}년 기간 비례 추정</b> · 누적 데이터에 비율({Math.round(D._ratio * 1000) / 10}%) 적용한 추정값. 정확한 연도별 분석은 실제 연도별 breakdown DB 연동 후 가능.</span>
    </div>
  );
}


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

export { EstimateBadge, Card, TT, EmptyState };

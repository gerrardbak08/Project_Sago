import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { useInView } from '../../utils/motion.js';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles, Inbox } from 'lucide-react';
import { DAISO_RED, BORDER, SURFACE, INK2 } from '../../constants/colors.js';

function EstimateBadge({ D }) {
  return null;   // 비례추정 안내 배지 비활성화 (사용자 요청)
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
    <div className="bg-white border border-stone-200 rounded-lg shadow-[0_6px_16px_rgba(7,30,74,0.08)] px-3.5 py-2.5 text-xs">
      {label !== undefined && <div className="font-semibold text-stone-700 pb-1.5 mb-1.5 border-b border-stone-100">{label}</div>}
      {payload.map((p, i) => (
        <div key={i} className="flex items-center gap-1.5">
          <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: p.color || p.fill }} />
          <span className="text-stone-500">{p.name}:</span>
          <span className="font-semibold">{fmt(p.value)}{typeof p.value === 'number' && p.value > 10000 ? '원' : '건'}</span>
        </div>
      ))}
    </div>
  );
};

// 빈 상태 컴포넌트 — icon: Lucide 컴포넌트(권장, forwardRef 객체) 또는 이모지 문자열(후방호환)
const EmptyState = ({ message = "데이터가 없습니다", icon = Inbox }) => {
  const isStr = typeof icon === "string";   // Lucide 아이콘은 forwardRef 객체라 'function'이 아님 → 문자열 여부로만 분기
  const Ico = isStr ? null : icon;
  return (
    <div className="flex flex-col items-center justify-center min-h-[140px] py-8" aria-hidden="true">
      {isStr
        ? <span className="text-3xl mb-2 text-stone-300">{icon}</span>
        : <Ico size={40} strokeWidth={1} className="mb-2 text-stone-300" />}
      <span className="text-sm text-stone-400">{message}</span>
    </div>
  );
};

const Card = ({ title, sub, titleIcon: TitleIcon, children, right, className = "", animate = true, delay = 0 }) => {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);
  const inView = useInView(ref);
  const revealed = !animate || inView;

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden bg-white border border-stone-200/70 rounded-[20px] p-4 sm:p-5 ${className}${revealed ? ' dash-slide-up' : ''}${animate && !inView ? ' opacity-0' : ''}`}
      style={{
        boxShadow: hovered
          ? "0 14px 34px rgba(7,30,74,0.12), 0 2px 6px rgba(7,30,74,0.05)"
          : "0 8px 22px rgba(7,30,74,0.075), 0 1px 2px rgba(7,30,74,0.04)",
        transform: hovered ? "translateY(-3px)" : "translateY(0)",
        willChange: "transform",
        transition: "box-shadow .2s ease, transform .22s cubic-bezier(.2,.7,.3,1)",
        animationDelay: delay ? `${delay}ms` : undefined,
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      {(title || right) && (
        <div className={`flex ${sub ? 'items-start' : 'items-center'} justify-between mb-4`}>
          <div className="flex items-center gap-2">
            {TitleIcon && <TitleIcon size={16} strokeWidth={2} className="text-[#003B8F]" />}
            <div>
              {title && <div className="font-bold text-[#071E4A] text-[15px] tracking-[-0.015em]">{title}</div>}
              {sub && <div className="text-[11px] text-stone-400 mt-0.5">{sub}</div>}
            </div>
          </div>
          {right}
        </div>
      )}
      {children}
    </div>
  );
};

export { EstimateBadge, Card, TT, EmptyState };

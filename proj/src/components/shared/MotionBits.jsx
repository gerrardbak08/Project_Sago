// 치트시트 TIER 1 — 재사용 모션 컴포넌트 (CSS/Tailwind + 자체 motion.js, Framer 미사용)
// 타이밍·이징은 ui-motion-cheatsheet 기준: 슬라이딩 pill .3s cubic-bezier(.2,.7,.3,1),
// 진행 링 stroke-dashoffset 1s, 스파크라인 path-draw 1s, 카운트업(odometer) tabular-nums.
import { useRef, useState, useLayoutEffect, useId } from 'react';
import { useInView, useCountUp } from '../../utils/motion.js';

const EASE = 'cubic-bezier(.2,.7,.3,1)';

/**
 * 슬라이딩 알약 세그먼트 토글 (tab indicator).
 * options: [{ value, label }], value, onChange, accent(활성 배경색)
 */
export function SegmentedToggle({ options, value, onChange, accent = '#1D4ED8', size = 'md', className = '' }) {
  const wrapRef = useRef(null);
  const [pill, setPill] = useState({ left: 0, width: 0, ready: false });

  useLayoutEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const active = wrap.querySelector('[data-seg-active="true"]');
    if (active) setPill({ left: active.offsetLeft, width: active.offsetWidth, ready: true });
  }, [value, options]);

  const pad = size === 'sm' ? 'px-3 py-1.5 text-[11px]' : 'px-3.5 py-2 text-xs';
  return (
    <div ref={wrapRef} role="tablist" className={`relative inline-flex items-center gap-1 rounded-full bg-stone-100 p-1 ${className}`}>
      <span
        aria-hidden
        className="absolute rounded-full shadow-sm"
        style={{
          left: pill.left, width: pill.width, top: 4, bottom: 4, background: accent,
          opacity: pill.ready ? 1 : 0,
          transition: `left .3s ${EASE}, width .3s ${EASE}, opacity .2s ease`,
        }}
      />
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="tab"
            aria-selected={on}
            data-seg-active={on}
            onClick={() => onChange(o.value)}
            className={`relative z-10 rounded-full whitespace-nowrap transition-colors duration-200 active:scale-[0.97] ${pad} ${on ? 'text-white font-bold' : 'text-stone-500 font-medium hover:text-stone-700'}`}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/**
 * 원형 진행 링 / 게이지. value/max 비율을 stroke로 그려 뷰포트 진입 시 채워짐.
 */
export function ProgressRing({ value = 0, max = 100, size = 92, stroke = 9, color = '#047857', track = '#EDEAE6', label, sublabel }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const r = (size - stroke) / 2;
  const C = 2 * Math.PI * r;
  const safeVal = (value == null || isNaN(+value)) ? 0 : +value;
  const ratio = max ? Math.max(0, Math.min(1, safeVal / max)) : 0;
  const offset = inView ? C * (1 - ratio) : C;
  return (
    <div ref={ref} className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={C} strokeDashoffset={offset}
          style={{ transition: `stroke-dashoffset 1s ${EASE}` }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {label != null && <span className="text-xl font-extrabold tabular-nums leading-none" style={{ color }}>{label}</span>}
        {sublabel && <span className="text-[10px] text-stone-400 mt-0.5">{sublabel}</span>}
      </div>
    </div>
  );
}

/**
 * 미니 스파크라인. data:number[] 를 받아 뷰포트 진입 시 선이 그려짐(path-draw) + 끝점 도트.
 */
export function Sparkline({ data = [], color = '#1D4ED8', width = 76, height = 24, fill = true }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const uid = useId();
  const gid = `spk-${uid}`;
  if (!data || data.length < 2) return null;
  const max = Math.max(...data, 1);
  const min = Math.min(...data, 0);
  const span = max - min || 1;
  const pts = data.map((v, i) => [ (i / (data.length - 1)) * (width - 4) + 2, height - 3 - ((v - min) / span) * (height - 6) ]);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
  const area = `${line} L ${pts[pts.length - 1][0].toFixed(1)} ${height} L ${pts[0][0].toFixed(1)} ${height} Z`;
  const last = pts[pts.length - 1];
  const DRAW = 260;
  return (
    <svg ref={ref} width={width} height={height} className="overflow-visible block">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${gid})`} style={{ opacity: inView ? 1 : 0, transition: 'opacity .6s ease .3s' }} />}
      <path
        d={line} fill="none" stroke={color} strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round"
        style={{ strokeDasharray: DRAW, strokeDashoffset: inView ? 0 : DRAW, transition: `stroke-dashoffset 1s ${EASE}` }}
      />
      <circle cx={last[0]} cy={last[1]} r={2.2} fill={color} style={{ opacity: inView ? 1 : 0, transition: 'opacity .3s ease .85s' }} />
    </svg>
  );
}

/**
 * 오도미터 — 큰 숫자를 뷰포트 진입 시 0→값으로 카운트업(tabular-nums). format으로 포맷팅.
 */
export function Odometer({ value = 0, duration = 1100, format = (n) => n.toLocaleString(), className = '', enabled }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const on = enabled != null ? enabled : inView;
  const n = useCountUp(value, duration, on);
  return <span ref={ref} className={`tabular-nums ${className}`}>{format(n)}</span>;
}

export default { SegmentedToggle, ProgressRing, Sparkline, Odometer };

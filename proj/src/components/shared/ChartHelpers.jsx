import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, BL, OR, GR, PAL } from '../../constants/colors.js';
import { pct, fmt } from '../../utils/uiHelpers.jsx';

function CalcTip({ label, formula, example, note, citation }) {
  const [open, setOpen] = useState(false);
  return (
    <span className="inline-flex items-center" style={{ gap: 4 }}>
      <button onClick={() => setOpen(true)} className="inline-flex items-center justify-center rounded-full bg-stone-100 hover:bg-stone-200 transition cursor-pointer" style={{ width: 16, height: 16, fontSize: 10, color: "#78716C" }} aria-label="계산법 보기">
        <Info size={11} strokeWidth={2.5} />
      </button>
      {open && (
        <div className="fixed inset-0 bg-stone-900/40 z-50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-lg max-w-md w-full p-5 shadow-[0_8px_24px_rgba(0,0,0,0.12)]" onClick={e => e.stopPropagation()}>
            <div className="flex items-start justify-between mb-3 gap-2">
              <div>
                <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">계산법 및 예시</div>
                <div className="text-base font-bold text-stone-900 mt-0.5">{label}</div>
              </div>
              <button onClick={() => setOpen(false)} className="text-stone-400 hover:text-stone-700 cursor-pointer"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="bg-stone-50 border border-stone-200 rounded-md p-3">
                <div className="text-xs text-stone-500 font-semibold mb-1">공식</div>
                <div className="font-mono text-stone-800" style={{ fontSize: 13 }}>{formula}</div>
              </div>
              {example && (
                <div className="bg-white border border-stone-200 rounded-md p-3">
                  <div className="text-xs text-stone-500 font-semibold mb-1">예시</div>
                  <div className="text-stone-700 leading-relaxed" style={{ fontSize: 13 }}>{example}</div>
                </div>
              )}
              {note && (
                <div className="text-xs text-stone-500 leading-relaxed">
                  <span className="font-semibold text-stone-600">참고: </span>{note}
                </div>
              )}
              {citation && (
                <div className="text-xs text-stone-400 pt-2 border-t border-stone-100">
                  <span className="font-medium">출처: </span>{citation}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </span>
  );
}

function HeatmapGrid({ rows, yearFilter }) {
  const months = [];
  for (let y of [2024, 2025, 2026]) for (let m = 1; m <= 12; m++) months.push(`${y}-${m < 10 ? "0" + m : m}`);
  // 데이터가 있는 마지막 월까지만 표시 (이전 2026-04 하드코딩 제거)
  const usedYms = new Set();
  rows.forEach(r => Object.keys(r.hm || {}).forEach(k => usedYms.add(k)));
  const lastYm = usedYms.size > 0 ? Array.from(usedYms).sort().pop() : "2026-12";
  let valid = months.filter(ym => ym <= lastYm);
  if (yearFilter && yearFilter !== "all") valid = valid.filter(ym => ym.startsWith(yearFilter));
  const allV = rows.flatMap(r => valid.map(ym => r.hm[ym] || 0));
  const mx = Math.max(...allV, 1);
  return (
    <div className="overflow-x-auto pb-2">
      <div style={{ minWidth: yearFilter && yearFilter !== "all" ? 480 : 980 }}>
        <div style={{ display: "grid", gridTemplateColumns: `132px repeat(${valid.length}, 26px)`, gap: 2 }}>
          <div />
          {valid.map(ym => {
            const m = parseInt(ym.split("-")[1]);
            const yr = ym.split("-")[0].slice(2);
            return <div key={ym} className="text-center text-stone-400 flex items-center justify-center" style={{ fontSize: 9, fontWeight: 600, height: 20 }}>{m === 1 ? `${yr}.${m}` : m}</div>;
          })}
          {rows.map(r => (
            <Fragment key={r.label}>
              <div className="flex items-center text-xs font-medium text-stone-700 pr-2 whitespace-nowrap overflow-hidden">{r.label} <span className="text-stone-400 ml-1 font-normal">({r.total})</span></div>
              {valid.map(ym => {
                const v = r.hm[ym] || 0;
                const ratio = v / mx;
                const bg = v === 0 ? "#FAFAF9" : `rgba(79,70,229,${0.08 + ratio * 0.75})`;
                const clr = ratio > 0.45 ? "#fff" : "#292524";
                return <div key={ym} className="flex items-center justify-center rounded" style={{ height: 26, background: bg, color: clr, fontSize: 10, fontWeight: 700 }}>{v || ""}</div>;
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

function BarRank({ items, color, total }) {
  const mx = Math.max(...items.map(it => it.value || 0), 1);
  return (
    <div className="space-y-1">
      {items.map((it, i) => (
        <div key={it.name} className="flex items-center gap-2 py-1">
          <div className="w-5 text-right text-xs font-bold text-stone-400">{i + 1}</div>
          <div className="w-20 text-xs font-semibold text-stone-800 truncate flex-shrink-0">{it.name}</div>
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(it.value / mx) * 100}%`, background: color || PAL[i % PAL.length] }} />
          </div>
          <div className="w-20 text-right text-xs font-bold tabular-nums">{it.value} <span className="text-stone-400 font-normal">({pct(it.value, total)}%)</span></div>
        </div>
      ))}
    </div>
  );
}

function Matrix({ data, rowKey, cols, rowLabels }) {
  const values = data.flatMap(r => cols.map(c => r[c] || 0));
  const mx = Math.max(...values, 1);
  const CELL = 42;          // 정사각형 셀 한 변 (텍스트 길이와 무관하게 통일)
  const LABEL_W = 84;       // 행 라벨 열 고정 폭
  return (
    <div className="overflow-x-auto pb-2">
      <table className="text-xs"
             style={{ tableLayout: 'fixed', borderCollapse: 'separate', borderSpacing: 3 }}>
        <colgroup>
          <col style={{ width: LABEL_W }} />
          {cols.map((_, i) => <col key={i} style={{ width: CELL }} />)}
          <col style={{ width: 46 }} />
        </colgroup>
        <thead><tr>
          <th className="text-left text-stone-500 font-semibold align-bottom pb-1" style={{ fontSize: 10 }}>-</th>
          {cols.map(c => (
            <th key={c} className="text-center text-stone-500 font-semibold align-bottom pb-1 leading-tight"
                style={{ fontSize: 9, letterSpacing: "-0.05em" }}>{c}</th>
          ))}
          <th className="text-right text-stone-500 font-semibold align-bottom pb-1" style={{ fontSize: 10 }}>합계</th>
        </tr></thead>
        <tbody>{data.map((r, i) => {
          const rowTotal = cols.reduce((s, c) => s + (r[c] || 0), 0);
          return (
            <tr key={i}>
              <td className="font-bold text-stone-800 truncate pr-1" style={{ fontSize: 10 }}>
                {rowLabels ? rowLabels[i] : r[rowKey]}
              </td>
              {cols.map(c => {
                const v = r[c] || 0;
                const ratio = v / mx;
                const bg = v === 0 ? "#FAFAF9" : `rgba(220,38,38,${0.08 + ratio * 0.7})`;
                const clr = ratio > 0.45 ? "#fff" : "#292524";
                return (
                  <td key={c} style={{ padding: 0 }}>
                    <div className="rounded flex items-center justify-center tabular-nums font-bold"
                         style={{ width: CELL, height: CELL, background: bg, color: clr, fontSize: 11 }}>
                      {v || ""}
                    </div>
                  </td>
                );
              })}
              <td className="text-right tabular-nums font-bold text-stone-900" style={{ fontSize: 11 }}>{rowTotal}</td>
            </tr>
          );
        })}</tbody>
      </table>
    </div>
  );
}


function gradientCells(data, hexColor, maxTint = 0.55) {
  const n = data.length;
  return data.map((_, i) => {
    const t = n <= 1 ? 0 : (i / (n - 1)) * maxTint;
    const r = parseInt(hexColor.slice(1, 3), 16);
    const g = parseInt(hexColor.slice(3, 5), 16);
    const b = parseInt(hexColor.slice(5, 7), 16);
    const nr = Math.round(r + (255 - r) * t);
    const ng = Math.round(g + (255 - g) * t);
    const nb = Math.round(b + (255 - b) * t);
    const h = v => v.toString(16).padStart(2, '0');
    return <Cell key={i} fill={`#${h(nr)}${h(ng)}${h(nb)}`} />;
  });
}

// ========== TAB 1: Overview ==========
export { CalcTip, HeatmapGrid, BarRank, Matrix, gradientCells };

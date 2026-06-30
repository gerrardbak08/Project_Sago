import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { Odometer, Sparkline } from '../../../components/shared/MotionBits.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix, gradientCells } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';
import { useAiGuide } from '../../../hooks/useAiGuide.js';
import { fmtShort } from '../../../utils/format.js';
import { AiOutput } from '../../../components/shared/AiOutput.jsx';
import { buildRuleBasedBriefing } from '../../../utils/ruleSummary.js';
import PeriodComparison from '../../../components/shared/PeriodComparison.jsx';
import { STORE_SNAPSHOTS, WORKER_SNAPSHOTS } from '../../../data/snapshots.js';

const WORKER_COUNT_ESTIMATE = 1337 * 5;
const yoy = (cur, prev) => prev ? ((cur - prev) / prev * 100) : null;

function Overview({ D, yearFilter, role, setTab, onStoreSelect }) {
  const aiSummary = useAiGuide();
  const isCEO = role === "ceo";
  const isManager = role === "manager";
  const isTeam = role === "team";
  const isPart = role === "part";
  const isSafety = role === "safety";
  const roleLabel = isCEO ? "경영진" : isManager ? "영업부문장" : isTeam ? "팀장" : isPart ? "파트장" : isSafety ? "안전보건팀" : "";
  const k = D.kpis;

  // === KPI 카운트업 훅 (숫자 0→target 애니메이션) ===
  // periodCount/periodSudo/periodJibang 는 이 아래서 계산되므로 훅은 계산 후에 선언할 수 없음.
  // → 훅 규칙(최상단 호출)을 지키기 위해 여기서 k 값으로 초기 카운트업 정의.
  // 실제 표시 값은 countTotal/countSudo/countJibang 으로 대체.
  const kpiGridRef     = useRef(null);
  const kpiInView      = useInView(kpiGridRef);
  const countTotal2024 = useCountUp(k.y2024 ?? 0, 1200, kpiInView);
  const countTotal2025 = useCountUp(k.y2025 ?? 0, 1200, kpiInView);
  const countTotal2026 = useCountUp(k.y2026 ?? 0, 1200, kpiInView);
  const countKTotal    = useCountUp(k.total  ?? 0, 1200, kpiInView);
  const countKSudo     = useCountUp(k.sudo   ?? 0, 1200, kpiInView);
  const countKJibang   = useCountUp(k.jibang ?? 0, 1200, kpiInView);

  // === CEO 전용: 연도별 재무 임팩트 계산 ===
  const avgLossDays = 25;
  const yearlyFinance = D.yearly.map(y => {
    const count = (y.s || 0) + (y.j || 0) + (y.e || 0);
    const wage = MIN_WAGE_DAY[y.year] || MIN_WAGE_DAY[CURRENT_YEAR];
    const fullLoss = count * avgLossDays * wage * (1 + INDIRECT_COST_MULTIPLIER);
    return { 
      year: y.year + "년", 
      count, 
      lossEok: Math.round(fullLoss / 1e8 * 10) / 10,
      salesEok: Math.round(fullLoss / OPERATING_MARGIN / 1e8),
    };
  });
  
  // 재해유형별 재무 영향 Top 5 (빈도 × 평균 일수 × 일급 × 간접비)
  const typeFinance = (D.risk || []).slice(0, 5).map(r => {
    const wageYear = yearFilter && yearFilter !== "all" ? parseInt(yearFilter) : CURRENT_YEAR;
    const wage = MIN_WAGE_DAY[wageYear] || MIN_WAGE_DAY[CURRENT_YEAR];
    const estLoss = r.freq * avgLossDays * wage * (1 + INDIRECT_COST_MULTIPLIER);
    return {
      type: r.type,
      freq: r.freq,
      lossEok: Math.round(estLoss / 1e8 * 10) / 10,
    };
  });
  const monthlyFiltered = yearFilter === "all" ? D.monthly : D.monthly.filter(m => String(m.y) === yearFilter);
  const yearlyFiltered = yearFilter === "all" ? D.yearly : D.yearly.filter(y => String(y.year) === yearFilter);
  const periodCount = yearFilter === "all" ? k.total : (yearFilter === "2024" ? k.y2024 : yearFilter === "2025" ? k.y2025 : k.y2026);
  const periodSudo = yearFilter === "all" ? k.sudo : yearlyFiltered.reduce((s,y)=>s+y.s,0);
  const periodJibang = yearFilter === "all" ? k.jibang : yearlyFiltered.reduce((s,y)=>s+y.j,0);
  const bumPie = [{ name: "수도권", value: periodSudo, color: BL }, { name: "지방", value: periodJibang, color: OR }, { name: "기타", value: periodCount - periodSudo - periodJibang, color: GR }];
  const proj = D.projection ?? {};
  const submitRate = pct(k.submitted, k.submitted + k.not_submitted);
  const severeShare = D.severity?.dist ? pct(D.severity.dist["중상"] ?? 0, Object.values(D.severity.dist).reduce((s,v)=>s+v,0)) : "산출불가";
  
  // === Executive KPIs: 재무손실, per-100 매장, per-100 인원, 중대사고 점유율, 취약점 집중도, YoY ===
  // 재무손실 = 실제 근로손실일수 × 연도별 최저시급 일급 × (1 + 간접비계수)
  // DB의 '근로손실일수' 컬럼을 직접 사용. 누락된 사고는 평균 81일(소매업)로 보충
  const periodIncidents = (function() {
    const wage = MIN_WAGE_DAY[yearFilter === "all" ? CURRENT_YEAR : parseInt(yearFilter)] || MIN_WAGE_DAY[CURRENT_YEAR];
    // 연도 필터에 따라 손실일수 집계
    let recordedDays = 0;
    let recordedCount = 0;
    if (yearFilter === "all") {
      recordedDays = D.kpis?.loss_days_total || 0;
      recordedCount = D.kpis?.loss_days_count || 0;
    } else {
      const yr = D.yearly?.find(y => String(y.year) === yearFilter);
      recordedDays = yr?.loss_days || 0;
      recordedCount = yr?.loss_days_count || 0;
    }
    // 평균 손실일수 (DB 기록 기반). 0~과대값 방어로 5~120일 범위 클램프
    const recordedAvg = recordedCount > 0 ? recordedDays / recordedCount : 25;
    const fallbackAvg = Math.max(5, Math.min(120, recordedAvg));
    // 손실일수 누락 사고 = periodCount - recordedCount → fallbackAvg로 추정
    const missingCount = Math.max(0, periodCount - recordedCount);
    const estimatedDays = missingCount * fallbackAvg;
    const totalDays = Math.round(recordedDays + estimatedDays);
    const avgDays = periodCount > 0 ? totalDays / periodCount : 0;
    const minLoss = totalDays * wage;
    const fullLoss = minLoss * (1 + INDIRECT_COST_MULTIPLIER);
    const equivalentSales = fullLoss / OPERATING_MARGIN;
    return {
      totalDays, minLoss, fullLoss, equivalentSales, avgDays,
      recordedDays, recordedCount, missingCount,
      isDirectMeasured: recordedCount >= periodCount * 0.4,  // 기록률 40%+면 직접측정 표시
    };
  })();
  
  // per-100 지표
  const totalStores = (D.store_kpi && D.store_kpi.total) || 1337;
  const per100Store = (periodCount / totalStores * 100).toFixed(2);
  const per100Worker = (periodCount / WORKER_COUNT_ESTIMATE * 100).toFixed(2);
  
  // === 취약점 집중도 (상위 2개 매장 사고 점유율) ===
  // BUGFIX: D.stores의 total은 누적. 연도 필터 시 기간 비례 추정.
  const topStores = (D.stores || []).slice(0, 2);
  const totalTop2All = topStores.reduce((s, x) => s + x.total, 0);
  const top2Sum = yearFilter === "all"
    ? totalTop2All
    : Math.round(totalTop2All * (periodCount / (D.kpis.total || 1)));
  const top2Share = pct(top2Sum, periodCount);
  const top2Names = topStores.map(x => x.store).join(", ");
  
  // YoY 사고건수
  const yoyPct = k.y2024 ? yoy(k.y2025, k.y2024) : null;
  const isImprovement = yoyPct !== null && yoyPct < 0;
  
  // === 경영진용: 연도별 재무 손실 계산 + YoY ===
  const avgLossDaysExec = 25;
  const calcYearLoss = (year, count) => {
    const wage = MIN_WAGE_DAY[year] || MIN_WAGE_DAY[CURRENT_YEAR];
    return count * avgLossDaysExec * wage * (1 + INDIRECT_COST_MULTIPLIER);
  };
  const y2024Loss = calcYearLoss(2024, k.y2024);
  const y2025Loss = calcYearLoss(2025, k.y2025);
  const y2026Loss = calcYearLoss(2026, k.y2026);
  const financeYoY = y2024Loss > 0 ? ((y2025Loss - y2024Loss) / y2024Loss * 100) : null;
  
  return (
    <div className="space-y-3 sm:space-y-4">


      {/* === 100명당 IR 배너 (3개 독립 카드, yearFilter 연동) === */}
      {D.worker_ir_summary && D.worker_ir_summary.total && (() => {
        // 분자: yearFilter 적용 (전체 사고 → 연도별 사고로 동적)
        const yr = yearFilter !== "all" ? D.yearly?.find(y => String(y.year) === yearFilter) : null;
        const sudoBumun = D.worker_ir_summary.by_bumun.find(b => b.bum === "수도권");
        const jibangBumun = D.worker_ir_summary.by_bumun.find(b => b.bum === "지방");
        const totalIncidents = yr ? (yr.s + yr.j) : D.worker_ir_summary.total.incidents;
        const sudoIncidents = yr ? yr.s : (sudoBumun?.incidents ?? 0);
        const jibangIncidents = yr ? yr.j : (jibangBumun?.incidents ?? 0);
        const totalWorkers = D.worker_ir_summary.total.workers;
        const totalStores = D.worker_ir_summary.total.stores_count;
        const sudoWorkers = sudoBumun?.workers ?? 0;
        const jibangWorkers = jibangBumun?.workers ?? 0;
        const sudoStores = sudoBumun?.stores_count ?? 0;
        const jibangStores = jibangBumun?.stores_count ?? 0;
        const totalIr = totalWorkers ? (totalIncidents / totalWorkers * 100) : null;
        const sudoIr = sudoWorkers ? (sudoIncidents / sudoWorkers * 100) : null;
        const jibangIr = jibangWorkers ? (jibangIncidents / jibangWorkers * 100) : null;
        const periodLabel = yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
        const warmBg = "linear-gradient(135deg, #FEFCF7 0%, #FAF5EB 30%, #F1E5CC 70%, #E8D3A8 100%)";
        const cards = [
          { label: "영업부문 100명당 IR", labelColor: ALERT_RED, ir: totalIr, incidents: totalIncidents, workers: totalWorkers, stores: totalStores, valueColor: "#1C1917", icon: true, spkData: D.yearly?.map(y => (y.s||0)+(y.j||0)+(y.e||0)) ?? [] },
          { label: "수도권", labelColor: "#1D4ED8", ir: sudoIr, incidents: sudoIncidents, workers: sudoWorkers, stores: sudoStores, valueColor: "#1D4ED8", spkData: D.yearly?.map(y => y.s||0) ?? [] },
          { label: "지방", labelColor: "#C2410C", ir: jibangIr, incidents: jibangIncidents, workers: jibangWorkers, stores: jibangStores, valueColor: "#C2410C", spkData: D.yearly?.map(y => y.j||0) ?? [] },
        ];
        // 좌→우로 흐르는 하나의 그라데이션 — 3개 분리 카드가 각자 전체의 1/3 구간을 배경으로
        // (카드 N의 끝색 = 카드 N+1의 시작색 → gap이 있어도 연속처럼 보임)
        const GRAD_STOPS = ["#FEFCF7", "#F7EFDA", "#EFE1C2", "#E6D0A0"];
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {cards.map((c, i) => (
                <div key={c.label}
                     className="rounded-lg p-3 sm:p-4 dash-slide-up"
                     style={{
                       background: `linear-gradient(to right, ${GRAD_STOPS[i]} 0%, ${GRAD_STOPS[i + 1]} 100%)`,
                       border: "1px solid #E8D3A8",
                       animationDelay: `${i * 80}ms`,
                     }}>
                  <div className="flex items-center gap-2 mb-1">
                    {c.icon && <Users size={14} style={{color: c.labelColor}} />}
                    <span className="text-[11px] font-bold uppercase tracking-wider" style={{color: c.labelColor}}>{c.label}</span>
                  </div>
                  <div className="flex items-end justify-between gap-2">
                    <div className="flex items-baseline gap-1.5">
                      <span className="text-3xl lg:text-4xl font-bold tracking-tight" style={{color: c.valueColor}}>
                        {c.ir != null
                          ? <Odometer value={Math.round(c.ir * 100)} duration={1100} format={(n) => (n / 100).toFixed(2)} />
                          : "—"}
                      </span>
                      <span className="text-sm text-stone-500 font-medium">건/100명</span>
                    </div>
                    {c.spkData && c.spkData.length >= 2 && (
                      <Sparkline data={c.spkData} color={c.labelColor} width={60} height={20} />
                    )}
                  </div>
                  <div className="text-[11px] text-stone-600 mt-1.5 leading-tight">
                    사고 {c.incidents.toLocaleString()}건 · 재직 {c.workers.toLocaleString()}명 · 매장 {c.stores}개
                  </div>
                </div>
              ))}
            </div>
            <div className="rounded-lg px-4 py-2 text-[11px] break-keep" style={{ background: "rgba(255,251,240,0.7)", border: "1px solid #F1E5CC", color: "#78716C" }}>
              <b style={{color: ALERT_RED}}>지표 해석</b> · <b>100명당 IR</b>은 인원 노출량을 보정한 사고 강도.
              분자 사고는 <b>{periodLabel}</b> 기준 (연도 토글 연동) · 수도권+지방 영업부문만 집계(기타부문 제외).
              분모(재직자)는 근로자DB 스냅샷({D.worker_kpis?.ref_date}) 고정 — 매년 5월 19일 시점. 연도별 정확한 분모는 추후 부문별 시계열 작업 시 갱신 예정.
            </div>
          </>
        );
      })()}

      {/* === 임계값 알림 배너 === */}
      {(() => {
        const alerts = [];
        // 팀 IR 임계값: 평균의 1.5배 이상
        const teamIrs = (D.team_ir || []).filter(t => t.ir_per100 != null);
        if (teamIrs.length > 0) {
          const avgIr = teamIrs.reduce((s,t) => s+t.ir_per100, 0) / teamIrs.length;
          const threshold = avgIr * 1.5;
          const overTeams = teamIrs.filter(t => t.ir_per100 > threshold);
          if (overTeams.length > 0) {
            alerts.push({
              level: "warn",
              icon: "⚠",
              title: `팀 IR 임계값 초과 — ${overTeams.length}개 팀`,
              desc: `평균(${avgIr.toFixed(2)}건/100명)의 1.5배(${threshold.toFixed(2)}건/100명) 초과: ${overTeams.slice(0,3).map(t=>t.team).join("·")}${overTeams.length>3?` 외 ${overTeams.length-3}개`:""}`,
              tab: "dept",
            });
          }
        }
        // 동일 매장 재발 (3건 이상)
        const hotStores = (D.stores || []).filter(s => s.total >= 3);
        if (hotStores.length > 0) {
          alerts.push({
            level: "danger",
            icon: "🔴",
            title: `집중 사고 매장 — ${hotStores.length}개소 (3건 이상)`,
            desc: `상위: ${hotStores.slice(0,3).map(s=>`${s.store}(${s.total}건)`).join("·")}`,
            tab: "riskmap",
          });
        }
        if (alerts.length === 0) return null;
        const colors = {
          critical: { bg:"#FEF2F2", border:"#FCE7E7", icon: DAISO_RED, text: ALERT_RED, IconComp: AlertCircle },
          danger:   { bg:"#FEF2F2", border:"#FECACA", icon: DAISO_RED, text: ALERT_RED, IconComp: Flame },
          warn:     { bg:"#FFF7ED", border:"#FED7AA", icon:"#C2410C", text:"#92400E",   IconComp: AlertTriangle },
          info:     { bg:"#EFF6FF", border:"#BFDBFE", icon:"#1D4ED8", text:"#1E3A8A",  IconComp: TrendingUp },
        };
        const _alertCols = alerts.length <= 3 ? alerts.length : 2;
        const _alertGridCls = { 1: "lg:grid-cols-1", 2: "lg:grid-cols-2", 3: "lg:grid-cols-3" }[_alertCols];
        return (
          <div className={`grid gap-2 grid-cols-1 sm:grid-cols-2 ${_alertGridCls}`}>
            {alerts.map((a, i) => {
              const c = colors[a.level];
              return (
                <div key={i}
                  onClick={a.tab && setTab ? () => setTab(a.tab) : undefined}
                  className={`rounded-lg p-3 min-h-[52px] flex items-start gap-3 transition-all duration-150 ${a.tab && setTab ? "cursor-pointer hover:shadow-md active:scale-[0.98]" : ""}`}
                  style={{background:c.bg, border:`1px solid ${c.border}`}}>
                  <span className="flex-shrink-0 mt-0.5">
                    {c.IconComp
                      ? <c.IconComp size={15} style={{ color: c.icon, flexShrink: 0 }} />
                      : (typeof a.icon === "string" ? <span className="text-base">{a.icon}</span> : a.icon)
                    }
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-bold" style={{color:c.text}}>{a.title}</div>
                    <div className="text-xs text-stone-600 mt-0.5 break-keep">{a.desc}</div>
                  </div>
                  {a.tab && setTab && (
                    <span className="flex-shrink-0 self-center text-xs font-bold flex items-center gap-0.5" style={{color:c.text}}>
                      바로가기 <ChevronRight size={12} />
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        );
      })()}

      
      {/* === 4-KPI 메인 스트립 (실적) === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" ref={kpiGridRef}>
        {[
          { l: "총 사고건수", v: fmt(yearFilter === "all" ? countKTotal : periodCount), s: yearFilter === "all" ? `'24년 ${countTotal2024}건 · '25년 ${countTotal2025}건 · '26년 ${countTotal2026}건` : `${yearFilter}년 단독`, Icon: AlertTriangle, delta: yearFilter === "all" ? yoyPct : null, deltaLabel: "'24→'25 전년대비:", yearBars: yearFilter === "all" ? [{ yr:"2024", v:countTotal2024, color:"#A8A29E" }, { yr:"2025", v:countTotal2025, color:DAISO_RED }, { yr:"2026(현)", v:countTotal2026, color:"#78716C" }] : null, sparklineData: [k.y2024, k.y2025, k.y2026].filter(n => n != null) },
          { l: "수도권", v: fmt(yearFilter === "all" ? countKSudo : periodSudo), s: `전체 ${pct(periodSudo, periodCount)}%`, Icon: Building2 },
          { l: "지방", v: fmt(yearFilter === "all" ? countKJibang : periodJibang), s: `전체 ${pct(periodJibang, periodCount)}%`, Icon: MapIcon },
          { l: "2026 연 예측", v: `${proj.low ?? "—"}~${proj.high ?? "—"}`, s: `중간값 ${proj.center ?? "—"}건 · 95% CI`, Icon: TrendingUp },
        ].map((c, i) => (
          <div key={i}
               className="bg-white border border-stone-200 rounded-lg p-3 sm:p-5 hover:border-stone-300 transition min-w-0 flex flex-col dash-slide-up"
               style={{ animationDelay: `${i * 70}ms` }}>
            {/* 제목 행 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-stone-500 font-medium uppercase tracking-wide truncate">{c.l}</span>
              <c.Icon size={14} strokeWidth={2} className="text-stone-400" />
            </div>

            {c.yearBars ? (
              <>
                {/* ── 숫자 + 연도별 건수 나란히 ── */}
                <div className="flex items-start justify-between gap-2 flex-1 min-w-0 flex-wrap">
                  <div className="flex items-baseline gap-1 min-w-0">
                    <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{c.v}</span>
                    <span className="text-base font-medium text-stone-400">건</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 pt-0.5 shrink-0">
                    {c.yearBars.map(b => (
                      <div key={b.yr} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-stone-400 tabular-nums shrink-0">{b.yr}</span>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: b.color }}>{b.v}건</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 전년대비 ── */}
                {c.delta !== undefined && c.delta !== null && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[10px] text-stone-400">{c.deltaLabel}</span>
                    <span
                      className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                      style={{ background: c.delta < 0 ? "#ECFDF5" : "#FEF2F2", color: c.delta < 0 ? "#047857" : "#B91C1C" }}>
                      {c.delta < 0 ? "▼" : "▲"}{Math.abs(c.delta).toFixed(1)}%
                    </span>
                  </div>
                )}
                {/* ── 연도별 추세 스파크라인 ── */}
                {c.sparklineData && c.sparklineData.length >= 2 && (
                  <div className="mt-2 flex justify-end">
                    <Sparkline data={c.sparklineData} color={DAISO_RED} width={72} height={20} />
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="flex items-baseline gap-1.5 flex-1">
                  <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{c.v}</span>
                  <span className="text-base font-medium text-stone-400">건</span>
                </div>
                <div className="text-xs text-stone-500 mt-2 truncate flex items-center gap-2">
                  <span className="truncate">{c.s}</span>
                  {c.delta !== undefined && c.delta !== null && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <span
                        className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums whitespace-nowrap"
                        style={{ background: c.delta < 0 ? "#ECFDF5" : "#FEF2F2", color: c.delta < 0 ? "#047857" : "#B91C1C" }}>
                        {c.delta < 0 ? "▼" : "▲"}{Math.abs(c.delta).toFixed(1)}%
                      </span>
                      {c.deltaLabel && <span className="text-stone-400 text-[10px] whitespace-nowrap">{c.deltaLabel}</span>}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      {/* === 동기간 비교 === */}
      <PeriodComparison
        monthly={D.monthly}
        storeSnapshots={STORE_SNAPSHOTS}
        workerSnapshots={WORKER_SNAPSHOTS}
      />

      <Card title="AI 사고 현황 요약" titleIcon={Lightbulb} sub="Claude AI가 전체 사고 데이터를 분석해 핵심 패턴과 개선 포인트를 요약합니다">
        <div className="flex items-center gap-2 mb-3 flex-wrap">
          <button
            onClick={() => {
              const prompt = `당신은 ㈜아성다이소 안전보건 전문가입니다. 아래 사고 현황 데이터를 분석하여 핵심 패턴, 위험 요소, 개선 포인트를 간결하게 요약해주세요.

## 전체 사고 현황 (${yearFilter === "all" ? "전체 기간" : yearFilter + "년"})
- 총 사고 건수: ${periodCount}건 (수도권 ${periodSudo}건 / 지방 ${periodJibang}건)
- 2024년: ${k.y2024}건 / 2025년: ${k.y2025}건 / 2026년(4월까지): ${k.y2026}건
- YoY 증감률: ${yoyPct !== null ? (yoyPct > 0 ? "+" : "") + yoyPct.toFixed(1) + "%" : "산출 불가"}
- 추정 재무 손실: ${fmtShort(periodIncidents.fullLoss)}원

## 주요 재해 패턴
- 상위 재해 유형: ${(D.risk || []).slice(0,4).map(r => `${r.type} ${r.freq}건`).join(", ") || "데이터 없음"}
- 산재 승인률: ${submitRate}% (전체 기간 기준)
- 중상해 점유율: ${severeShare}%
- 상위 2개 매장 집중도: ${top2Share}% (${top2Names})

## 부서별 현황
${(D.dept_ir || []).slice(0,5).map(d => `- ${d.dept}: 사고 ${d.incidents}건 / IR ${d.coverage_rate ?? d.rate}%`).join("\n")}

위 데이터를 바탕으로 다음 형식으로 요약해주세요:
1. **전체 사고 추세** (증감 방향과 주요 원인)
2. **가장 시급한 위험 요소** (2~3가지)
3. **즉시 실행 권장 사항** (구체적, 3가지)
4. **모니터링 포인트** (향후 추적해야 할 지표)

간결하고 실무적으로 작성해주세요.`;
              // AI 서비스(Lambda) 연결 시 LLM 분석, 미연결(로컬/미배포) 시 규칙기반 자동 브리핑
              if (import.meta.env.VITE_AI_URL) aiSummary.run(prompt);
              else aiSummary.setResult(buildRuleBasedBriefing(D));
            }}
            disabled={aiSummary.loading}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            style={{background: aiSummary.loading ? "#9CA3AF" : "linear-gradient(135deg,#071E4A,#1D4ED8)"}}>
            <span className="text-sm leading-none">{aiSummary.loading ? "⏳" : "✨"}</span>
            {aiSummary.loading ? "AI 분석 중..." : aiSummary.text ? "재분석" : "AI 전체 현황 요약"}
          </button>
          {aiSummary.loading && <button onClick={aiSummary.stop} className="text-xs text-stone-400 hover:text-stone-600 underline cursor-pointer">중단</button>}
          {aiSummary.text && !aiSummary.loading && <button onClick={aiSummary.reset} className="text-xs text-stone-400 hover:text-stone-600 underline cursor-pointer">지우기</button>}
        </div>
        {aiSummary.error && (
          <div className="flex gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-xs text-amber-800">
            <span className="text-amber-500">⚠</span>
            <div>{aiSummary.error}</div>
          </div>
        )}
        {!aiSummary.text && !aiSummary.error && !aiSummary.loading && (
          <div className="flex flex-col items-center gap-2 py-6">
            <Sparkles size={22} className="text-stone-300" />
            <div className="text-xs text-stone-400 text-center break-keep">
              AI가 전체 사고 데이터를 종합 분석합니다
            </div>
            <div className="text-[11px] text-stone-300 text-center break-keep">
              위 버튼을 누르면 핵심 패턴 · 위험 요소 · 개선 포인트를 요약합니다
            </div>
          </div>
        )}
        <AiOutput text={aiSummary.text} loading={aiSummary.loading} />
      </Card>
    </div>
  );
}


// ========== TAB 2: Dept/Team/Store with Drill-down ==========
export default Overview;

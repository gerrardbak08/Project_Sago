import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';
import { useGeminiStream } from '../../../hooks/useGeminiStream.js';
import { fmtShort } from '../../../utils/format.js';
import { GeminiOutput } from '../../../components/shared/GeminiAiCard.jsx';

const WORKER_COUNT_ESTIMATE = 1337 * 5;
const yoy = (cur, prev) => prev ? ((cur - prev) / prev * 100) : null;

function Overview({ D, yearFilter, role, setTab }) {
  const aiSummary = useGeminiStream();
  const isCEO = role === "ceo";
  const isManager = role === "manager";
  const isTeam = role === "team";
  const isPart = role === "part";
  const isSafety = role === "safety";
  const roleLabel = isCEO ? "경영진" : isManager ? "영업부문장" : isTeam ? "팀장" : isPart ? "파트장" : isSafety ? "안전보건팀" : "";
  const k = D.kpis;
  
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
  const yoyStr = ((k.y2025 - k.y2024) / k.y2024 * 100).toFixed(1);
  const monthlyFiltered = yearFilter === "all" ? D.monthly : D.monthly.filter(m => String(m.y) === yearFilter);
  const yearlyFiltered = yearFilter === "all" ? D.yearly : D.yearly.filter(y => String(y.year) === yearFilter);
  const periodCount = yearFilter === "all" ? k.total : (yearFilter === "2024" ? k.y2024 : yearFilter === "2025" ? k.y2025 : k.y2026);
  const periodSudo = yearFilter === "all" ? k.sudo : yearlyFiltered.reduce((s,y)=>s+y.s,0);
  const periodJibang = yearFilter === "all" ? k.jibang : yearlyFiltered.reduce((s,y)=>s+y.j,0);
  const bumPie = [{ name: "수도권", value: periodSudo, color: BL }, { name: "지방", value: periodJibang, color: OR }, { name: "기타", value: periodCount - periodSudo - periodJibang, color: GR }];
  const proj = D.projection;
  const submitRate = pct(k.submitted, k.submitted + k.not_submitted);
  
  // === Executive KPIs: 재무손실, per-100 매장, per-100 인원, 중대사고 점유율, 취약점 집중도, YoY ===
  // 재무손실 (연도별 최저시급 일급 × 추정 근로손실일수 × 간접비계수)
  // 실제 근로손실일수 DB 연동 전까지는 상병명 기반 추정치 사용
  const periodIncidents = (function() {
    // 추정용: 사고 샘플 재구성. 실제 구현 시 D.raw_incidents 사용
    const count = periodCount;
    const avgDays = 25; // 전체 평균 근로손실일수 (소매업 추정)
    const wage = MIN_WAGE_DAY[yearFilter === "all" ? CURRENT_YEAR : parseInt(yearFilter)] || MIN_WAGE_DAY[CURRENT_YEAR];
    const totalDays = count * avgDays;
    const minLoss = totalDays * wage;
    const fullLoss = minLoss * (1 + INDIRECT_COST_MULTIPLIER);
    const equivalentSales = fullLoss / OPERATING_MARGIN;
    return { totalDays, minLoss, fullLoss, equivalentSales, avgDays };
  })();
  
  // per-100 지표
  const totalStores = (D.store_kpi && D.store_kpi.total) || 1337;
  const per100Store = (periodCount / totalStores * 100).toFixed(2);
  const per100Worker = (periodCount / WORKER_COUNT_ESTIMATE * 100).toFixed(2);
  
  // === 중상해사고 점유율 (근로손실 91일 이상) ===
  // BUGFIX: D.severity.dist.중상은 누적 총합(181). 연도 필터 시 기간 비례로 추정.
  // 실제 연도별 breakdown DB 연동 전까지 전체 비율을 유지하는 추정 사용.
  const totalSevereAll = D.severity?.dist?.중상 || Math.round(D.kpis.total * 0.35);
  const severeCount = yearFilter === "all"
    ? totalSevereAll
    : Math.round(totalSevereAll * (periodCount / (D.kpis.total || 1)));
  const severeShare = pct(severeCount, periodCount);
  const severeIsEstimated = yearFilter !== "all";
  
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
  
  // 중대재해 경보 (더미, 실제는 90일+ 사고 2건 이상이면 활성화)
  // 경보 기준: 해당 기간 사고의 30% 이상이 중상해인 경우 (일반 평균 수준)
  const criticalAlert = severeCount >= 30 && severeShare >= 25 ? { count: severeCount, show: true } : { show: false };
  
  return (
    <div className="space-y-3 sm:space-y-4">


      {/* === 100명당 IR 배너 (근로자DB 업로드 시에만) === */}
      {D.worker_ir_summary && D.worker_ir_summary.total && (
        <div className="rounded-lg overflow-hidden" style={{ background: "linear-gradient(135deg, #FFF7ED 0%, #FEF3C7 50%, #FEE2E2 100%)", border: "1px solid #FECACA" }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
            <div className="p-4 border-b lg:border-b-0 lg:border-r border-rose-200">
              <div className="flex items-center gap-2 mb-1">
                <Users size={14} style={{color: ALERT_RED}} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{color: ALERT_RED}}>영업부문 100명당 IR</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl lg:text-4xl font-bold tracking-tight tabular-nums" style={{color:"#1C1917"}}>{D.worker_ir_summary.total.ir_per100 != null ? D.worker_ir_summary.total.ir_per100.toFixed(2) : "—"}</span>
                <span className="text-sm text-stone-500 font-medium">건/100명</span>
              </div>
              <div className="text-[11px] text-stone-600 mt-1.5 leading-tight">분자 사고 {D.worker_ir_summary.total.incidents.toLocaleString()}건 · 분모 재직 {D.worker_ir_summary.total.workers.toLocaleString()}명 · 매장 {D.worker_ir_summary.total.stores_count}개</div>
            </div>
            {D.worker_ir_summary.by_bumun.map(b => (
              <div key={b.bum} className="p-4 border-b lg:border-b-0 lg:border-r last:border-r-0 border-rose-200">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[11px] font-bold uppercase tracking-wider" style={{color: b.bum==="수도권"?"#1D4ED8":"#C2410C"}}>{b.bum}</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl lg:text-4xl font-bold tracking-tight tabular-nums" style={{color: b.bum==="수도권"?"#1D4ED8":"#C2410C"}}>{b.ir_per100 != null ? b.ir_per100.toFixed(2) : "—"}</span>
                  <span className="text-sm text-stone-500 font-medium">건/100명</span>
                </div>
                <div className="text-[11px] text-stone-600 mt-1.5 leading-tight">사고 {b.incidents}건 · 재직 {b.workers.toLocaleString()}명 · 매장 {b.stores_count}개</div>
              </div>
            ))}
          </div>
          <div className="px-4 py-2 text-[11px] break-keep" style={{ background: "rgba(255,255,255,0.5)", color: "#78716C" }}>
            <b style={{color: ALERT_RED}}>지표 해석</b> · <b>100명당 IR</b>은 인원 노출량을 보정한 사고 강도. 분자는 사고DB(전체 기간 누적), 분모는 근로자DB 재직자 스냅샷({D.worker_kpis?.ref_date}). 시점이 다르므로 「매장 IR」 탭에서 연도 필터 사용 권장.
          </div>
        </div>
      )}

      {/* === 임계값 알림 배너 === */}
      {(() => {
        const alerts = [];
        // 팀 IR 임계값: 평균의 1.5배 이상
        const teamIrs = (D.team_ir || []).filter(t => t.coverage_rate != null);
        if (teamIrs.length > 0) {
          const avgIr = teamIrs.reduce((s,t) => s+(t.coverage_rate ?? t.rate), 0) / teamIrs.length;
          const threshold = avgIr * 1.5;
          const overTeams = teamIrs.filter(t => (t.coverage_rate ?? t.rate) > threshold);
          if (overTeams.length > 0) {
            alerts.push({
              level: "warn",
              icon: "⚠",
              title: `팀 IR 임계값 초과 — ${overTeams.length}개 팀`,
              desc: `평균(${avgIr.toFixed(1)}%)의 1.5배(${threshold.toFixed(1)}%) 초과: ${overTeams.slice(0,3).map(t=>t.team).join("·")}${overTeams.length>3?` 외 ${overTeams.length-3}개`:""}`,
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
        // 2025→2026 급증 팀 (QoQ 50% 이상)
        const risingTeams = (D.team_ir || []).filter(t => t.y24 > 0 && t.y25 > t.y24 * 1.5);
        if (risingTeams.length > 0) {
          alerts.push({
            level: "info",
            icon: "📈",
            title: `YoY 급증 팀 — ${risingTeams.length}개`,
            desc: `2024→2025 50%+ 증가: ${risingTeams.slice(0,2).map(t=>t.team).join("·")}`,
            tab: "dept",
          });
        }
        // 중상해사고 관찰 배너를 alerts 배열 맨 앞에 통합
        if (criticalAlert.show) {
          alerts.unshift({
            level: "critical",
            icon: <AlertCircle size={16} style={{ color: DAISO_RED, flexShrink: 0 }} />,
            title: `중상해사고 관찰 (근로손실 91일 이상): ${criticalAlert.count}건${severeIsEstimated ? " · 기간 비례 추정" : ""}`,
            desc: "중대재해처벌법 §2(2호) 기준 사전 모니터링 대상. 상세는 「의료 심각도」 탭 참조.",
            tab: "severity",
          });
        }
        if (alerts.length === 0) return null;
        const colors = {
          critical: { bg:"#FEF2F2", border:"#FCE7E7", icon: DAISO_RED, text: ALERT_RED },
          danger:   { bg:"#FEF2F2", border:"#FECACA", icon: DAISO_RED, text: ALERT_RED },
          warn:     { bg:"#FFF7ED", border:"#FED7AA", icon:"#C2410C", text:"#92400E" },
          info:     { bg:"#EFF6FF", border:"#BFDBFE", icon:"#1D4ED8", text:"#1E3A8A" },
        };
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {alerts.map((a, i) => {
              const c = colors[a.level];
              return (
                <div key={i} 
                  onClick={a.tab && setTab ? () => setTab(a.tab) : undefined}
                  className={`rounded-lg p-3 flex items-start gap-3 ${a.tab && setTab ? "cursor-pointer hover:shadow-md transition" : ""}`}
                  style={{background:c.bg, border:`1px solid ${c.border}`}}>
                  <span className="flex-shrink-0 mt-0.5">{typeof a.icon === "string" ? <span className="text-base">{a.icon}</span> : a.icon}</span>
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: "총 사고건수", v: fmt(periodCount), s: yearFilter === "all" ? `'24년 ${k.y2024}건 · '25년 ${k.y2025}건 · '26년 ${k.y2026}건` : `${yearFilter}년 단독`, Icon: AlertTriangle, delta: yoyPct, deltaLabel: "'24→'25 전년대비:", yearBars: yearFilter === "all" ? [{ yr:"2024", v:k.y2024, color:"#A8A29E" }, { yr:"2025", v:k.y2025, color:DAISO_RED }, { yr:"2026(현)", v:k.y2026, color:"#78716C" }] : null },
          { l: "수도권", v: fmt(periodSudo), s: `전체 ${pct(periodSudo, periodCount)}%`, Icon: Building2 },
          { l: "지방", v: fmt(periodJibang), s: `전체 ${pct(periodJibang, periodCount)}%`, Icon: MapIcon },
          { l: "2026 연 예측", v: `${proj.low}~${proj.high}`, s: `중간값 ${proj.center}건 · 95% CI`, Icon: TrendingUp },
        ].map((c, i) => (
          <div key={i} className="bg-white border border-stone-200 rounded-lg p-3 sm:p-5 hover:border-stone-300 transition min-w-0 flex flex-col">
            {/* 제목 행 */}
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-stone-500 font-medium uppercase tracking-wide truncate">{c.l}</span>
              <c.Icon size={14} strokeWidth={2} className="text-stone-400" />
            </div>

            {c.yearBars ? (
              <>
                {/* ── 숫자 + 연도별 건수 나란히 ── */}
                <div className="flex items-start justify-between gap-2 flex-1">
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{c.v}</span>
                    <span className="text-base font-medium text-stone-400">건</span>
                  </div>
                  <div className="flex flex-col items-end gap-0.5 pt-0.5">
                    {c.yearBars.map(b => (
                      <div key={b.yr} className="flex items-center gap-1.5">
                        <span className="text-[10px] text-stone-400 tabular-nums">{b.yr}</span>
                        <span className="text-[11px] font-bold tabular-nums" style={{ color: b.color }}>{b.v}건</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* ── 전년대비 ── */}
                {c.delta !== undefined && c.delta !== null && (
                  <div className="mt-2 flex items-center gap-1">
                    <span className="text-[10px] text-stone-400">{c.deltaLabel}</span>
                    <span className="text-[11px] font-bold" style={{ color: c.delta < 0 ? SAFE_GREEN : ALERT_RED }}>
                      {c.delta < 0 ? "▼" : "▲"}{Math.abs(c.delta).toFixed(1)}%
                    </span>
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
                      <span className="font-bold whitespace-nowrap" style={{ color: c.delta < 0 ? SAFE_GREEN : ALERT_RED }}>
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
      
      {/* === 4-KPI 경영진 스트립 (임팩트 + 발생률 + 재무) === */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {/* 1. 추정 재무 손실액 */}
        <div className="rounded-lg p-5 border border-stone-200 bg-white min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-medium uppercase tracking-wide truncate" style={{ color: ALERT_RED }}>추정 재무손실</span>
            <CalcTip
              label="추정 재무손실액"
              formula="근로손실일수 × 연도별 최저시급 일급 × (1 + 간접비계수 4배)"
              example={`예: ${periodCount}건 × 평균 ${periodIncidents.avgDays}일 × 최저시급 일급 × 5배 = 약 ${fmtShort(periodIncidents.fullLoss)}원`}
              note="간접비는 Heinrich (1931) 기준 직접:간접 = 1:4. 생산중단·교육·조사·사기저하 포함. 근로손실일수 DB 연동 전까지는 평균 추정치 사용."
              citation="OSHA $afety Pays · Heinrich (1931) · 고용노동부 최저임금 고시"
            />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums" style={{ color: "#1C1917" }}>{fmtShort(periodIncidents.fullLoss)}</span>
            <span className="text-sm font-medium text-stone-400">원</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 leading-tight" style={{wordBreak:"keep-all"}}>매출 환산 ≈ {fmtShort(periodIncidents.equivalentSales)}원</div>
        </div>
        
        {/* 2. 시설 타겟 (매장 100개당) */}
        <div className="rounded-lg p-5 border border-stone-200 bg-white min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-600 font-medium uppercase tracking-wide truncate">시설 타겟</span>
            <CalcTip
              label="시설 타겟 (매장 100개당 재해율)"
              formula="(사고건수 ÷ 영업매장 수) × 100"
              example={`${periodCount}건 ÷ ${totalStores}매장 × 100 = ${per100Store}건/100매장`}
              note="동일 업종 타 기업과 규모 독립적으로 비교 가능한 정규화 지표. OSHA TRIR의 한국형 변형."
              citation="OSHA TRIR · KOSHA 재해율 정의"
            />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-stone-900">{per100Store}</span>
            <span className="text-sm font-medium text-stone-400">건/100매장</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 truncate">영업매장 {fmt(totalStores)}개 기준</div>
        </div>
        
        {/* 3. 중대사고 점유율 */}
        <div className="rounded-lg p-5 border border-stone-200 bg-white min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-600 font-medium uppercase tracking-wide truncate">중상해사고 점유율</span>
            <CalcTip
              label="중상해사고 점유율"
              formula="(중상 사고 건수 ÷ 전체 사고) × 100"
              example={severeIsEstimated ? `전체 ${totalSevereAll}건 × (${periodCount}/${D.kpis.total}) ≈ ${severeCount}건 → ${severeShare}%` : `${severeCount}건 ÷ ${periodCount}건 × 100 = ${severeShare}%`}
              note={`상병명에서 '골절·파열·진탕·척추·탈구·절단' 등 회복 91일 이상 추정 사고를 중상해로 분류. 산재보험법 장해 기준. 중대재해처벌법의 '중대산업재해'(사망/6개월 이상 치료)와는 다른 개념. ${severeIsEstimated ? "연도 필터 시 기간 비례 추정값 사용 (실제 연도별 breakdown DB 연동 전까지)." : ""}`}
              citation="중대재해처벌법 시행령 §4 · Heinrich Pyramid"
            />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums" style={{ color: severeShare > 30 ? ALERT_RED : "#1C1917" }}>{severeShare}</span>
            <span className="text-sm font-medium text-stone-400">%</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 truncate">중상 {severeCount}건{severeIsEstimated ? " (추정)" : ""} / 전체 {periodCount}건</div>
        </div>
        
        {/* 4. 취약점 집중도 */}
        <div className="rounded-lg p-5 border border-stone-200 bg-white min-w-0">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-600 font-medium uppercase tracking-wide truncate">취약점 집중도</span>
            <CalcTip
              label="취약점 집중도 (Pareto)"
              formula="(상위 2개 매장 사고합 ÷ 전체 사고) × 100"
              example={severeIsEstimated ? `전체 Top2 ${totalTop2All}건 × (${periodCount}/${D.kpis.total}) ≈ ${top2Sum}건 → ${top2Share}%` : `Top2 매장 ${top2Sum}건 ÷ ${periodCount}건 × 100 = ${top2Share}%`}
              note={`현재 Top2 매장: ${top2Names}. 상위 소수 매장 집중 관리로 전체 감축 효과 극대화 (Pareto 80/20 법칙). ${severeIsEstimated ? "Top2 매장 사고 건수는 누적 기준이라 연도 필터 시 기간 비례 추정값 사용." : ""}`}
              citation="Pareto Principle · Quality Control"
            />
          </div>
          <div className="flex items-baseline gap-1">
            <span className="text-2xl sm:text-3xl font-bold tracking-tight tabular-nums text-stone-900">{top2Share}</span>
            <span className="text-sm font-medium text-stone-400">%</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 truncate" title={top2Names}>{top2Names || "-"}</div>
        </div>
      </div>
      
      {/* === 경영진 전용: 재무 헤드라인 배너 === */}
      {isCEO && (
        <div className="rounded-lg overflow-hidden" style={{ background: "linear-gradient(135deg, #1C1917 0%, #292524 100%)" }}>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-0">
            <div className="p-5 border-b lg:border-b-0 lg:border-r border-stone-700">
              <div className="flex items-center gap-2 mb-2">
                <Banknote size={14} style={{ color: DAISO_RED }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#FCA5A5" }}>기간 추정 재무손실</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl lg:text-4xl font-bold tracking-tight tabular-nums text-white">{fmtShort(periodIncidents.fullLoss)}</span>
                <span className="text-lg text-stone-400 font-medium">원</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1.5 leading-tight">간접비 5배 Heinrich 기준</div>
            </div>
            <div className="p-5 border-b lg:border-b-0 lg:border-r border-stone-700">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp size={14} style={{ color: "#FCD34D" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: "#FDE68A" }}>매출 환산</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl lg:text-4xl font-bold tracking-tight tabular-nums text-white">{fmtShort(periodIncidents.equivalentSales)}</span>
                <span className="text-lg text-stone-400 font-medium">원</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1.5 leading-tight">영업이익률 3% 기준 상쇄 필요 매출</div>
            </div>
            <div className="p-5">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle size={14} style={{ color: financeYoY > 0 ? "#F87171" : "#86EFAC" }} />
                <span className="text-[11px] font-bold uppercase tracking-wider" style={{ color: financeYoY > 0 ? "#FCA5A5" : "#BBF7D0" }}>재무손실 YoY</span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl lg:text-4xl font-bold tracking-tight tabular-nums" style={{ color: financeYoY > 0 ? "#F87171" : "#86EFAC" }}>{financeYoY > 0 ? "▲" : "▼"}{financeYoY !== null ? Math.abs(financeYoY).toFixed(1) : "-"}</span>
                <span className="text-lg text-stone-400 font-medium">%</span>
              </div>
              <div className="text-[11px] text-stone-400 mt-1.5 leading-tight">2024→2025 · 건수 YoY({yoyPct > 0 ? "+" : ""}{yoyPct !== null ? yoyPct.toFixed(1) : "-"}%)보다 가파름</div>
            </div>
          </div>
          <div className="px-5 py-2.5 text-[11px] break-keep" style={{ background: "rgba(0,0,0,0.25)", color: "#D6D3D1" }}>
            <b style={{ color: "#FCA5A5" }}>경영진 요약</b> · 최저시급 상승 추세상 건수가 동일해도 재무 임팩트는 매년 확대되는 구조. <span style={{ color: "#9CA3AF" }}>※ 상위 매장 집중 관리의 감축 효과는 매장별 사고 패턴·재발 여부에 따라 달라지며, 별도 ROI 분석 후 정책 수립 권장.</span>
          </div>
        </div>
      )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {(isCEO || isManager || isSafety || !role) && (<Card title="부문별 분포 & 연도 추이" titleIcon={Building2}
          sub={yearFilter === "all" ? "2024-2026 누적 · 수도권/지방 분포 및 연도별 변화" : `${yearFilter}년 부문 현황`}>
          <div className="flex flex-row gap-4 items-stretch">

            {/* ── 왼쪽: 도넛 + 범례 ── */}
            <div className="flex-shrink-0 flex flex-col items-center gap-3" style={{width: 170}}>
              <ResponsiveContainer width={160} height={160} debounce={50}>
                <PieChart>
                  <Pie data={bumPie} dataKey="value" nameKey="name" cx="50%" cy="50%"
                    startAngle={90} endAngle={-270}
                    innerRadius={42} outerRadius={68} paddingAngle={2}>
                    {bumPie.map((e, i) => <Cell key={i} fill={e.color} />)}
                  </Pie>
                  <Tooltip content={<TT />} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-1.5 w-full">
                {bumPie.map(b => (
                  <div key={b.name} className="flex items-center justify-between text-xs gap-2">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: b.color }} />
                      <span className="text-stone-600">{b.name}</span>
                    </div>
                    <span className="font-bold tabular-nums text-stone-800 flex-shrink-0">
                      {b.value}<span className="text-stone-400 font-normal text-[10px] ml-0.5">({pct(b.value, periodCount)}%)</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* ── 세로 구분선 ── */}
            <div className="w-px self-stretch bg-stone-100 flex-shrink-0" />

            {/* ── 오른쪽: 연도별 바 차트 ── */}
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={220} debounce={50}>
                <BarChart data={D.yearly} margin={{top: 4, right: 4, left: -10, bottom: 0}}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 11, fill: "#57534E" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} width={28} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="s" fill={BL} radius={[4,4,0,0]} name="수도권" />
                  <Bar dataKey="j" fill={OR} radius={[4,4,0,0]} name="지방" />
                  <Bar dataKey="e" fill={GR} radius={[4,4,0,0]} name="기타" />
                </BarChart>
              </ResponsiveContainer>
            </div>

          </div>
        </Card>)}
        
        <Card title="월별 추이" titleIcon={TrendingUp} sub={isCEO ? "건수와 추정 재무손실 동시 추적 (이중축)" : "수도권 vs 지방 부문별 월간 사고건수"} right={<ExportBtn rows={D.monthly} filename="월별_사고추이.csv" />}>
          <ResponsiveContainer width="100%" height={240} debounce={50}>
            <ComposedChart data={(() => {
              if (!isCEO) return monthlyFiltered;
              // 경영진 뷰: 각 월의 재무손실 계산 (억원 단위)
              return monthlyFiltered.map(m => {
                const wage = MIN_WAGE_DAY[m.y] || MIN_WAGE_DAY[CURRENT_YEAR];
                const lossEok = Math.round((m.t || 0) * avgLossDaysExec * wage * (1 + INDIRECT_COST_MULTIPLIER) / 1e8 * 10) / 10;
                return { ...m, lossEok };
              });
            })()}>
              <defs>
                <linearGradient id="gS" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={BL} stopOpacity={0.3} /><stop offset="100%" stopColor={BL} stopOpacity={0.02} /></linearGradient>
                <linearGradient id="gJ" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={OR} stopOpacity={0.3} /><stop offset="100%" stopColor={OR} stopOpacity={0.02} /></linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="ym" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} interval="preserveStartEnd" minTickGap={30} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              {isCEO && <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: DAISO_RED }} axisLine={false} tickLine={false} tickFormatter={v => `${v}억`} />}
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
              <Area yAxisId="l" type="monotone" dataKey="s" stroke={BL} strokeWidth={2} fill="url(#gS)" name="수도권" />
              <Area yAxisId="l" type="monotone" dataKey="j" stroke={OR} strokeWidth={2} fill="url(#gJ)" name="지방" />
              {isCEO && <Line yAxisId="r" type="monotone" dataKey="lossEok" stroke={DAISO_RED} strokeWidth={2.5} dot={{ r: 3, fill: DAISO_RED }} name="추정 재무손실(억원)" />}
            </ComposedChart>
          </ResponsiveContainer>
          {isCEO && (
            <div className="mt-2 p-2 rounded-md bg-stone-50 border border-stone-200 text-[11px] text-stone-600 leading-relaxed break-keep">
              <b className="text-stone-800">읽는 법</b>: 좌측 Y축(건수)과 우측 Y축(<span style={{color: DAISO_RED, fontWeight: 700}}>재무손실 억원</span>)을 동시 비교. 건수가 줄어도 최저시급 상승으로 재무손실은 덜 감소하는 경향 확인 가능.
            </div>
          )}
        </Card>
        
      </div>
      
      {isCEO && (
        <Card title="연도별 재무 임팩트 추이" titleIcon={Banknote} sub="사고건수와 추정 재무손실의 연도별 변화 — 경영 리스크 가시화">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
            {yearlyFinance.map((y, i) => {
              const prev = i > 0 ? yearlyFinance[i-1].lossEok : null;
              const delta = prev ? ((y.lossEok - prev) / prev * 100).toFixed(1) : null;
              return (
                <div key={y.year} className="rounded-lg p-4 border border-stone-200 bg-white" >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-stone-600">{y.year}</span>
                    {delta && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: delta > 0 ? "#FEE2E2" : "#DCFCE7", color: delta > 0 ? ALERT_RED : SAFE_GREEN }}>{delta > 0 ? "▲" : "▼"}{Math.abs(delta)}%</span>}
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-2xl font-bold tabular-nums" style={{ color: i === 2 ? DAISO_RED : "#1C1917" }}>{y.lossEok}</span>
                    <span className="text-sm text-stone-400">억원</span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-1">사고 {y.count}건 · 매출 환산 {y.salesEok}억</div>
                </div>
              );
            })}
          </div>
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <ComposedChart data={yearlyFinance} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}억`} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.year}</div><div>사고 {p.count}건</div><div className="font-bold mt-0.5" style={{color: DAISO_RED}}>손실 {p.lossEok}억원</div><div className="text-stone-500 mt-0.5">매출 환산 {p.salesEok}억</div></div>;
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="count" fill="#D6D3D1" radius={[6,6,0,0]} name="사고 건수" />
              <Line yAxisId="r" type="monotone" dataKey="lossEok" stroke={DAISO_RED} strokeWidth={3} dot={{r:5, fill: DAISO_RED}} name="추정 재무손실(억원)" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3 p-3 rounded-lg bg-white border border-stone-200 text-xs text-stone-700 break-keep">
            <b className="text-stone-900">경영진 메시지</b>: 2026년은 4월까지의 실적으로 <b style={{color: DAISO_RED}}>{Math.round(yearlyFinance[2]?.lossEok * 3)}억원</b>(연환산) 수준. 사고 단가(최저시급) 상승이 지속되어 재무 임팩트는 건수보다 빠르게 확대되는 구조.
          </div>
        </Card>
      )}
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {(isCEO || isSafety || !role) && (<Card title="재해유형별 재무 영향" titleIcon={Banknote} sub="Top 5 · 추정 재무손실 (빈도 기반)">
        <ResponsiveContainer width="100%" height={180} debounce={50}>
          <BarChart data={typeFinance} layout="vertical" margin={{ left: 10, right: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 500 }} axisLine={false} tickLine={false} width={75} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.type}</div><div>사고 {p.freq}건</div><div className="font-bold mt-0.5" style={{color: DAISO_RED}}>추정 손실 {p.lossEok}억원</div></div>;
            }} />
            <Bar dataKey="lossEok" fill={DAISO_RED} radius={[0,4,4,0]}>
              <LabelList dataKey="lossEok" position="right" formatter={(v) => `${v}억`} style={{ fontSize: 10, fill: "#44403C", fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-2 p-2 rounded-md bg-stone-50 border border-stone-200 text-[11px] text-stone-600 leading-relaxed break-keep">
          <b className="text-stone-800">해석</b>: 빈도 상위 재해유형별 간접비 포함 손실 추정액. <b>넘어짐·무리한 동작</b>이 전체 손실의 다수.
        </div>
      </Card>)}

      {/* ─── 영업부문장: 부서별 IR Top 5 ─── */}
      {isManager && (
        <Card title="부서별 사고율 Top 5 — 영업부문장 우선 점검" titleIcon={Building} sub="100매장당 사고건수 기준 — 클릭 시 부서·팀 탭으로 이동" right={<button onClick={() => setTab && setTab("dept")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline flex items-center gap-0.5">상세 분석 <ChevronRight size={12}/></button>}>
          <div className="space-y-2">
            {(D.dept_ir || []).slice(0, 5).map((d, i) => (
              <div key={d.dept} onClick={() => setTab && setTab("dept")} className="flex items-center gap-3 p-2 rounded-lg bg-stone-50 border border-stone-200 hover:border-blue-300 cursor-pointer transition">
                <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background: i === 0 ? ALERT_RED : i < 3 ? "#F97316" : "#A8A29E", color: "white"}}>{i + 1}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-bold text-sm text-stone-900 truncate">{d.dept}</div>
                  <div className="text-[11px] text-stone-500">{d.bum} · {d.stores}개 매장 · {d.incidents}건 발생</div>
                </div>
                <div className="text-right flex-shrink-0">
                  <div className="text-lg font-extrabold tabular-nums" style={{color: i === 0 ? ALERT_RED : "#1C1917"}}>{d.rate}</div>
                  <div className="text-[10px] text-stone-500">건/100매장</div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* ─── 팀장: 팀 IR Top 5 + 반복재해자 ─── */}
      {isTeam && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="팀별 사고율 Top 5" titleIcon={Users} sub="고위험 팀 우선 관리" right={<button onClick={() => setTab && setTab("dept")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">상세 →</button>}>
            <div className="space-y-2">
              {(D.team_ir || []).slice(0, 5).map((t, i) => (
                <div key={t.team} className="flex items-center gap-3 p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background: i === 0 ? ALERT_RED : i < 3 ? "#F97316" : "#A8A29E", color: "white"}}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm text-stone-900 truncate">{t.team}</div>
                    <div className="text-[11px] text-stone-500 truncate">{t.dept}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-extrabold tabular-nums">{t.rate}</div>
                    <div className="text-[10px] text-stone-500">/100매장</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="반복재해자 현황" titleIcon={UserCircle} sub={`총 ${D.repeat_workers?.repeat_count || 0}명 · ${D.repeat_workers?.repeat_incidents || 0}건 발생`} right={<button onClick={() => setTab && setTab("repeat")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">상세 →</button>}>
            <div className="space-y-2">
              {(D.repeat_workers?.list || []).slice(0, 5).map((w, i) => (
                <div key={w.id+i} className="flex items-center justify-between p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full flex-shrink-0 flex items-center justify-center text-[10px] font-bold" style={{background: ALERT_RED, color: "white"}}>{w.count}</span>
                    <div className="min-w-0">
                      <div className="font-semibold text-sm truncate">{w.name}</div>
                      <div className="text-[10px] text-stone-500 truncate">{(w.teams || []).join(", ")} · {(w.types || []).join(", ")}</div>
                    </div>
                  </div>
                </div>
              ))}
              {(!D.repeat_workers?.list || D.repeat_workers.list.length === 0) && <div className="text-xs text-stone-400 text-center py-3">반복재해자 없음</div>}
            </div>
          </Card>
        </div>
      )}

      {/* ─── 파트장: 사고 다발 매장 + 기인물 ─── */}
      {isPart && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="사고 다발 매장 Top 5" titleIcon={Store} sub="현장 점검 우선 대상" right={<button onClick={() => setTab && setTab("riskmap")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">위험지도 →</button>}>
            <div className="space-y-2">
              {(D.stores || []).slice(0, 5).map((s, i) => (
                <div key={s.store} className="flex items-center gap-3 p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background: i === 0 ? ALERT_RED : i < 3 ? "#F97316" : "#A8A29E", color: "white"}}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm truncate">{s.store}</div>
                    <div className="text-[11px] text-stone-500 truncate">{s.dept} · {s.team}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-base font-extrabold tabular-nums" style={{color: ALERT_RED}}>{s.total}</div>
                    <div className="text-[10px] text-stone-500">건</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card title="주요 기인물 Top 5" titleIcon={AlertTriangle} sub="사고 원인 집중 점검" right={<button onClick={() => setTab && setTab("cross")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">교차분석 →</button>}>
            <div className="space-y-2">
              {Object.entries(D.cause || {}).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count], i) => (
                <div key={name} className="flex items-center gap-3 p-2 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0" style={{background: i === 0 ? ALERT_RED : "#A8A29E", color: "white"}}>{i + 1}</div>
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-sm">{name}</div>
                  </div>
                  <div className="flex-shrink-0 text-right">
                    <div className="text-base font-extrabold tabular-nums">{count}</div>
                    <div className="text-[10px] text-stone-500">건</div>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}

      {/* ─── 안전보건팀: 법규 KPI + 알림 ─── */}
      {isSafety && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <Card title="법적 보고 현황" titleIcon={Scale} sub="중대재해처벌법·산재 관리 지표" right={<button onClick={() => setTab && setTab("legal")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">상세 →</button>}>
            <div className="grid grid-cols-2 gap-2">
              <div className="p-3 rounded-lg bg-red-50 border border-red-200">
                <div className="text-[10px] text-red-700 font-bold mb-1">사망 사고 (T10)</div>
                <div className="text-2xl font-extrabold tabular-nums" style={{color: ALERT_RED}}>{D.kind?.["사망"] || 0}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">중대재해처벌법 대상</div>
              </div>
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div className="text-[10px] text-amber-700 font-bold mb-1">산재 미제출</div>
                <div className="text-2xl font-extrabold tabular-nums" style={{color: "#B45309"}}>{k.not_submitted || 0}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">제출 처리 필요</div>
              </div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-600 font-bold mb-1">산재 제출률</div>
                <div className="text-2xl font-extrabold tabular-nums">{((k.submitted/(k.submitted+k.not_submitted))*100).toFixed(0)}%</div>
                <div className="text-[10px] text-stone-500 mt-0.5">법적 의무 이행</div>
              </div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-600 font-bold mb-1">출퇴근 재해</div>
                <div className="text-2xl font-extrabold tabular-nums">{D.kind?.["출퇴근"] || 0}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">통제 외지만 보상</div>
              </div>
            </div>
          </Card>
          <Card title="안전 교육 우선순위" titleIcon={ShieldCheck} sub="신입·고연령 사고 비율 분석" right={<button onClick={() => setTab && setTab("human")} className="text-xs text-blue-600 font-bold cursor-pointer hover:underline">인적요인 →</button>}>
            <div className="space-y-3">
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-stone-700">신입 (1년 미만) 사고 비율</span>
                  <span className="text-base font-extrabold tabular-nums" style={{color: ALERT_RED}}>{(((D.tenure?.["1년 미만"]||0)/k.total)*100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-stone-200 rounded-full overflow-hidden"><div className="h-full" style={{width: `${(((D.tenure?.["1년 미만"]||0)/k.total)*100).toFixed(0)}%`, background: ALERT_RED}} /></div>
                <div className="text-[10px] text-stone-500 mt-1.5">{D.tenure?.["1년 미만"]||0}건 발생 — 채용 후 안전교육 강화 필요</div>
              </div>
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-stone-700">50대+ 사고 비율</span>
                  <span className="text-base font-extrabold tabular-nums">{((((D.age?.["50 대"]||0)+(D.age?.["60 대"]||0))/k.total)*100).toFixed(0)}%</span>
                </div>
                <div className="h-2 bg-stone-200 rounded-full overflow-hidden"><div className="h-full" style={{width: `${((((D.age?.["50 대"]||0)+(D.age?.["60 대"]||0))/k.total)*100).toFixed(0)}%`, background: "#F97316"}} /></div>
                <div className="text-[10px] text-stone-500 mt-1.5">{(D.age?.["50 대"]||0)+(D.age?.["60 대"]||0)}건 발생 — 무리한 동작·근골격계 예방</div>
              </div>
            </div>
          </Card>
        </div>
      )}


      <Card title="핵심 인사이트" titleIcon={Lightbulb} sub="카드 클릭 시 관련 탭으로 이동">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div onClick={() => setTab && setTab("dept")} className="rounded-lg border border-stone-200 bg-stone-50 p-4 cursor-pointer hover:shadow-md hover:border-blue-300 transition">
            <div className="text-xs font-bold text-blue-700 mb-1 flex items-center gap-1">부문 편중 <ChevronRight size={11} /></div>
            <div className="text-sm text-stone-700">수도권이 지방 대비 <b>{(k.sudo/k.jibang).toFixed(2)}배</b></div>
          </div>
          <div onClick={() => setTab && setTab("time")} className="rounded-lg border border-orange-100 bg-orange-50/50 p-4 cursor-pointer hover:shadow-md hover:border-orange-300 transition">
            <div className="text-xs font-bold text-orange-700 mb-1 flex items-center gap-1">증가 추세 <ChevronRight size={11} /></div>
            <div className="text-sm text-stone-700">2024→2025 <b>+{yoyStr}%</b> · 2026은 4월 기준 {k.y2026}건</div>
          </div>
          <div onClick={() => setTab && setTab("legal")} className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4 cursor-pointer hover:shadow-md hover:border-emerald-300 transition">
            <div className="text-xs font-bold text-green-700 mb-1 flex items-center gap-1">보고 현황 <ChevronRight size={11} /></div>
            <div className="text-sm text-stone-700">산재 제출률 <b>{submitRate}%</b> · 확인 필요</div>
          </div>
        </div>
      </Card>
      </div>

      {/* AI 전체 현황 요약 */}
      
      {/* 역할별 맞춤 요약 ─── role 토글 시 변경 */}
      {role && (
        <Card title={`${roleLabel} 요약 — ${yearFilter === "all" ? "전체 기간" : yearFilter + "년"}`} titleIcon={UserCircle} sub="역할에 맞춰 핵심 지표 강조">
          {isCEO && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">총 추정 손실</div>
                <div className="text-xl font-extrabold tabular-nums" style={{color:DAISO_RED}}>
                  {(((D.kpis?.total||0) * 22 * (MIN_WAGE_DAY[CURRENT_YEAR]||80000) * 1.4) / 1e8).toFixed(1)}억원
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">간접비 1.4× 포함</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">YoY</div>
                <div className="text-xl font-extrabold tabular-nums" style={{color:k.y2025>k.y2024?ALERT_RED:SAFE_GREEN}}>
                  {((k.y2025-k.y2024)/k.y2024*100).toFixed(1)}%
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">'24→'25 증감률</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">중상해 비율</div>
                <div className="text-xl font-extrabold tabular-nums">
                  {D.severity?.dist?.중상 ? ((D.severity.dist.중상/(D.kpis?.total||1))*100).toFixed(1) : 0}%
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">중대재해처벌법 지표</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">산재 제출률</div>
                <div className="text-xl font-extrabold tabular-nums">
                  {((k.submitted/(k.submitted+k.not_submitted))*100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">법적 의무 이행</div>
              </div>
            </div>
          )}
          {isManager && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">수도권 사고</div>
                <div className="text-xl font-extrabold tabular-nums">{k.sudo}건</div>
                <div className="text-[10px] text-stone-500 mt-0.5">전체 {((k.sudo/k.total)*100).toFixed(1)}%</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">지방 사고</div>
                <div className="text-xl font-extrabold tabular-nums">{k.jibang}건</div>
                <div className="text-[10px] text-stone-500 mt-0.5">전체 {((k.jibang/k.total)*100).toFixed(1)}%</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">사고 다발 부서</div>
                <div className="text-base font-bold truncate">{(D.dept_ir?.[0]?.dept || "-").replace("영업부","")}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{D.dept_ir?.[0]?.rate || 0}/100매장</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">관리 매장 수</div>
                <div className="text-xl font-extrabold tabular-nums">{D.store_kpi?.total || 0}개</div>
                <div className="text-[10px] text-stone-500 mt-0.5">사고발생 {k.unique_stores}개</div>
              </div>
            </div>
          )}
          {isTeam && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">최고 위험 팀</div>
                <div className="text-base font-bold truncate">{D.team_ir?.[0]?.team || "-"}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{D.team_ir?.[0]?.rate || 0}/100매장</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">상위 5팀 평균 IR</div>
                <div className="text-xl font-extrabold tabular-nums">
                  {(D.team_ir?.slice(0,5).reduce((s,t)=>s+(t.rate||0),0)/5 || 0).toFixed(1)}
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">건/100매장</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">반복재해자</div>
                <div className="text-xl font-extrabold tabular-nums">{D.repeat_workers?.repeat_count || 0}명</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{D.repeat_workers?.repeat_incidents || 0}건 발생</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">중상 사고</div>
                <div className="text-xl font-extrabold tabular-nums" style={{color:ALERT_RED}}>
                  {D.severity?.dist?.중상 || 0}건
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">근로손실 91일+</div>
              </div>
            </div>
          )}
          {isPart && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">사고 다발 매장</div>
                <div className="text-base font-bold truncate">{D.stores?.[0]?.store || "-"}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{D.stores?.[0]?.total || 0}건 발생</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">3건+ 매장</div>
                <div className="text-xl font-extrabold tabular-nums">
                  {(D.stores || []).filter(s => s.total >= 3).length}개
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">집중관리 대상</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">최다 재해유형</div>
                <div className="text-base font-bold truncate">{D.risk?.[0]?.type || "-"}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{D.risk?.[0]?.freq || 0}건</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">최다 기인물</div>
                <div className="text-base font-bold truncate">{Object.entries(D.cause||{}).sort((a,b)=>b[1]-a[1])[0]?.[0] || "-"}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">{Object.entries(D.cause||{}).sort((a,b)=>b[1]-a[1])[0]?.[1] || 0}건</div>
              </div>
            </div>
          )}
          {isSafety && (
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">총 사고건수</div>
                <div className="text-xl font-extrabold tabular-nums">{k.total}건</div>
                <div className="text-[10px] text-stone-500 mt-0.5">분석 대상</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">사망 사고</div>
                <div className="text-xl font-extrabold tabular-nums" style={{color:ALERT_RED}}>
                  {D.kind?.["사망"] || 0}건
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">중대재해처벌법 T10</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">산재 미제출</div>
                <div className="text-xl font-extrabold tabular-nums" style={{color:ALERT_RED}}>
                  {k.not_submitted || 0}건
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">제출 처리 필요</div>
              </div>
              <div className="rounded-lg p-3 bg-stone-50 border border-stone-200">
                <div className="text-[10px] text-stone-500 font-bold mb-1">신입 사고 비율</div>
                <div className="text-xl font-extrabold tabular-nums">
                  {(((D.tenure?.["1년 미만"]||0)/k.total)*100).toFixed(0)}%
                </div>
                <div className="text-[10px] text-stone-500 mt-0.5">교육 강화 대상</div>
              </div>
            </div>
          )}
        </Card>
      )}

      <Card title="AI 사고 현황 요약" titleIcon={Lightbulb} sub="Gemini가 전체 사고 데이터를 분석해 핵심 패턴과 개선 포인트를 요약합니다">
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
- 상위 재해 유형: ${Object.entries(D.kpis?.type_dist || {}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([t,n])=>`${t} ${n}건`).join(", ") || "데이터 없음"}
- 산재 제출률: ${submitRate}%
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
              aiSummary.run(prompt);
            }}
            disabled={aiSummary.loading}
            className="inline-flex items-center gap-1.5 h-8 px-3.5 rounded-lg text-xs font-semibold text-white transition-all cursor-pointer disabled:opacity-50"
            style={{background: aiSummary.loading ? "#9CA3AF" : "linear-gradient(135deg,#4F46E5,#7C3AED)"}}>
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
          <div className="text-xs text-stone-400 text-center py-4">위 버튼을 누르면 AI가 전체 사고 현황을 분석합니다</div>
        )}
        <GeminiOutput text={aiSummary.text} loading={aiSummary.loading} />
      </Card>
    </div>
  );
}


// ========== TAB 2: Dept/Team/Store with Drill-down ==========
export default Overview;

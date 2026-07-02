import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingDown, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS, rankColor } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix, gradientCells } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';
import { Odometer, Sparkline, SegmentedToggle } from '../../../components/shared/MotionBits.jsx';

const yoy = (cur, prev) => prev ? ((cur - prev) / prev * 100) : null;

function TeamTick({ x, y, payload, data }) {
  if (!payload) return null;
  const row = (data || []).find(t => t.team === payload.value);
  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} dy={-1} textAnchor="end" fontSize={10} fontWeight={700} fill="#44403C">{payload.value}</text>
      <text x={-8} dy={9} textAnchor="end" fontSize={8} fill="#A8A29E">{row?.dept || row?.bum || ""}</text>
    </g>
  );
}

function DeptTeamStore({ D, yearFilter }) {
  const [bum, setBum] = useState("전체");
  const [selDept, setSelDept] = useState(null);
  const [storeSearch, setStoreSearch] = useState("");
  const [metric, setMetric] = useState("per_store"); // 'per_store' | 'ir_per100'

  const isYearFilter = yearFilter !== "all";
  const yearKey = isYearFilter ? `y${yearFilter.slice(2)}` : "total";
  // 부서별 YoY — 선택 연도 기준 동적 (전체=2024→2025 최근 2개 완결연도)
  const yoyCurY = isYearFilter ? parseInt(yearFilter) : CURRENT_YEAR;
  const yoyPrevY = yoyCurY - 1;
  const yoyCurK = 'y' + String(yoyCurY).slice(2);
  const yoyPrevK = 'y' + String(yoyPrevY).slice(2);
  const yoyHasPrev = ['y24', 'y25', 'y26'].includes(yoyPrevK);

  // 연도 필터 시 해당 연도 값을 total로 사용 + per_store 재계산
  const transform = (rows) => rows.map(r => {
    if (!isYearFilter) return r;
    const y = r[yearKey] || 0;
    return {
      ...r,
      total: y,
      // 매장당 사고: 사고 발생 매장 수 기반인데 연도별 매장수가 없어 비례 추정
      per_store: r.stores ? Math.round(y / r.stores * 100) / 100 : r.per_store,
    };
  });

  const deptsAll = transform(D.depts);
  const teamsAll = transform(D.teams);

  const activeDepts = bum === "전체" ? deptsAll : deptsAll.filter(d => d.bum === bum);
  const activeTeams = bum === "전체" ? teamsAll : teamsAll.filter(t => t.bum === bum);

  const depts = [...activeDepts].sort((a, b) => b.total - a.total);
  const teams = activeTeams.filter(t => !selDept || t.dept === selDept).sort((a, b) => b.total - a.total);

  // 매장별 워스트 — 실제 사고 데이터(D.accidents)로 연도·부문·기준(사고경위/산재승인) 반영
  // (연도별 매장 breakdown이 없으면 전체기간 total 비례추정으로 폴백)
  const matchSearch = (s) => !storeSearch || (s.store || "").includes(storeSearch) || (s.dept || "").includes(storeSearch) || (s.team || "").includes(storeSearch);
  const stores = (() => {
    const acc = D.accidents;
    if (Array.isArray(acc) && acc.length) {
      const rows = acc.filter(a =>
        a.store && a.store !== "정보 없음" &&
        (!isYearFilter || String(a.year) === yearFilter) &&
        (bum === "전체" || a.bum === bum)
      );
      const m = new Map();
      for (const a of rows) {
        let e = m.get(a.store);
        if (!e) { e = { store: a.store, dept: a.dept, team: a.team, bum: a.bum, total: 0, _types: {} }; m.set(a.store, e); }
        e.total++;
        if (a.type) e._types[a.type] = (e._types[a.type] || 0) + 1;
      }
      const minCnt = isYearFilter ? 1 : 3;   // 전체기간=집중관리(3건+), 연도별=발생매장 전체
      return [...m.values()]
        .filter(s => s.total >= minCnt && matchSearch(s))
        .map(s => ({ store: s.store, dept: s.dept, team: s.team, bum: s.bum, total: s.total, top_type: Object.entries(s._types).sort((a, b) => b[1] - a[1])[0]?.[0] || "-" }))
        .sort((a, b) => b.total - a.total)
        .slice(0, 25);
    }
    // 폴백: 연도별 매장 breakdown이 없을 때 전체기간 total 비례추정
    const storeRatio = isYearFilter ? (D.kpis[`y${yearFilter}`] || 0) / (D.kpis.total || 1) : 1;
    return D.stores
      .map(s => isYearFilter ? { ...s, total: Math.round((s.total || 0) * storeRatio) } : s)
      .filter(s => bum === "전체" || s.bum === bum)
      .filter(s => isYearFilter ? s.total > 0 : s.total >= 3)
      .filter(matchSearch)
      .slice(0, 25);
  })();

  // 매장 워스트 테이블 — mini bar 기준값
  const maxStore = stores.length > 0 ? Math.max(...stores.map(s => s.total || 0), 1) : 1;

  // top-3 행 왼쪽 강조 테두리 + 배경
  const rowAccent = (i) => {
    if (i === 0) return { border: 'border-l-[3px] border-l-red-500', bg: 'bg-red-50/40' };
    if (i === 1) return { border: 'border-l-[3px] border-l-[#1D4ED8]', bg: 'bg-blue-50/30' };
    if (i === 2) return { border: 'border-l-[3px] border-l-amber-500', bg: 'bg-amber-50/30' };
    return { border: '', bg: '' };
  };
  // 순위 셀 배지 컬러
  const rankBadge = (i) => {
    if (i === 0) return 'bg-red-100 text-red-700 border border-red-200';
    if (i === 1) return 'bg-blue-100 text-[#1D4ED8] border border-blue-200';
    if (i === 2) return 'bg-amber-100 text-amber-700 border border-amber-200';
    return 'bg-stone-100 text-stone-500 border border-stone-200';
  };

  // === 안전 지표 헬퍼 (D.dept_ir/D.team_ir 전체기간 스냅샷 IR) ===
  const isPer100 = metric === "ir_per100";
  const hasWorker = D.team_ir && D.team_ir.some(t => t.workers != null);
  // 매장당 사고율 = 사고건수 ÷ 매장수 (매장 1곳당 평균 사고 건수)
  const perStore = (r) => (r && r.stores ? (r.incidents || 0) / r.stores : 0);
  // 전사 가중평균(총사고 ÷ 총매장) — 등급의 기준선
  const meanPerStore = (() => {
    const rows = D.dept_ir || [];
    const ti = rows.reduce((a, d) => a + (d.incidents || 0), 0);
    const ts = rows.reduce((a, d) => a + (d.stores || 0), 0);
    return ts ? ti / ts : 0;
  })();
  // 전사 평균 대비 상대 등급 (안전/양호/주의/위험)
  const GRADES = {
    safe:   { label: "안전", color: GN, bg: "#ECFDF5" },
    good:   { label: "양호", color: BL, bg: "#EFF6FF" },
    watch:  { label: "주의", color: AM, bg: "#FFFBEB" },
    danger: { label: "위험", color: RD, bg: "#FEF2F2" },
  };
  const gradeOf = (r) => {
    const v = perStore(r);
    const ratio = meanPerStore ? v / meanPerStore : 1;
    const g = ratio < 0.7 ? GRADES.safe : ratio < 1.0 ? GRADES.good : ratio < 1.4 ? GRADES.watch : GRADES.danger;
    return { ...g, ratio, value: v };
  };
  const reliColor = (r) => r === "high" ? null : r === "low" ? "#A8A29E" : r === "unstable" ? "#D6D3D1" : null;
  // 차트 데이터: 매장당 사고율(기본) 또는 100명당 IR 기준 정렬
  // 부문 토글 연동 — 선택 부문의 팀만 (전체=모두). 등급 기준선(meanPerStore)은 전사 평균 유지
  const teamGraded = (D.team_ir || []).filter(t => bum === "전체" || t.bum === bum).map(t => ({ ...t, per_store: perStore(t) }));
  const teamIrChartData = isPer100
    ? teamGraded.filter(t => t.ir_per100 != null).sort((a, b) => b.ir_per100 - a.ir_per100).slice(0, 28)
    : teamGraded.slice().sort((a, b) => b.per_store - a.per_store).slice(0, 28);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* U3: 부문 선택 — 탭 상단 고정 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap border border-stone-100 shadow-sm -mx-0.5">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">부문</span>
        {["전체", "수도권", "지방"].map(b => (
          <button key={b} onClick={() => { setBum(b); setSelDept(null); }} className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-semibold border transition cursor-pointer ${bum === b ? (b === "전체" ? "bg-[#071E4A] text-white border-[#071E4A]" : b === "수도권" ? "bg-blue-600 text-white border-blue-600" : "bg-[#93C5FD] text-[#071E4A] border-[#93C5FD]") : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>{b === "전체" ? "전체" : `${b}영업부문`}</button>
        ))}
        {selDept && <button onClick={() => setSelDept(null)} className="min-h-[44px] ml-2 px-3 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"><X size={11} className="inline -mt-0.5 mr-0.5" />{selDept} 선택 해제</button>}
      </div>

      {/* === 100명당 IR 배너 (3개 독립 카드, yearFilter 연동) === */}
      {D.worker_ir_summary && D.worker_ir_summary.total && (() => {
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
        const cards = [
          { label: "영업부문 100명당 IR", labelColor: ALERT_RED, ir: totalIr, incidents: totalIncidents, workers: totalWorkers, stores: totalStores, valueColor: "#1C1917", icon: true, spkData: D.yearly?.map(y => (y.s||0)+(y.j||0)+(y.e||0)) ?? [] },
          { label: "수도권", labelColor: "#1D4ED8", ir: sudoIr, incidents: sudoIncidents, workers: sudoWorkers, stores: sudoStores, valueColor: "#1D4ED8", spkData: D.yearly?.map(y => y.s||0) ?? [] },
          { label: "지방", labelColor: "#C2410C", ir: jibangIr, incidents: jibangIncidents, workers: jibangWorkers, stores: jibangStores, valueColor: "#C2410C", spkData: D.yearly?.map(y => y.j||0) ?? [] },
        ];
        return (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
              {cards.map((c, i) => (
                <div key={c.label}
                     className="rounded-lg p-3 sm:p-4 dash-slide-up"
                     style={{
                       background: "#FFFFFF",
                       border: "1px solid #EAE7E1",
                       boxShadow: "0 1px 2px rgba(28,25,23,0.04)",
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
          </>
        );
      })()}

      {/* === 팀 IR 임계값 배너 === */}
      {(() => {
        const teamIrs = (D.team_ir || []).filter(t => t.ir_per100 != null);
        if (teamIrs.length === 0) return null;
        const avgIr = teamIrs.reduce((s, t) => s + t.ir_per100, 0) / teamIrs.length;
        const threshold = avgIr * 1.5;
        const overTeams = teamIrs.filter(t => t.ir_per100 > threshold);
        if (overTeams.length === 0) return null;
        return (
          <div className="rounded-lg p-3 min-h-[52px] flex items-start gap-3" style={{ background: "#FFF7ED", border: "1px solid #FED7AA" }}>
            <span className="flex-shrink-0 mt-0.5">
              <AlertTriangle size={15} style={{ color: "#C2410C", flexShrink: 0 }} />
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-bold" style={{ color: "#92400E" }}>팀 IR 임계값 초과 — {overTeams.length}개 팀</div>
              <div className="text-xs text-stone-600 mt-0.5 break-keep">
                평균({avgIr.toFixed(2)}건/100명)의 1.5배({threshold.toFixed(2)}건/100명) 초과: {overTeams.slice(0, 3).map(t => t.team).join("·")}{overTeams.length > 3 ? ` 외 ${overTeams.length - 3}개` : ""}
              </div>
            </div>
          </div>
        );
      })()}

      {/* === 안전 지표 카드 1: 두 가지 안전 지표 설명 (근로자DB 업로드 시에만) === */}
      {hasWorker && (
        <Card title="두 가지 안전 지표 — 무엇이 다른가" titleIcon={Info} sub="매장당 사고율(매장 단위) vs 100명당 IR(인원 단위)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-blue-50 border border-blue-200">
              <div className="text-xs font-bold text-[#1D4ED8] mb-1">📦 매장당 사고율</div>
              <div className="text-xs text-stone-700 leading-relaxed">매장 1곳당 평균 사고 건수. <b>"매장 하나당 사고가 몇 건이나 나는가"</b> — 매장 운영 단위의 사고 부담을 봄.</div>
              <div className="font-mono text-[11px] text-stone-600 mt-2 p-1.5 bg-white rounded">사고 건수 ÷ 매장 수</div>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <div className="text-xs font-bold text-rose-800 mb-1">👥 100명당 IR (ir_per100)</div>
              <div className="text-xs text-stone-700 leading-relaxed">재직 인원 100명당 사고건수. <b>"한 명이 일할 때 사고를 만날 확률"</b> — 인원 노출량 보정한 사고 강도.</div>
              <div className="font-mono text-[11px] text-stone-600 mt-2 p-1.5 bg-white rounded">사고건수 ÷ 재직자수 × 100</div>
            </div>
          </div>
          <div className="mt-3 p-2.5 rounded-md bg-stone-50 border border-stone-200 text-[11px] text-stone-600 leading-relaxed">
            <b className="text-stone-800">등급은 전사 평균 대비 상대값</b> — 매장당 사고율이 전사 평균(<b>{meanPerStore.toFixed(2)}건/매장</b>)보다 충분히 낮으면 <span className="px-1.5 py-0.5 rounded font-semibold" style={{background:GRADES.safe.bg,color:GRADES.safe.color}}>안전</span>, 높으면 <span className="px-1.5 py-0.5 rounded font-semibold" style={{background:GRADES.danger.bg,color:GRADES.danger.color}}>위험</span>. 절대 안전이 아니라 <b>조직 간 상대 위험도</b>입니다.
          </div>
        </Card>
      )}

      {/* === 안전 지표 카드 2: 부서 및 팀별 안전 지표 (BarChart) === */}
      <Card title="부서 및 팀별 안전 지표" titleIcon={Target} sub={isPer100 ? "100명당 IR — 인원 노출량 보정한 사고 강도" : "매장당 사고율 — 매장 1곳당 평균 사고 건수 (전사 평균 대비 등급)"} right={<ExportBtn rows={teamGraded} filename="부서팀별_안전지표.csv" />}>
        {/* 지표 토글 */}
        {hasWorker && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone-500 font-semibold">표시 지표:</span>
            <SegmentedToggle
              value={metric}
              onChange={setMetric}
              options={[{ value: "per_store", label: "📦 매장당 사고율" }, { value: "ir_per100", label: "👥 100명당 IR" }]}
            />
          </div>
        )}
        <ResponsiveContainer key={metric} width="100%" height={Math.max(420, teamIrChartData.length * 24)} debounce={50}>
          <BarChart data={teamIrChartData} layout="vertical" margin={{ left: 40, right: 28, top: 4, bottom: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => v.toFixed(isPer100 ? 1 : 2)} />
            <YAxis type="category" dataKey="team" tick={<TeamTick data={teamIrChartData} />} axisLine={false} tickLine={false} width={114} interval={0} />
            <Tooltip cursor={{ fill: "rgba(0,0,0,0.03)" }} content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              const g = gradeOf(p);
              return (
                <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs">
                  <div className="font-bold mb-1">{p.team} <span className="text-stone-500 font-normal">({p.dept})</span></div>
                  <div>매장 {p.stores}개 · 사고 {p.incidents}건{p.workers != null ? ` · 인원 ${p.workers.toLocaleString()}명` : ""}</div>
                  <div className="font-bold mt-1 flex items-center gap-1.5" style={{color: g.color}}>📦 매장당 사고율: {p.per_store.toFixed(2)}건 <span className="px-1.5 py-0.5 rounded-full text-[10px]" style={{background:g.bg}}>{g.label}</span></div>
                  {p.ir_per100 != null && (
                    <div className="font-bold mt-0.5" style={{color: "#E11D48"}}>👥 100명당 IR: {p.ir_per100.toFixed(2)}건
                      {p.ir_reliability && <span className="ml-1.5 text-[10px] font-semibold" style={{color: p.ir_reliability==="high"?GN:p.ir_reliability==="low"?AM:"#78716C"}}>[{p.ir_reliability}]</span>}
                    </div>
                  )}
                </div>
              );
            }} />
            {!isPer100 && meanPerStore > 0 && <ReferenceLine x={meanPerStore} stroke={NV} strokeDasharray="4 3" label={{ value: `전사 평균 ${meanPerStore.toFixed(2)}`, fill: NV, fontSize: 10, position: "top" }} />}
            <Bar dataKey={isPer100 ? "ir_per100" : "per_store"} radius={[0,6,6,0]} name={isPer100 ? "100명당 IR" : "매장당 사고율"}>
              {teamIrChartData.map((e, i) => {
                let baseColor;
                if (isPer100) {
                  const v = e.ir_per100;
                  baseColor = v > 20 ? RD : v > 10 ? AM : v > 5 ? BL : GN;
                  const greyOut = reliColor(e.ir_reliability);
                  if (greyOut) baseColor = greyOut;
                } else {
                  baseColor = gradeOf(e).color;
                }
                return <Cell key={i} fill={baseColor} />;
              })}
              <LabelList dataKey={isPer100 ? "ir_per100" : "per_store"} position="right" style={{ fontSize: 10, fill: NV, fontWeight: 700 }} formatter={v => v.toFixed(2)} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {!isPer100 ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.safe.bg,color:GRADES.safe.color}}><b>안전</b> 평균의 0.7배 미만</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.good.bg,color:GRADES.good.color}}><b>양호</b> 0.7~1.0배</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.watch.bg,color:GRADES.watch.color}}><b>주의</b> 1.0~1.4배</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.danger.bg,color:GRADES.danger.color}}><b>위험</b> 1.4배 이상</div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.danger.bg,color:GRADES.danger.color}}><b>20+</b> 100명당 — 매우 위험</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.watch.bg,color:GRADES.watch.color}}><b>10-20</b> 주의</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:GRADES.good.bg,color:GRADES.good.color}}><b>5-10</b> 일반</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#F1F5F9",color:"#475569"}}><b>&lt;5</b> 낮음 / 회색=⚠️ unstable</div>
          </div>
        )}
      </Card>

      {/* === 안전 지표 카드 3: 부서별 안전 지표 테이블 === */}
      {D.dept_ir && (
        <Card title="부서별 안전 지표" titleIcon={Building2} sub={hasWorker ? "매장당 사고율 · 100명당 IR · 인원수 — 부서 단위 (등급=전사 평균 대비)" : "부서별 매장당 사고율 — 전사 평균 대비 등급"} right={<ExportBtn rows={D.dept_ir} filename="부서별_안전지표.csv" />}>
          <div className="overflow-x-auto -mx-5 px-5 pb-2">
            <table className="w-full min-w-[680px] text-sm">
              <thead>
                <tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
                  <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
                  <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                  <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장 수</th>
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">사고 수</th>
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장당 사고율</th>
                  {hasWorker && <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">인원수</th>}
                  {hasWorker && <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">100명당 IR</th>}
                  <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">평균 평수</th>
                  <th className="text-left py-2 px-3 font-semibold whitespace-nowrap" style={{width: 130}}>등급</th>
                </tr>
              </thead>
              <tbody>{[...D.dept_ir].filter(d => bum === "전체" || d.bum === bum).sort((a, b) => perStore(b) - perStore(a)).map((d, i) => {
                const g = gradeOf(d);
                return (
                <tr key={d.dept} className="border-b border-stone-100 hover:bg-stone-50/60 transition-colors">
                  <td className="py-2 px-3 text-xs font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold whitespace-nowrap">{d.dept}</td>
                  <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${d.bum === "수도권" ? "bg-blue-50 text-[#1D4ED8] border border-blue-200" : "bg-stone-100 text-stone-700"}`}>{d.bum}</span></td>
                  <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.stores}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{d.incidents}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-extrabold whitespace-nowrap" style={{color: g.color}}>{g.value.toFixed(2)}<span className="text-[10px] font-normal text-stone-400 ml-0.5">건</span></td>
                  {hasWorker && <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.workers != null ? d.workers.toLocaleString() : "—"}</td>}
                  {hasWorker && (
                    <td className="py-2 px-3 text-right tabular-nums font-extrabold whitespace-nowrap" style={{color: d.ir_per100 == null ? "#A8A29E" : d.ir_per100 > 20 ? RD : d.ir_per100 > 10 ? AM : GN}}>
                      {d.ir_per100 != null ? d.ir_per100.toFixed(2) : "—"}
                      {d.ir_reliability && d.ir_reliability !== "high" && <span className="ml-1 text-[10px] font-semibold align-middle" title={d.ir_reliability}>{d.ir_reliability === "unstable" ? "⚠" : "○"}</span>}
                    </td>
                  )}
                  <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.avg_area}평</td>
                  <td className="py-2 px-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold" style={{background: g.bg, color: g.color}}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{background: g.color}} />
                      {g.label}
                    </span>
                  </td>
                </tr>
                );
              })}</tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`${bum} - 부서별 연도`} delay={140} sub="막대 클릭하면 팀 필터링">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart key={`depts-${bum}-${yearFilter}`} data={depts} margin={{ left: 10, top: 10 }} onClick={(e) => { if (e?.activePayload?.length > 0) setSelDept(e.activePayload[0].payload.dept); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="dept" tick={{ fontSize: 9, fill: "#57534E" }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              {isYearFilter ? (
                <Bar dataKey="total" fill={bum === "지방" ? OR : BL} radius={[4, 4, 0, 0]} name={`${yearFilter}년`} animationDuration={700} />
              ) : (
                <>
                  <Bar dataKey="y24" fill="#D6D3D1" radius={[4, 4, 0, 0]} name="2024" animationDuration={700} />
                  <Bar dataKey="y25" fill={BL} radius={[4, 4, 0, 0]} name="2025" animationDuration={700} animationBegin={120} />
                  <Bar dataKey="y26" fill={bum === "지방" ? "#FED7AA" : "#93C5FD"} radius={[4, 4, 0, 0]} name="2026" animationDuration={700} animationBegin={240} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`${bum} - 부서별 YoY`} delay={210} sub={yoyHasPrev ? `${yoyPrevY}→${yoyCurY} 증감률 · 매장IR 탭에서 팀별 상세 확인` : `${yoyCurY} 기준 (전년 데이터 없음)`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {!yoyHasPrev ? (
              <div className="col-span-full text-xs text-stone-400 py-3 text-center">{yoyCurY}년은 전년({yoyPrevY}) 데이터가 없어 YoY 산출 불가</div>
            ) : [...depts].sort((a,b) => {
              const ya = a[yoyPrevK] > 0 ? (a[yoyCurK] - a[yoyPrevK]) / a[yoyPrevK] * 100 : null;
              const yb = b[yoyPrevK] > 0 ? (b[yoyCurK] - b[yoyPrevK]) / b[yoyPrevK] * 100 : null;
              return (yb ?? -999) - (ya ?? -999);
            }).map(d => {
              const yoyVal = d[yoyPrevK] > 0 ? yoy(d[yoyCurK], d[yoyPrevK]) : null;
              const isUp = yoyVal !== null && yoyVal > 0;
              const isDown = yoyVal !== null && yoyVal < 0;
              return (
                <div key={d.dept} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-stone-50 border border-stone-100">
                  <div className="text-xs font-semibold text-stone-700 truncate flex-1 min-w-0">{d.dept}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-stone-400 tabular-nums">{d[yoyPrevK]}→{d[yoyCurK]}건</span>
                    {yoyVal !== null ? (
                      <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded transition-all flex items-center gap-0.5"
                        style={{
                          color: isUp ? ALERT_RED : isDown ? SAFE_GREEN : "#78716C",
                          background: isUp ? "#FEE2E2" : isDown ? "#DCFCE7" : "#F5F5F4"
                        }}>
                        {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <span className="text-[10px]">─</span>}
                        {Math.abs(yoyVal).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-300 px-1.5">─</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {yoyHasPrev && (
            <div className="mt-2 text-[10px] text-stone-400">※ {yoyPrevY} 사고 0건인 부서는 YoY 산출 불가 · 팀별 상세 → 매장IR 탭</div>
          )}
        </Card>
      </div>

      <Card title={`${selDept || bum} - 부서별 월간 히트맵`} delay={280} sub="색상이 진할수록 사고 다발">
        <HeatmapGrid rows={depts.map(d => ({ label: d.dept.replace("영업부", ""), total: d.total, hm: d.hm }))} yearFilter={yearFilter} />
      </Card>

      <Card title={`${selDept || bum} - 팀별 월간 히트맵`} delay={350} sub="팀 단위 월간 사고 패턴">
        <HeatmapGrid rows={teams.map(t => ({ label: t.team, total: t.total, hm: t.hm }))} yearFilter={yearFilter} />
      </Card>

      {/* 매장 드릴다운 */}
      <Card title="매장별 워스트 Top 25" titleIcon={Store} delay={420} sub={isYearFilter ? `${yearFilter}년 사고 발생 매장${bum !== "전체" ? ` · ${bum}` : ""}` : `사고 3건 이상 발생 매장 — 집중관리 대상${bum !== "전체" ? ` · ${bum}` : ""}`} right={
        <div className="flex gap-2 items-center">
          <input type="text" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} placeholder="검색..." className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 w-28 sm:w-36 outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:border-[#1D4ED8] transition-colors" />
          <ExportBtn rows={stores} filename="매장별_사고랭킹.csv" />
        </div>
      }>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">매장명</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">팀</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">건수</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">주 재해유형</th>
            </tr></thead>
            <tbody>{stores.map((s, i) => {
              const { border, bg } = rowAccent(i);
              const barWidth = maxStore > 0 ? Math.round((s.total || 0) / maxStore * 100) : 0;
              return (
                <tr key={s.store + i} className={`border-b border-stone-100 hover:bg-stone-50/60 ${bg}`}>
                  <td className={`py-2 px-3 whitespace-nowrap ${border}`}>
                    <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${rankBadge(i)}`}>{i + 1}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap">{s.store}</td>
                  <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${s.bum === "수도권" ? "bg-blue-50 text-[#003B8F] border border-stone-200" : "bg-stone-100 text-stone-700 border border-stone-200"}`}>{s.bum}</span></td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.dept}</td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.team}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="tabular-nums font-bold">{s.total}</span>
                      <div className="w-12 h-1 bg-stone-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full bg-[#1D4ED8] rounded-full" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{s.top_type}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}


// ========== TAB 3: Time Series (월별·분기·반기 통합) ==========
export default DeptTeamStore;

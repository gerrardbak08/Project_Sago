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
import { useCountUp, useInView as useInViewMotion } from '../../../utils/motion.js';
import { SegmentedToggle, ProgressRing } from '../../../components/shared/MotionBits.jsx';

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

function StoreAnalysis({ D, yearFilter, setYearFilter }) {
  const [metric, setMetric] = useState("per_store"); // 'per_store' | 'ir_per100'
  const hasWorker = D.team_ir && D.team_ir.some(t => t.workers != null);
  const formStats = D.form_stats || [];
  const sizeStats = D.size_stats || [];
  const ageStats  = D.age_stats  || [];

  // KPI 카운트업 — hooks 규칙상 early return 이전에 선언
  const kpiRef = useRef(null);
  const kpiInView = useInViewMotion(kpiRef);
  const cTotal    = useCountUp(D.store_kpi?.total    || 0, 900, kpiInView);
  const cSafe     = useCountUp(D.store_coverage?.safe || 0, 900, kpiInView);
  const cInvolved = useCountUp(D.store_coverage?.involved || 0, 900, kpiInView);
  const cArea     = useCountUp(Math.round((Number(D.store_kpi?.avg_area) || 0) * 10), 900, kpiInView);

  if (!D.team_ir || D.team_ir.length === 0) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center">
        <div className="text-stone-400 mb-3 flex justify-center"><Store size={48} strokeWidth={1.5} /></div>
        <div className="text-lg font-bold text-amber-900 mb-2">매장현황 DB가 필요합니다</div>
        <div className="text-sm text-stone-600">상단의 「② 매장현황DB」에 매장리스트 엑셀 파일을 업로드해주세요.</div>
        <div className="text-xs text-stone-500 mt-2">정확한 Incident Rate와 매장 형태별 분석을 제공합니다.</div>
      </div>
    );
  }

  if (!D.store_coverage || !D.store_kpi || !D.dept_ir) return <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center text-stone-500">매장 커버리지 데이터가 없습니다</div>;

  const cov = D.store_coverage;
  const skpi = D.store_kpi;
  const coverageRate = pct(cov.safe, cov.total);

  // 토글 상태 / 데이터 헬퍼
  const isPer100 = metric === "ir_per100";
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
  const teamGraded = (D.team_ir || []).map(t => ({ ...t, per_store: perStore(t) }));
  const teamIrChartData = isPer100
    ? teamGraded.filter(t => t.ir_per100 != null).sort((a, b) => b.ir_per100 - a.ir_per100).slice(0, 28)
    : teamGraded.slice().sort((a, b) => b.per_store - a.per_store).slice(0, 28);
  const yLabel = yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const findRate = (lbl) => sizeStats.find(s => s.size?.includes(lbl))?.rate ?? "—";
  const guibunDanRate  = D.guibun?.find(g => g.guibun === "단품관리")?.rate ?? null;
  const guibunGeumRate = D.guibun?.find(g => g.guibun === "금액관리")?.rate ?? null;
  return (
    <div className="space-y-3 sm:space-y-4">
      <EstimateBadge D={D} />


      <div ref={kpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card delay={0}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-500 font-medium uppercase tracking-wide">전체 영업 매장</span>
            <Store size={14} className="text-stone-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-stone-900">{cTotal.toLocaleString()}</span>
            <span className="text-sm text-stone-400">개</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">직영 {skpi.jikyoung} · 유통 {skpi.yutong} · 행사 {skpi.haengsa}</div>
        </Card>
        <Card delay={70}>
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-stone-300" />
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-500 font-medium uppercase tracking-wide">사고 무발생</span>
            <Circle size={14} className="text-stone-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-stone-900">{cSafe.toLocaleString()}</span>
            <span className="text-sm text-stone-400">개</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">전체 매장의 {coverageRate}%</div>
        </Card>
        <Card delay={140} className="!border-red-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-red-600 font-bold uppercase tracking-wide">사고 발생 매장</span>
            <AlertTriangle size={14} className="text-red-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-stone-900">{cInvolved.toLocaleString()}</span>
            <span className="text-sm text-stone-400">개</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">{pct(cov.involved, cov.total)}% · 집중관리 대상</div>
        </Card>
        <Card delay={210}>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-600 font-bold uppercase tracking-wide">평균 매장 면적</span>
            <Ruler size={14} className="text-stone-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl font-bold tabular-nums text-stone-900">{Number.isInteger(cArea / 10) ? (cArea / 10) : (cArea / 10).toFixed(1)}</span>
            <span className="text-sm text-stone-400">평</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">{skpi.sido_count}개 시·도 분포</div>
        </Card>
      </div>

      {/* 두 지표 의미 차이 안내 카드 (근로자DB 업로드 시에만) */}
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
            <tbody>{[...D.dept_ir].sort((a, b) => perStore(b) - perStore(a)).map((d, i) => {
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
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="매장 형태별" titleIcon={Tag} sub="직영/유통/행사 패턴 차이">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <ComposedChart data={formStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="form" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Bar yAxisId="l" dataKey="incidents" fill={OR} radius={[5,5,0,0]} name="사고" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}} name="IR%" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1 text-xs">
            {formStats.map(f => (
              <div key={f.form} className="flex justify-between">
                <span className="text-stone-600">{f.form}</span>
                <span className="font-bold tabular-nums">IR {f.rate}%</span>
              </div>
            ))}
          </div>
        </Card>
        
        <Card title="매장 규모별" titleIcon={Ruler} sub="평수가 클수록 위험 증가">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <ComposedChart data={sizeStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="size" tick={{ fontSize: 9, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Bar yAxisId="l" dataKey="incidents" fill={BL} radius={[5,5,0,0]} name="사고" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}} name="IR%" />
            </ComposedChart>
          </ResponsiveContainer>
          {sizeStats.some(s => s.avg_workers != null) && (
            <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-1.5">
              {sizeStats.map(s => (
                <div key={s.size} className="rounded bg-stone-50 border border-stone-200 px-2 py-1.5 text-center min-h-[44px] flex flex-col justify-center">
                  <div className="text-[10px] text-stone-500 font-medium truncate">{s.size}</div>
                  <div className="text-base font-bold tabular-nums text-stone-900 mt-0.5">{s.avg_workers != null ? s.avg_workers : "—"}</div>
                  <div className="text-[10px] text-stone-400">평균인원</div>
                </div>
              ))}
            </div>
          )}
          <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
            <b>규모별 IR 관찰</b>: 특대(400평+) <b>{findRate("특대")}%</b> · 소형 <b>{findRate("소형")}%</b>. <span className="text-stone-500">큰 매장은 인력·고객·재고가 모두 많아 노출량 자체가 큼. 노출 단위(시간·인원) 정규화 후 비교 필요.</span>
          </div>
        </Card>
        
        <Card title="경과연수별" titleIcon={Calendar} sub="오픈 후 경과 기간과 위험도">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <ComposedChart data={ageStats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="age" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Bar yAxisId="l" dataKey="incidents" fill={BL} radius={[5,5,0,0]} name="사고" animationDuration={700} activeBar={{ opacity: 0.75 }} />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} activeDot={{r:6}} name="IR%" />
            </ComposedChart>
          </ResponsiveContainer>
        </Card>
      </div>
      
      <Card title="매장 커버리지 (Pareto)" titleIcon={CheckCircle2}>
        <div className="flex flex-col lg:flex-row gap-4">
          <div className="w-full lg:w-[280px] shrink-0 flex items-center justify-center h-[200px]">
            <ProgressRing
              value={parseFloat(coverageRate) || 0}
              max={100}
              size={164}
              stroke={16}
              color={GN}
              track="#FCE0E3"
              label={`${coverageRate}%`}
              sublabel="무사고 매장"
            />
          </div>
          <div className="min-w-0 w-full space-y-2">
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
              <div className="text-xs font-bold text-stone-700 mb-1">사고 무발생 매장: {cov.safe}개 ({coverageRate}%)</div>
              <div className="text-xs text-stone-600">전체 {cov.total}개 중 {coverageRate}%는 {yLabel} 사고 미기록. <span className="text-stone-500">※ 사고 미기록은 매장 규모·고객 수·인력 운영 등 복수 변수 결과. 안전관리 우수 매장 식별은 매장 특성 통제 후 노출 단위 비교 필요.</span></div>
            </div>
            <div className="p-3 rounded-lg bg-[#FEF2F3] border border-[#FCE0E3]">
              <div className="text-xs font-bold text-red-700 mb-1">Pareto 법칙 확인: {cov.involved}개 ({pct(cov.involved, cov.total)}%)</div>
              <div className="text-xs text-stone-600">전체 매장의 {pct(cov.involved, cov.total)}%에서 모든 사고 발생. <span className="text-stone-500">사고 발생 매장에 자원 집중 시 효율적 가능성 — 단, 무사고 매장이 단순히 규모 작아서일 수도 있어 매장 특성 분석 병행 권장.</span></div>
            </div>
            {cov.unmatched > 0 && (
              <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs">
                매장리스트에서 찾지 못한 매장명: {cov.unmatched}개 — 표기 불일치 가능성
              </div>
            )}
          </div>
        </div>
      </Card>

      {(D.guibun || D.warehouse) && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {D.guibun && (
            <Card title="단품관리 vs 금액관리" titleIcon={Tag} sub="관리 방식별 사고 분포 비교">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={200} debounce={50}>
                  <ComposedChart data={D.guibun}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                    <XAxis dataKey="guibun" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                    <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                    <Tooltip content={<TT />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                    <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
                    <Bar yAxisId="l" dataKey="incidents" fill={RD} radius={[5,5,0,0]} name="사고" />
                    <Line yAxisId="r" type="monotone" dataKey="rate" stroke={NV} strokeWidth={2.5} dot={{r:5}} name="IR%" />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="space-y-2 text-sm">
                  {D.guibun.map(g => (
                    <div key={g.guibun} className={`p-3 rounded-lg border ${g.rate > 30 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                      <div className="font-bold">{g.guibun}</div>
                      <div className="text-xs text-stone-600 mt-1">매장 {g.stores}개 · 사고 {g.incidents}건</div>
                      <div className="text-2xl font-extrabold tabular-nums mt-1" style={{color: g.rate > 30 ? RD : GN}}>IR {g.rate}%</div>
                    </div>
                  ))}
                  {D.guibun.length >= 2 && (
                  <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
                    <b>단품관리 IR {guibunDanRate ?? "—"}% vs 금액관리 IR {guibunGeumRate ?? "—"}%</b> ({(guibunDanRate!=null && guibunGeumRate!=null && guibunGeumRate>0) ? (guibunDanRate/guibunGeumRate).toFixed(1) : "—"}배 차이). <span className="text-stone-500">※ 단품관리는 일반적으로 큰 매장에 적용. 매장 규모(평수·인력)가 교란 변수일 가능성 높음. 매장 규모 통제 후 비교 권장.</span>
                  </div>
                  )}
                </div>
              </div>
            </Card>
          )}
          {D.warehouse && (
            <Card title="창고 면적 비율별 분포" titleIcon={Package} sub="매장 면적 중 창고 비중 구간별 — 매장수·사고건수·매장당 사고율(IR%) · 인과 분석 아님">
              <ResponsiveContainer width="100%" height={200} debounce={50}>
                <ComposedChart data={D.warehouse}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                  <Tooltip content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload;
                    return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs">
                      <div className="font-bold">창고 비율 {label}</div>
                      <div>매장수 {p.stores}개</div>
                      <div>사고 {p.incidents}건</div>
                      <div className="font-bold mt-0.5" style={{ color: RD }}>매장당 사고율(IR) {p.rate}%</div>
                    </div>;
                  }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
                  <Bar yAxisId="l" dataKey="incidents" fill={OR} radius={[5,5,0,0]} name="사고" />
                  <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:5}} name="IR%" />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-sm text-stone-700">
                <b>창고 비율별 관찰</b>: {(() => { const w = D.warehouse || []; if (!w.length) return "구간별 데이터 부족."; const byInc = [...w].sort((a, b) => (b.incidents || 0) - (a.incidents || 0))[0]; const byRate = [...w].sort((a, b) => (b.rate || 0) - (a.rate || 0))[0]; return `${byInc.bucket} 구간 절대 건수 최다(${byInc.incidents}건, 매장 ${byInc.stores}개). ${byRate.bucket} 구간은 IR ${byRate.rate}%로 가장 높음(매장 ${byRate.stores}개).`; })()} <span className="text-stone-500">※ 매장 수 자체가 많은 구간일수록 절대 건수가 큼(base rate). 위험도는 IR(rate) 기준 비교가 적절. 인과 단정 전 매장 규모·취급 품목 통제 필요.</span>
              </div>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}


// ========== NEW TAB: 재발 재해자 워치리스트 ==========
export default StoreAnalysis;

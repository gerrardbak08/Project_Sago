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

function StoreAnalysis({ D, yearFilter, setYearFilter }) {
  const [metric, setMetric] = useState("coverage_rate"); // 'coverage_rate' | 'ir_per100'
  const hasWorker = D.team_ir && D.team_ir.some(t => t.workers != null);

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

  const cov = D.store_coverage;
  const skpi = D.store_kpi;
  const coverageRate = pct(cov.safe, cov.total);

  // 토글 상태 / 데이터 헬퍼
  const isPer100 = metric === "ir_per100";
  const showYearBanner = hasWorker && yearFilter !== "2026";
  // per-100 차트용 데이터: workers null 매장 제외, ir_per100 기준 정렬
  const teamIrChartData = isPer100
    ? D.team_ir.filter(t => t.ir_per100 != null).sort((a,b) => b.ir_per100 - a.ir_per100).slice(0, 28)
    : D.team_ir.slice(0, 28);
  const reliColor = (r) => r === "high" ? null : r === "low" ? "#A8A29E" : r === "unstable" ? "#D6D3D1" : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <EstimateBadge D={D} />

      {/* yearFilter 2026 추천 배너 (근로자DB 업로드 시에만) */}
      {showYearBanner && (
        <div className="rounded-lg p-3 flex items-start gap-3 bg-amber-50 border border-amber-300">
          <AlertTriangle size={18} className="text-amber-700 flex-shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0 text-sm">
            <div className="font-bold text-amber-900">분자/분모 시점 불일치 안내</div>
            <div className="text-xs text-stone-700 mt-0.5">사고DB는 전체 기간(2024~2026) 누적, 근로자DB는 {D.worker_kpis?.ref_date} 재직자 스냅샷입니다. <b>2026년 사고만 분자</b>로 사용하시면 분모 시점과 일치하여 IR이 더 정확해집니다.</div>
          </div>
          <button onClick={() => setYearFilter && setYearFilter("2026")} className="px-3 py-1.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold flex-shrink-0 cursor-pointer whitespace-nowrap">2026년으로 보기</button>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-500 font-medium uppercase tracking-wide">전체 영업 매장</span>
            <Store size={14} className="text-stone-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{fmt(skpi.total)}</span>
            <span className="text-base font-medium text-stone-400">개</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">직영 {skpi.jikyoung} · 유통 {skpi.yutong} · 행사 {skpi.haengsa}</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200 relative overflow-hidden">
          <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-stone-300"></div>
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-stone-500 font-medium uppercase tracking-wide">사고 무발생</span>
            <Circle size={14} className="text-stone-400" />
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{fmt(cov.safe)}</span>
            <span className="text-base font-medium text-stone-400">개</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">전체 매장의 {coverageRate}%</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-red-200">
          <div className="text-xs text-red-600 font-bold">사고 발생 매장</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{fmt(cov.involved)}<span className="text-sm text-stone-500 font-normal ml-1">개</span></div>
          <div className="text-xs text-stone-500 mt-1">{pct(cov.involved, cov.total)}% · 집중관리 대상</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">평균 매장 면적</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{skpi.avg_area}<span className="text-sm text-stone-500 font-normal ml-1">평</span></div>
          <div className="text-xs text-stone-500 mt-1">{skpi.sido_count}개 시·도 분포</div>
        </div>
      </div>

      {/* 두 지표 의미 차이 안내 카드 (근로자DB 업로드 시에만) */}
      {hasWorker && (
        <Card title="두 가지 안전 지표 — 무엇이 다른가" titleIcon={Info} sub="사고 발생 분포(매장률) vs 사고 강도(인원 100명당)">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-3 rounded-lg bg-violet-50 border border-violet-200">
              <div className="text-xs font-bold text-violet-800 mb-1">📊 사고발생 매장률 (coverage_rate)</div>
              <div className="text-xs text-stone-700 leading-relaxed">팀 전체 매장 중 사고가 발생한 매장의 비율. <b>"얼마나 많은 매장에서 사고가 났는가"</b> — 사고 분포의 폭을 봄.</div>
              <div className="font-mono text-[11px] text-stone-600 mt-2 p-1.5 bg-white rounded">사고발생 매장수 ÷ 전체 매장수 × 100</div>
            </div>
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200">
              <div className="text-xs font-bold text-rose-800 mb-1">👥 100명당 IR (ir_per100)</div>
              <div className="text-xs text-stone-700 leading-relaxed">재직 인원 100명당 사고건수. <b>"한 명이 일할 때 사고를 만날 확률"</b> — 인원 노출량 보정한 사고 강도.</div>
              <div className="font-mono text-[11px] text-stone-600 mt-2 p-1.5 bg-white rounded">사고건수 ÷ 재직자수 × 100</div>
            </div>
          </div>
          <div className="mt-3 p-2.5 rounded-md bg-stone-50 border border-stone-200 text-[11px] text-stone-600 leading-relaxed">
            <b className="text-stone-800">신뢰도 안내</b> — 분모 인원이 적을수록 우연 변동의 영향이 큽니다.
            <span className="ml-1.5 px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 font-semibold">high (≥20명)</span>
            <span className="ml-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-semibold">low (≥5명)</span>
            <span className="ml-1 px-1.5 py-0.5 rounded bg-stone-200 text-stone-700 font-semibold">⚠ unstable (&lt;5명)</span>
            <span className="ml-1.5">— unstable 매장은 참고용으로만 활용 권장.</span>
          </div>
        </Card>
      )}

      <Card title="팀별 안전 지표" titleIcon={Target} sub={isPer100 ? "100명당 IR — 인원 노출량 보정한 사고 강도" : "사고발생 매장률 — 매장 단위 사고 분포"} right={<ExportBtn rows={D.team_ir} filename="팀별_IR.csv" />}>
        {/* 지표 토글 */}
        {hasWorker && (
          <div className="mb-3 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-stone-500 font-semibold">표시 지표:</span>
            <button onClick={() => setMetric("coverage_rate")} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${!isPer100 ? "bg-violet-600 border-violet-600 text-white" : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50"}`}>📊 사고발생 매장률</button>
            <button onClick={() => setMetric("ir_per100")} className={`px-3 py-1.5 rounded-full text-xs font-bold border transition cursor-pointer ${isPer100 ? "bg-rose-600 border-rose-600 text-white" : "bg-white border-stone-300 text-stone-600 hover:bg-stone-50"}`}>👥 100명당 IR</button>
          </div>
        )}
        <ResponsiveContainer width="100%" height={420} debounce={50}>
          <BarChart data={teamIrChartData} layout="vertical" margin={{ left: 30 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => isPer100 ? v.toFixed(1) : `${v}%`} />
            <YAxis type="category" dataKey="team" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return (
                <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs">
                  <div className="font-bold mb-1">{p.team} <span className="text-stone-500 font-normal">({p.dept})</span></div>
                  <div>매장 {p.stores}개 · 사고 {p.incidents}건{p.workers != null ? ` · 인원 ${p.workers.toLocaleString()}명` : ""}</div>
                  <div className="font-bold mt-1" style={{color: "#7C3AED"}}>📊 사고발생 매장률: {p.coverage_rate ?? p.rate}%</div>
                  {p.ir_per100 != null && (
                    <div className="font-bold" style={{color: "#E11D48"}}>👥 100명당 IR: {p.ir_per100.toFixed(2)}건
                      {p.ir_reliability && <span className="ml-1.5 text-[10px] font-semibold" style={{color: p.ir_reliability==="high"?"#15803D":p.ir_reliability==="low"?"#B45309":"#78716C"}}>[{p.ir_reliability}]</span>}
                    </div>
                  )}
                </div>
              );
            }} />
            {!isPer100 && <ReferenceLine x={40} stroke="#F59E0B" strokeDasharray="3 3" label={{ value: "평균 40%", fill: "#B45309", fontSize: 10 }} />}
            <Bar dataKey={isPer100 ? "ir_per100" : "rate"} radius={[0,6,6,0]} name={isPer100 ? "100명당 IR" : "매장률 %"}>
              {teamIrChartData.map((e, i) => {
                let baseColor;
                if (isPer100) {
                  const v = e.ir_per100;
                  baseColor = v > 20 ? RD : v > 10 ? OR : v > 5 ? AM : GN;
                  // unstable 매장은 회색 처리
                  const greyOut = reliColor(e.ir_reliability);
                  if (greyOut) baseColor = greyOut;
                } else {
                  baseColor = e.rate > 50 ? RD : e.rate > 30 ? OR : e.rate > 15 ? AM : GN;
                }
                return <Cell key={i} fill={baseColor} />;
              })}
              <LabelList dataKey={isPer100 ? "ir_per100" : "rate"} position="right" style={{ fontSize: 10, fill: NV, fontWeight: 700 }} formatter={v => isPer100 ? v.toFixed(2) : `${v}%`} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        {!isPer100 ? (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FFE4E4",color:"#9B1C1C"}}><b>50%+</b> 고위험 — 즉시 개입</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FDECD3",color:"#92400E"}}><b>30-50%</b> 주의 관리</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FEF9C3",color:"#854D0E"}}><b>15-30%</b> 일반 관리</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#F1F5F9",color:"#475569"}}><b>&lt;15%</b> 사고율 낮음 <span style={{color:"#94A3B8"}}>(노출량 보정 후 해석)</span></div>
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FFE4E4",color:"#9B1C1C"}}><b>20+</b> 100명당 — 매우 위험</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FDECD3",color:"#92400E"}}><b>10-20</b> 주의</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#FEF9C3",color:"#854D0E"}}><b>5-10</b> 일반</div>
            <div className="p-2 rounded-lg text-xs font-medium" style={{background:"#F1F5F9",color:"#475569"}}><b>&lt;5</b> 낮음 / 회색=⚠️ unstable (&lt;5인 매장)</div>
          </div>
        )}
      </Card>
      
      <Card title="부서별 안전 지표" titleIcon={Building2} sub={hasWorker ? "사고발생 매장률 · 100명당 IR · 인원수 — 영업부문 부서 단위" : "부서별 실제 매장 수 기준 — 경남영업부가 진짜 안전한 곳"} right={<ExportBtn rows={D.dept_ir} filename="부서별_IR.csv" />}>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[680px] text-sm">
            <thead>
              <tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
                <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
                <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
                <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장 수</th>
                <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">사고 수</th>
                <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장률</th>
                {hasWorker && <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">인원수</th>}
                {hasWorker && <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">100명당 IR</th>}
                <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">평균 평수</th>
                <th className="text-left py-2 px-3 font-semibold whitespace-nowrap" style={{width: 180}}>등급</th>
              </tr>
            </thead>
            <tbody>{D.dept_ir.map((d, i) => (
              <tr key={d.dept} className="border-b border-stone-100 hover:bg-stone-50/60">
                <td className="py-2 px-3 text-xs font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                <td className="py-2 px-3 font-semibold whitespace-nowrap">{d.dept}</td>
                <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${d.bum === "수도권" ? "bg-indigo-50 text-indigo-700 border border-stone-200" : "bg-stone-100 text-stone-700"}`}>{d.bum}</span></td>
                <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.stores}</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{d.incidents}</td>
                <td className="py-2 px-3 text-right tabular-nums font-extrabold whitespace-nowrap" style={{color: (d.coverage_rate ?? d.rate) > 50 ? RD : (d.coverage_rate ?? d.rate) > 30 ? OR : GN}}>{d.coverage_rate ?? d.rate}%</td>
                {hasWorker && <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.workers != null ? d.workers.toLocaleString() : "—"}</td>}
                {hasWorker && (
                  <td className="py-2 px-3 text-right tabular-nums font-extrabold whitespace-nowrap" style={{color: d.ir_per100 == null ? "#A8A29E" : d.ir_per100 > 20 ? RD : d.ir_per100 > 10 ? OR : GN}}>
                    {d.ir_per100 != null ? d.ir_per100.toFixed(2) : "—"}
                    {d.ir_reliability && d.ir_reliability !== "high" && <span className="ml-1 text-[10px] font-semibold align-middle" title={d.ir_reliability}>{d.ir_reliability === "unstable" ? "⚠" : "○"}</span>}
                  </td>
                )}
                <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{d.avg_area}평</td>
                <td className="py-2 px-3 whitespace-nowrap">
                  <div className="h-2 bg-stone-100 rounded-full overflow-hidden" style={{width: 140}}>
                    <div className="h-full rounded-full" style={{width: `${Math.min((d.coverage_rate ?? d.rate), 100)}%`, background: (d.coverage_rate ?? d.rate) > 50 ? RD : (d.coverage_rate ?? d.rate) > 30 ? OR : GN}} />
                  </div>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="매장 형태별" titleIcon={Tag} sub="직영/유통/행사 패턴 차이">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={D.form_stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="form" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
              <Bar yAxisId="l" dataKey="incidents" fill={OR} radius={[5,5,0,0]} name="사고" />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} name="IR%" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 space-y-1 text-xs">
            {D.form_stats.map(f => (
              <div key={f.form} className="flex justify-between">
                <span className="text-stone-600">{f.form}</span>
                <span className="font-bold tabular-nums">IR {f.rate}%</span>
              </div>
            ))}
          </div>
        </Card>
        
        <Card title="매장 규모별" titleIcon={Ruler} sub="평수가 클수록 위험 증가">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={D.size_stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="size" tick={{ fontSize: 9, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
              <Bar yAxisId="l" dataKey="incidents" fill={BL} radius={[5,5,0,0]} name="사고" />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} name="IR%" />
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-700">
            <b>규모별 IR 관찰</b>: 특대(400평+) <b>{D.size_stats[3]?.rate}%</b> · 소형 <b>{D.size_stats[0]?.rate}%</b>. <span className="text-stone-500">큰 매장은 인력·고객·재고가 모두 많아 노출량 자체가 큼. 노출 단위(시간·인원) 정규화 후 비교 필요.</span>
          </div>
        </Card>
        
        <Card title="경과연수별" titleIcon={Calendar} sub="오픈 후 경과 기간과 위험도">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={D.age_stats}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="age" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
              <Bar yAxisId="l" dataKey="incidents" fill={PR} radius={[5,5,0,0]} name="사고" />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:4}} name="IR%" />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      
      <Card title="매장 커버리지 (Pareto)" titleIcon={CheckCircle2}>
        <div className="flex items-center gap-6 flex-wrap">
          <ResponsiveContainer width={280} height={200} debounce={50}>
            <PieChart>
              <Pie data={[{name:"사고발생", value: cov.involved}, {name:"무발생(안전)", value: cov.safe}]} dataKey="value" nameKey="name" cx="50%" cy="50%" startAngle={90} endAngle={-270} innerRadius={45} outerRadius={80} paddingAngle={2}>
                <Cell fill={RD} />
                <Cell fill={GN} />
              </Pie>
              <Tooltip content={<TT />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 min-w-[300px] space-y-2">
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
              <div className="text-xs font-bold text-stone-700 mb-1">사고 무발생 매장: {cov.safe}개 ({coverageRate}%)</div>
              <div className="text-xs text-stone-600">전체 {cov.total}개 중 {coverageRate}%는 2024년 이후 사고 미기록. <span className="text-stone-500">※ 사고 미기록은 매장 규모·고객 수·인력 운영 등 복수 변수 결과. 안전관리 우수 매장 식별은 매장 특성 통제 후 노출 단위 비교 필요.</span></div>
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
    </div>
  );
}


// ========== NEW TAB: 재발 재해자 워치리스트 ==========
export default StoreAnalysis;

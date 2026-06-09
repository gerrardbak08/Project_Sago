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

function CostRisk({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const k = D.kpis;
  const costByType = Object.entries(D.costType || {}).map(([name, v]) => ({ name, ...v })).sort((a,b) => b.total - a.total);
  const costByDept = Object.entries(D.costDept || {}).map(([name, v]) => ({ name, ...v })).sort((a,b) => b.total - a.total);
  
  // Top Risk Matrix data - scatter plot
  const riskData = D.risk.filter(r => r.sev > 0).map(r => ({
    name: r.type, x: r.freq, y: r.sev, z: r.cost_total,
  }));
  
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>
      <EstimateBadge D={D} />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3">
        <div className="rounded-lg p-5 bg-white border border-amber-100 relative overflow-hidden lg:col-span-2">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">공상비용 총액</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{fmt(k.cost_total)}</span><span className="text-base font-medium text-stone-400">원</span></div>
          <div className="text-xs opacity-80 mt-1">{k.cost_count}건 기록 · 평균 {fmt(k.cost_avg)}원/건</div>
          <div className="text-xs opacity-70 mt-2">전체 538건 중 16건만 비용 기록 — 집계 확장 필요</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-500 font-medium">최대 비용 건</div>
          <div className="text-2xl font-extrabold tabular-nums mt-2">{costByType[0] ? fmt(costByType[0].total / costByType[0].count * costByType[0].count) : "-"}<span className="text-sm font-normal text-stone-500 ml-1">원</span></div>
          <div className="text-xs text-stone-500 mt-1">{costByType[0]?.name || "-"}</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-500 font-medium">비용 적용률</div>
          <div className="text-2xl font-extrabold tabular-nums mt-2">{pct(k.cost_count, k.total)}%</div>
          <div className="text-xs text-stone-500 mt-1">{k.cost_count} / {k.total}건</div>
        </div>
      </div>
      
      {/* Top Risk Matrix - Frequency x Severity */}
      <Card title="Top Risk Matrix" titleIcon={Target} sub="빈도(Frequency) × 심각도(Severity) — 2×2 리스크 매트릭스">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <ResponsiveContainer width="100%" height={360} debounce={50}>
              <ScatterChart margin={{ top: 20, right: 20, bottom: 40, left: 40 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" />
                <XAxis type="number" dataKey="x" name="빈도" tick={{ fontSize: 10, fill: "#57534E" }} label={{ value: "발생 빈도 (건수)", position: "bottom", offset: 10, fill: "#57534E", fontSize: 11 }} />
                <YAxis type="number" dataKey="y" name="평균 비용" tick={{ fontSize: 10, fill: "#57534E" }} label={{ value: "평균 비용 (원)", angle: -90, position: "left", fill: "#57534E", fontSize: 11 }} tickFormatter={v => `${(v/10000).toFixed(0)}만`} />
                <ZAxis type="number" dataKey="z" range={[100, 800]} />
                <Tooltip content={<TT />} cursor={{ strokeDasharray: "3 3" }} />
                <ReferenceLine x={80} stroke="#A8A29E" strokeDasharray="5 5" label={{ value: "빈도중앙", fill: "#78716C", fontSize: 10 }} />
                <ReferenceLine y={150000} stroke="#A8A29E" strokeDasharray="5 5" label={{ value: "비용중앙", fill: "#78716C", fontSize: 10 }} />
                <Scatter data={riskData} fill={RD}>
                  {riskData.map((e, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                  <LabelList dataKey="name" position="top" style={{ fontSize: 11, fill: "#1C1917", fontWeight: 700 }} />
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-2 text-sm">
            <div className="p-3 rounded-lg bg-[#FEF2F3] border border-[#FCE0E3]"><div className="text-xs font-bold text-red-700"> 고빈도·고비용</div><div className="text-xs mt-1">매트릭스 우상단 — 즉각 조치 필요</div></div>
            <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep"><div className="text-xs font-bold text-amber-700"> 고빈도·저비용</div><div className="text-xs mt-1">우하단 — 반복 예방 캠페인</div></div>
            <div className="p-3 rounded-lg bg-orange-50/50 border border-orange-100"><div className="text-xs font-bold text-orange-700"> 저빈도·고비용</div><div className="text-xs mt-1">좌상단 — 긴급 대응 매뉴얼 강화</div></div>
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs font-bold text-stone-700"> 저빈도·저비용</div><div className="text-xs mt-1">좌하단 — 모니터링 수준</div></div>
            <div className="p-2 rounded bg-blue-50 text-xs text-blue-700">버블 크기 = 총 비용</div>
          </div>
        </div>
      </Card>
      
      <Card title="재해유형별 비용" titleIcon={Banknote} sub="비용 기록된 건 중 재해유형별 총액/평균" right={<ExportBtn rows={costByType} filename="재해유형별_비용.csv" />}>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">재해유형</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">기록 건수</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">총 비용</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">평균</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap" style={{width: 200}}>점유율</th>
            </tr></thead>
            <tbody>{costByType.map((c, i) => {
              const ratio = c.total / k.cost_total;
              return (
                <tr key={c.name} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className="py-2 px-3 font-semibold whitespace-nowrap">{c.name}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{c.count}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{fmt(c.total)}원</td>
                  <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{fmt(c.avg)}원</td>
                  <td className="py-2 px-3 whitespace-nowrap"><div className="h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full rounded-full bg-amber-500" style={{ width: `${ratio*100}%` }} /></div><div className="text-xs text-stone-500 mt-0.5">{pct(c.total, k.cost_total)}%</div></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

      {/* 부서별 비용 차트 */}
      <Card title="부서별 공상비용" titleIcon={Building2} sub="비용 기록된 건의 부서별 집계 — 집중 부서 식별" right={costByDept.length > 0 ? <ExportBtn rows={costByDept} filename="부서별_비용.csv" /> : null}>
        {costByDept.length === 0 ? (
          <div className="rounded-xl border border-dashed border-amber-200 bg-amber-50 p-4 text-center">
            <p className="text-sm font-medium text-amber-700">부서별 비용 데이터 집계 중</p>
            <p className="text-xs text-amber-500 mt-1">Excel 업로드 시 비용 항목 포함 필요</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={200} debounce={50}>
              <BarChart data={costByDept} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false}
                  tickFormatter={v => `${(v/10000).toFixed(0)}만`} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={120} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const d = payload[0].payload;
                  return (
                    <div className="bg-white border border-stone-200 rounded-lg shadow px-3 py-2 text-xs">
                      <div className="font-bold">{d.name}</div>
                      <div>총액 <b>{fmt(d.total)}원</b> · {d.count}건</div>
                      <div>평균 {fmt(Math.round(d.total/Math.max(d.count,1)))}원/건</div>
                    </div>
                  );
                }} />
                <Bar dataKey="total" radius={[0,5,5,0]} name="총 비용">
                  {costByDept.map((_, i) => <Cell key={i} fill={i === 0 ? RD : i < 3 ? OR : AM} />)}
                  <LabelList dataKey="total" position="right"
                    style={{ fontSize: 10, fill: NV, fontWeight: 700 }}
                    formatter={v => `${(v/10000).toFixed(0)}만`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
              {costByDept.map((d, i) => (
                <div key={d.name} className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-stone-50 border border-stone-100">
                  <span className="text-[10px] font-bold text-stone-400 w-4">{i+1}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-xs font-semibold text-stone-700 truncate">{d.name}</div>
                    <div className="text-[10px] text-stone-400">{d.count}건 기록</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-xs font-bold tabular-nums" style={{color: i===0 ? RD : NV}}>{fmt(d.total)}원</div>
                    <div className="text-[10px] text-stone-400">평균 {fmt(Math.round(d.total/Math.max(d.count,1)))}원</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 비용 기록률 개선 안내 */}
      <div className="rounded-lg p-4 flex items-start gap-3" style={{background:"#FFF7ED", border:"1px solid #FED7AA"}}>
        <AlertCircle size={18} style={{color:"#C2410C", flexShrink:0, marginTop:1}} />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-bold text-amber-900 mb-1">비용 기록률 현황 — {pct(k.cost_count, k.total)}% ({k.cost_count}/{k.total}건)</div>
          <div className="text-xs text-stone-700 leading-relaxed break-keep">
            전체 사고 {k.total}건 중 공상비용이 기록된 건은 <b>{k.cost_count}건</b>뿐입니다.
            비용 미기록 사고의 실제 비용은 집계에서 누락되어 부서별 비교의 정확도가 낮습니다.
          </div>
          <div className="text-xs text-amber-800 mt-1.5 font-medium">→ 사고 보고 시 공상비용(치료비·일당 등) 필수 입력 정착이 필요합니다.</div>
        </div>
      </div>
      

    </div>
  );
}


// ========== TAB 7: Legal & Reporting (중대재해처벌법 대응) ==========
export default CostRisk;

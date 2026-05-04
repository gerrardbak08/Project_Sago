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

function ParjangDashboard({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  if (!D.parjang) return null;
  const p = D.parjang;

  // 부문별 고위험 파트장 집계
  const bumDist = p.top.reduce((acc, pj) => {
    acc[pj.bum] = (acc[pj.bum] || 0) + 1;
    return acc;
  }, {});
  const bumPieData = Object.entries(bumDist).map(([name, value]) => ({ name, value }));

  // 재해유형 분포
  const typeDist = p.top.reduce((acc, pj) => {
    if (pj.top_type) acc[pj.top_type] = (acc[pj.top_type] || 0) + 1;
    return acc;
  }, {});
  const typeData = Object.entries(typeDist).sort((a,b)=>b[1]-a[1]).map(([name,value])=>({name,value}));

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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg p-5 bg-white border border-indigo-100 relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">전체 파트장</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{p.total}</span><span className="text-base font-medium text-stone-400">명</span></div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-[#FCE0E3] relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">3건+ 고위험 파트장</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{p.active}</span><span className="text-base font-medium text-stone-400">명</span></div>
          <div className="text-xs opacity-80 mt-1">{pct(p.active, p.total)}% · 중점관리</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">사고 최다</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{p.top[0]?.incidents || 0}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
          <div className="text-xs text-stone-500 mt-1">{p.top[0]?.parjang}</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">매장당 사고율 (평균)</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{(p.top.reduce((s,x) => s + x.incidents/Math.max(x.stores,1), 0) / p.top.length).toFixed(2)}</div>
          <div className="text-xs text-stone-500 mt-1">파트장/매장당</div>
        </div>
      </div>

      {/* 차트 2개: 사고건수 TOP 바차트 + 재해유형 파이 */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="파트장별 사고 건수 TOP" titleIcon={ShieldCheck} sub="고위험 파트장 시각화 — 막대 높이 = 관할 매장 사고 집중도" className="lg:col-span-2">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={[...p.top].slice(0,12)} layout="vertical" margin={{ left: 60 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="parjang" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={60} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const d = payload[0].payload;
                return (
                  <div className="bg-white border border-stone-200 rounded-lg shadow px-3 py-2 text-xs">
                    <div className="font-bold">{d.parjang}</div>
                    <div className="text-stone-500">{d.dept} · {d.bum}</div>
                    <div>사고 <b>{d.incidents}건</b> · 관할 <b>{d.stores}매장</b></div>
                    <div>매장당 <b style={{color: RD}}>{(d.incidents/Math.max(d.stores,1)).toFixed(2)}건</b> · 주유형 {d.top_type}</div>
                  </div>
                );
              }} />
              <Bar dataKey="incidents" radius={[0,5,5,0]} name="사고 건수">
                {[...p.top].slice(0,12).map((pj, i) => {
                  const r = pj.incidents / Math.max(pj.stores, 1);
                  return <Cell key={i} fill={r >= 2 ? RD : r >= 1.5 ? OR : r >= 1 ? AM : GN} />;
                })}
                <LabelList dataKey="incidents" position="right" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} formatter={v => `${v}건`} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="mt-2 flex gap-3 flex-wrap text-[10px]">
            {[{c:RD,l:"2건+ (즉시 대응)"},{c:OR,l:"1.5~2건"},{c:AM,l:"1~1.5건"},{c:GN,l:"1건 미만"}].map(({c,l})=>(
              <span key={l} className="flex items-center gap-1">
                <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{background:c}}/>
                <span className="text-stone-500">{l}</span>
              </span>
            ))}
            <span className="text-stone-400 ml-1">※ 색상 = 매장당 사고율</span>
          </div>
        </Card>

        <Card title="부문 · 유형 분포" titleIcon={Target} sub="고위험 파트장 부문별 집중도 + 주 재해유형">
          {/* 부문별 (수도권 vs 지방) */}
          <div className="mb-4">
            <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-2">부문별 고위험 파트장</div>
            <div className="flex gap-2">
              {bumPieData.map((b, i) => (
                <div key={b.name} className="flex-1 rounded-lg p-3 text-center border border-stone-100 bg-stone-50">
                  <div className="text-xl font-extrabold tabular-nums" style={{color: i===0 ? BL : OR}}>{b.value}명</div>
                  <div className="text-xs text-stone-500 mt-0.5">{b.name}</div>
                  <div className="text-[10px] text-stone-400">{pct(b.value, p.active)}%</div>
                </div>
              ))}
            </div>
          </div>
          {/* 재해유형 분포 */}
          <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-2">주 재해유형</div>
          <div className="space-y-1">
            {typeData.map((t, i) => (
              <div key={t.name} className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{background: PAL[i%PAL.length]}}/>
                <span className="text-xs text-stone-700 flex-1">{t.name}</span>
                <div className="flex items-center gap-1.5">
                  <div className="h-1.5 rounded-full" style={{width: `${Math.round(t.value/typeData[0].value*80)}px`, background: PAL[i%PAL.length], minWidth:4}}/>
                  <span className="text-xs font-bold tabular-nums text-stone-800 w-6 text-right">{t.value}</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
      
      <Card title="사고 다발 파트장 랭킹 (3건 이상)" titleIcon={ShieldCheck} sub="관할 매장 수 대비 사고빈도 — 개별 관리 역량 평가 지표" right={<ExportBtn rows={p.top} filename="파트장별_사고.csv" />}>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">파트장</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">사고</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">관할 매장</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장당</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">주 재해유형</th>
            </tr></thead>
            <tbody>{p.top.map((pj, i) => {
              const perStore = pj.incidents / Math.max(pj.stores, 1);
              const hotColor = perStore >= 2 ? "bg-red-500" : perStore >= 1.5 ? "bg-orange-500" : "bg-amber-500";
              return (
                <tr key={pj.parjang + i} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className="py-2 px-3 text-xs font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap"><span className={`inline-block w-2 h-2 rounded-full mr-2 ${hotColor}`}></span>{pj.parjang}</td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{pj.dept}</td>
                  <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${pj.bum === "수도권" ? "bg-indigo-50 text-indigo-700 border border-stone-200" : "bg-stone-100 text-stone-700"}`}>{pj.bum}</span></td>
                  <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{pj.incidents}</td>
                  <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{pj.stores}</td>
                  <td className="py-2 px-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{color: perStore >= 2 ? RD : perStore >= 1.5 ? OR : NV}}>{perStore.toFixed(2)}</td>
                  <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{pj.top_type}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      
      <Card title="파트장 관리 활용 방안" titleIcon={Lightbulb}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-red-700 mb-1"> 매장당 2건+ 파트장</div><div className="text-sm">즉시 면담 → 관리 부담·역량 점검. 필요시 매장 조정</div></div>
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-amber-700 mb-1"> 중점 모니터링</div><div className="text-sm">정기 안전교육 이수 확인 + 분기별 추세 관찰</div></div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4"><div className="text-xs font-bold text-green-700 mb-1">우수 파트장 발굴</div><div className="text-sm">사고율 낮은 파트장 사례 공유 + 인센티브 연계</div></div>
        </div>
      </Card>
    </div>
  );
}



// ========== NEW: 시군구 & 매장 세부 분석 ==========
export default ParjangDashboard;

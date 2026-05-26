import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix, gradientCells } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';

function StoreDeepDive({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const sigunguData = (D.sigungu_top || []).map(d => ({
    ...d,
    label: `${d.시도 || ''} ${d.시군구 || ''}`.trim(),
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
      {D.sigungu_top && (
        <Card title="시군구별 사고 밀도 TOP 30" titleIcon={MapIcon} sub={`전국 ${D.sigungu_total}개 시군구 중 사고 다발 지역 — 지역별 맞춤 관리`} right={<ExportBtn rows={D.sigungu_top} filename="시군구별.csv" />}>
          <ResponsiveContainer width="100%" height={500} debounce={50}>
            <BarChart data={sigunguData} layout="vertical" margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="label" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={({active, payload}) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.시도} {p.시군구}</div><div>매장 {p.stores_count}개 · 사고 {p.incidents}건</div><div className="font-bold mt-0.5" style={{color: p.rate > 50 ? RD : OR}}>IR {p.rate}%</div></div>;
              }} />
              <Bar dataKey="incidents" fill={OR} radius={[0,5,5,0]} name="사고">
                {gradientCells(sigunguData, OR)}
                <LabelList dataKey="incidents" position="right" style={{ fontSize: 10, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      )}
      
      {D.guibun && (
        <Card title="단품관리 vs 금액관리" titleIcon={Tag} sub="관리 방식별 사고 분포 비교">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <ResponsiveContainer width="100%" height={200} debounce={50}>
              <BarChart data={D.guibun}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis dataKey="guibun" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
                <Bar yAxisId="l" dataKey="incidents" fill={RD} radius={[5,5,0,0]} name="사고" />
                <Line yAxisId="r" type="monotone" dataKey="rate" stroke={NV} strokeWidth={2.5} dot={{r:5}} name="IR%" />
              </BarChart>
            </ResponsiveContainer>
            <div className="space-y-2 text-sm">
              {D.guibun.map(g => (
                <div key={g.guibun} className={`p-3 rounded-lg border ${g.rate > 30 ? "bg-red-50 border-red-200" : "bg-green-50 border-green-200"}`}>
                  <div className="font-bold">{g.guibun}</div>
                  <div className="text-xs text-stone-600 mt-1">매장 {g.stores}개 · 사고 {g.incidents}건</div>
                  <div className="text-2xl font-extrabold tabular-nums mt-1" style={{color: g.rate > 30 ? RD : GN}}>IR {g.rate}%</div>
                </div>
              ))}
              <div className="p-3 rounded bg-blue-50 border border-blue-200 text-xs text-blue-700">
                <b>단품관리 IR {D.guibun[0].rate}% vs 금액관리 IR {D.guibun[1].rate}%</b> ({(D.guibun[0].rate / Math.max(D.guibun[1].rate, 0.1)).toFixed(1)}배 차이). <span className="text-stone-500">※ 단품관리는 일반적으로 큰 매장에 적용. 매장 규모(평수·인력)가 교란 변수일 가능성 높음. 매장 규모 통제 후 비교 권장.</span>
              </div>
            </div>
          </div>
        </Card>
      )}
      
      {D.warehouse && (
        <Card title="창고 면적 비율별 분포" titleIcon={Package} sub="창고 비율 구간별 사고 분포 (인과 분석 아님)">
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <ComposedChart data={D.warehouse}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="bucket" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="stores" fill={GR} radius={[5,5,0,0]} name="매장수" />
              <Bar yAxisId="l" dataKey="incidents" fill={OR} radius={[5,5,0,0]} name="사고" />
              <Line yAxisId="r" type="monotone" dataKey="rate" stroke={RD} strokeWidth={2.5} dot={{r:5}} name="IR%" />
            </ComposedChart>
          </ResponsiveContainer>
          <div className="mt-3 p-3 rounded bg-amber-50 border border-amber-200 text-sm text-stone-700">
            <b>창고 비율별 관찰</b>: 5-10% 구간 절대 건수 최다(253건, 매장 540개). 20%+ 구간은 IR 43.3%로 가장 높음(매장 60개). <span className="text-stone-500">※ 5-10% 구간은 매장 수 자체가 가장 많아 절대 건수가 큼(base rate). 위험도는 IR(rate) 기준 비교가 적절. 인과 단정 전 매장 규모·취급 품목 통제 필요.</span>
          </div>
        </Card>
      )}
    </div>
  );
}


// ========== Admin Mode ==========
export default StoreDeepDive;

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

function SeverityAnalysis({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  if (!D.severity) return null;
  const sRaw = D.severity;
  
  // === 연도 필터별 기간 비례 추정 (실제 연도별 breakdown DB 연동 전 임시) ===
  const totalAll = D.kpis.total || 1;
  const periodCount = yearFilter === "all" ? totalAll
    : yearFilter === "2024" ? D.kpis.y2024
    : yearFilter === "2025" ? D.kpis.y2025
    : yearFilter === "2026" ? D.kpis.y2026 : totalAll;
  const ratio = periodCount / totalAll;
  const isEstimated = yearFilter !== "all";
  
  // 분포(중상·경상·기타·미상) 비례 적용
  const s = isEstimated ? {
    dist: {
      중상: Math.round(sRaw.dist.중상 * ratio),
      경상: Math.round(sRaw.dist.경상 * ratio),
      기타: Math.round(sRaw.dist.기타 * ratio),
      미상: Math.round((sRaw.dist.미상 || 0) * ratio),
    },
    by_type: sRaw.by_type.map(r => ({
      type: r.type,
      중상: Math.round(r.중상 * ratio),
      경상: Math.round(r.경상 * ratio),
      기타: Math.round(r.기타 * ratio),
      미상: Math.round((r.미상 || 0) * ratio),
    })),
    by_age: sRaw.by_age.map(r => ({
      age: r.age,
      중상: Math.round(r.중상 * ratio),
      경상: Math.round(r.경상 * ratio),
      기타: Math.round(r.기타 * ratio),
    })),
    top_dx: Object.fromEntries(
      Object.entries(sRaw.top_dx || {}).map(([k, v]) => [k, Math.round(v * ratio)])
    ),
  } : sRaw;
  
  const sTotal = s.dist.중상 + s.dist.경상 + s.dist.기타;
  const topDxArr = Object.entries(s.top_dx || {}).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10);
  const siteData = Object.entries(D.site || {}).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg p-5 bg-white border border-[#FCE0E3] relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">중상 (골절·파열·진탕)</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{s.dist.중상}</span><span className="text-base font-medium text-stone-400">건</span></div>
          <div className="text-xs opacity-80 mt-1">전체 {pct(s.dist.중상, sTotal)}%{isEstimated ? " · 추정" : ""}</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-amber-100 relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">경상 (염좌·타박·열상)</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{s.dist.경상}</span><span className="text-base font-medium text-stone-400">건</span></div>
          <div className="text-xs opacity-80 mt-1">전체 {pct(s.dist.경상, sTotal)}%{isEstimated ? " · 추정" : ""}</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">중상/경상 비율</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">1 : {(s.dist.경상 / Math.max(s.dist.중상, 1)).toFixed(2)}</div>
          <div className="text-xs text-stone-500 mt-1">중상 1건당 경상</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">진단명 다양성</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{Object.keys(s.top_dx || {}).length}<span className="text-sm text-stone-500 font-normal ml-1">+</span></div>
          <div className="text-xs text-stone-500 mt-1">TOP 표시 · 실제 303개</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="진단명 TOP 10" titleIcon={Stethoscope} sub="의료진단 기준 빈도" right={<ExportBtn rows={topDxArr.map(d=>({진단명:d.name,건수:d.value}))} filename="진단명_TOP10.csv" />}>
          <ResponsiveContainer width="100%" height={240} debounce={50}>
            <BarChart data={topDxArr || []} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={140} />
              <Tooltip content={<TT />} />
              <Bar dataKey="value" fill={PR} radius={[0, 6, 6, 0]}>
                <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#1C1917", fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
        
        <Card title="심각도 × 재해유형" titleIcon={AlertTriangle} sub="재해유형별 중상 비율">
          <ResponsiveContainer width="100%" height={240} debounce={50}>
            <BarChart data={s.by_type || []} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={90} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="중상" stackId="a" fill={RD} />
              <Bar dataKey="경상" stackId="a" fill={AM} />
              <Bar dataKey="기타" stackId="a" fill={GR} radius={[0,5,5,0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
      
      <Card title="심각도 × 연령대" titleIcon={Users} sub="연령대별 중상 리스크">
        <ResponsiveContainer width="100%" height={220} debounce={50}>
          <BarChart data={s.by_age || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
            <XAxis dataKey="age" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar dataKey="중상" stackId="a" fill={RD} />
            <Bar dataKey="경상" stackId="a" fill={AM} />
            <Bar dataKey="기타" stackId="a" fill={GR} radius={[5,5,0,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>
      
      <Card title="관찰 사항" titleIcon={Lightbulb} sub={isEstimated ? `${yearFilter}년 기간 비례 추정 (실제 연도별 breakdown DB 연동 전)` : "전체 누적 기준"}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-red-700 mb-1">골절 진단 최다</div><div className="text-sm">단일 상병명 중 <b>골절 {s.top_dx?.골절 || 0}건</b>. <span className="text-stone-500">골절 발생 재해유형은 넘어짐·떨어짐·끼임 등 복합. 재해유형별 break-down 후 우선순위 결정 권장.</span></div></div>
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-amber-700 mb-1">중상 비율 {pct(s.dist.중상, sTotal)}%</div><div className="text-sm">전체 사고의 약 1/3이 중상급. <span className="text-stone-500">중상 1건당 평균 90일+ 업무 손실 추정.</span></div></div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-bold text-blue-700 mb-1">활용 방안</div><div className="text-sm">진단명별 평균 회복기간 매핑 시 재무손실 정확도 향상 가능. <span className="text-stone-500">실제 산재 승인 여부는 별도 DB 연동 필요.</span></div></div>
        </div>
      </Card>


      <Card title="상해부위 (근골격계)" titleIcon={Bone} sub="기록된 건 기준">
        <ResponsiveContainer width="100%" height={200} debounce={50}>
          <BarChart data={siteData || []} layout="vertical" margin={{ left: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={140} />
            <Tooltip content={<TT />} />
            <Bar dataKey="value" fill={PR} radius={[0,6,6,0]}>
              <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#1C1917", fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* U3: AI 심각도 분석 */}    </div>
  );
}

// ========== NEW: 파트장 관리 ==========
export default SeverityAnalysis;

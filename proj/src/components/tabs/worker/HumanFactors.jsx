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

function HumanFactors({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const ageOrder = ["10 대","20 대","30 대","40 대","50 대","60 대"];
  const tenOrder = ["1년 미만","1-2년","3-4년","5-9년","10-14년","15년 이상"];
  
  const ageData = ageOrder.filter(a => D.age[a]).map(a => ({ name: a, value: D.age[a], 수도권: D.age_s[a] || 0, 지방: D.age_j[a] || 0 }));
  const tenData = tenOrder.filter(t => D.tenure[t]).map(t => ({ name: t, value: D.tenure[t], 수도권: D.tenure_s[t] || 0, 지방: D.tenure_j[t] || 0 }));
  const empData = Object.entries(D.emp).map(([k,v]) => ({ name: k, value: v }));
  
  const totalAge = ageData.reduce((s,x)=>s+x.value,0);
  const totalTen = tenData.reduce((s,x)=>s+x.value,0);
  const totalEmp = empData.reduce((s,x)=>s+x.value,0);
  
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
      <Card title="연령대별 분포" titleIcon={Users} sub={`영업부문 ${totalAge}건`} right={<ExportBtn rows={ageData} filename="연령대별.csv" />}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart data={ageData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="수도권" stackId="a" fill={BL} />
              <Bar dataKey="지방" stackId="a" fill={OR} radius={[5,5,0,0]}>
                <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <BarRank items={ageData.map(a => ({name: a.name, value: a.value}))} color={BL} total={totalAge} />
        </div>
      </Card>
      
      <Card title="근속연수별 분포" titleIcon={TrendingUp} sub={`영업부문 ${totalTen}건`} right={<ExportBtn rows={tenData} filename="근속연수별.csv" />}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart data={tenData || []}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar dataKey="수도권" stackId="a" fill={BL} />
              <Bar dataKey="지방" stackId="a" fill={OR} radius={[5,5,0,0]}>
                <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <BarRank items={tenData.map(t => ({name: t.name, value: t.value}))} color={OR} total={totalTen} />
        </div>
      </Card>
      
      <Card title="고용형태별 분포" titleIcon={Briefcase} sub="연봉/임시/파트/촉탁/초단기" right={<ExportBtn rows={empData} filename="고용형태별.csv" />}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <PieChart>
              <Pie data={empData} dataKey="value" nameKey="name" cx="50%" cy="50%" startAngle={90} endAngle={-270} innerRadius={40} outerRadius={80} paddingAngle={2}>
                {empData.map((e, i) => <Cell key={i} fill={PAL[i]} />)}
              </Pie>
              <Tooltip content={<TT />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="lg:col-span-2">
            <Matrix data={D.empType} rowKey="emp" cols={D.crossTypes.slice(0, 6)} />
          </div>
        </div>
        <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700">
          <b>고용형태별 분포 관찰</b>: 연봉(정규직) 241건 · 임시 177건 · 파트 89건 · 촉탁 7건. <span className="text-stone-500">※ 절대 건수 비교만으로는 위험도를 알 수 없음. 각 고용형태별 <b>전체 근로자 수(분모)</b>와 비교한 발생률(per-100) 산출 후에야 비교 가능. 인력 DB 연동 후 재분석 권장.</span>
        </div>
      </Card>
      
      {/* 연령×근속 교차 분석 (요인×결과에서 이동) */}
      {D.ageTenure && (
        <Card title="연령대 × 근속연수 매트릭스" titleIcon={Users} sub="인력 프로파일별 위험 분포 — 타겟 교육 설계 기반">
          <Matrix data={D.ageTenure} rowKey="age" cols={["1년 미만","1-2년","3-4년","5-9년","10-14년","15년 이상"]} />
          <div className="mt-4 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700">
            <b>핵심 발견</b>: 50대·1년 미만 재해자가 가장 많음 — 중장년 신규 입사자가 <b>가장 고위험 그룹</b>. 
            <span className="text-stone-500">※ 인력 구성비(분모) 확인 후 노출량 보정 비교 필요.</span>
          </div>
        </Card>
      )}

      <Card title="핵심 고위험 프로필 요약" titleIcon={Siren}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs font-bold text-red-700 mb-1">연령 TOP</div>
            <div className="text-lg font-extrabold">50대 · {D.age["50 대"]}건 ({pct(D.age["50 대"], totalAge)}%)</div>
            <div className="text-xs text-stone-600 mt-1">절대 건수 최다 — 50대 인력 비중과 비교 검토 필요</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs font-bold text-amber-700 mb-1">근속 TOP</div>
            <div className="text-lg font-extrabold">1년 미만 · {D.tenure["1년 미만"]}건 ({pct(D.tenure["1년 미만"], totalTen)}%)</div>
            <div className="text-xs text-stone-600 mt-1">근속 1년 미만 비중 최다 — 신규자 교육 점검 후보</div>
          </div>
          <div className="rounded-lg border border-pink-100 bg-pink-50/50 p-4">
            <div className="text-xs font-bold text-pink-700 mb-1">성별 편중</div>
            <div className="text-lg font-extrabold">여성 {D.kpis.female}건 ({pct(D.kpis.female, D.kpis.female+D.kpis.male)}%)</div>
            <div className="text-xs text-stone-600 mt-1">매장 직원 성비 반영 추정 — 분모 검증 필요</div>
          </div>
        </div>
      </Card>      
    </div>
  );
}


// ========== TAB 6: Cost & Risk ==========
export default HumanFactors;

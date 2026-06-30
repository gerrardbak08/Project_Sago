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
import { useCountUp, useInView } from '../../../utils/motion.js';

function HumanFactors({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const ageOrder = ["10대","20대","30대","40대","50대","60대"];
  const tenOrder = ["1년 미만","1-2년","3-4년","5-9년","10-14년","15년 이상"];

  const ageData = ageOrder.filter(a => (D.age_s[a]||0)+(D.age_j[a]||0) > 0).map(a => ({ name: a, value: (D.age_s[a]||0)+(D.age_j[a]||0), 수도권: D.age_s[a] || 0, 지방: D.age_j[a] || 0 }));
  const tenData = tenOrder.filter(t => (D.tenure_s[t]||0)+(D.tenure_j[t]||0) > 0).map(t => ({ name: t, value: (D.tenure_s[t]||0)+(D.tenure_j[t]||0), 수도권: D.tenure_s[t] || 0, 지방: D.tenure_j[t] || 0 }));
  const empData = Object.entries(D.emp).map(([k,v]) => ({ name: k, value: v }));

  const totalAge = ageData.reduce((s,x)=>s+x.value,0);
  const totalTen = tenData.reduce((s,x)=>s+x.value,0);
  const totalEmp = empData.reduce((s,x)=>s+x.value,0);

  // Animation gating refs
  const ageChartRef = useRef(null);
  const ageChartInView = useInView(ageChartRef);
  const tenChartRef = useRef(null);
  const tenChartInView = useInView(tenChartRef);
  const empChartRef = useRef(null);
  const empChartInView = useInView(empChartRef);
  const profileRef = useRef(null);
  const profileInView = useInView(profileRef);

  // CountUp values for profile cards (pct returns string like "35.2")
  const peakAge     = ageData.length ? ageData.reduce((a,b)=>b.value>a.value?b:a) : null;
  const peakTen     = tenData.length ? tenData.reduce((a,b)=>b.value>a.value?b:a) : null;
  const agePeakRaw  = peakAge ? peakAge.value : 0;
  const agePeakPct  = parseFloat(pct(agePeakRaw, totalAge));
  const tenPeakRaw  = peakTen ? peakTen.value : 0;
  const tenPeakPct  = parseFloat(pct(tenPeakRaw, totalTen));
  const femaleRaw   = D.kpis.female || 0;
  const femalePct   = parseFloat(pct(D.kpis.female || 0, (D.kpis.female || 0) + (D.kpis.male || 0)));

  const cAgePeak    = useCountUp(agePeakRaw, 900, profileInView);
  const cAgePct     = useCountUp(Math.round(agePeakPct  * 10), 900, profileInView);
  const cTenPeak    = useCountUp(tenPeakRaw, 900, profileInView);
  const cTenPct     = useCountUp(Math.round(tenPeakPct  * 10), 900, profileInView);
  const cFemale     = useCountUp(femaleRaw, 900, profileInView);
  const cFemalePct  = useCountUp(Math.round(femalePct   * 10), 900, profileInView);

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
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 sm:gap-4">

        {/* ── 연령대별 분포 ── */}
        <Card title="연령대별 분포" titleIcon={Users} sub={`영업부문 ${totalAge}건`} right={<ExportBtn rows={ageData} filename="연령대별.csv" />} delay={0}>
          {ageData.length === 0 ? (
            <EmptyState message="연령대 데이터 없음" icon={Users} />
          ) : (
            <div ref={ageChartRef} className="grid grid-cols-1 gap-4">
              <ResponsiveContainer width="100%" height={260} debounce={50}>
                <BarChart key={ageChartInView ? 1 : 0} data={ageData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="수도권" stackId="a" fill={BL}
                    isAnimationActive={ageChartInView} animationBegin={300} animationDuration={800} />
                  <Bar dataKey="지방" stackId="a" fill={OR} radius={[5,5,0,0]}
                    isAnimationActive={ageChartInView} animationBegin={300} animationDuration={800}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <BarRank items={ageData.map(a => ({name: a.name, value: a.value}))} color={BL} total={totalAge} />
            </div>
          )}
        </Card>

        {/* ── 근속연수별 분포 ── */}
        <Card title="근속연수별 분포" titleIcon={TrendingUp} sub={`영업부문 ${totalTen}건`} right={<ExportBtn rows={tenData} filename="근속연수별.csv" />} delay={90}>
          {tenData.length === 0 ? (
            <EmptyState message="근속연수 데이터 없음" icon={TrendingUp} />
          ) : (
            <div ref={tenChartRef} className="grid grid-cols-1 gap-4">
              <ResponsiveContainer width="100%" height={280} debounce={50}>
                <BarChart key={tenChartInView ? 1 : 0} data={tenData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, fill: "#44403C", angle: -30, textAnchor: 'end' }}
                    axisLine={false}
                    tickLine={false}
                    interval={0}
                    height={52}
                  />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="수도권" stackId="a" fill={BL}
                    isAnimationActive={tenChartInView} animationBegin={300} animationDuration={800} />
                  <Bar dataKey="지방" stackId="a" fill={OR} radius={[5,5,0,0]}
                    isAnimationActive={tenChartInView} animationBegin={300} animationDuration={800}>
                    <LabelList dataKey="value" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <BarRank items={tenData.map(t => ({name: t.name, value: t.value}))} color={OR} total={totalTen} />
            </div>
          )}
        </Card>

        {/* ── 고용형태별 분포 ── */}
        <Card title="고용형태별 분포" titleIcon={Briefcase} sub="연봉/임시/파트/촉탁/초단기" right={<ExportBtn rows={empData} filename="고용형태별.csv" />} delay={180}>
          {empData.length === 0 ? (
            <EmptyState message="고용형태 데이터 없음" icon={Briefcase} />
          ) : (
            <div ref={empChartRef} className="grid grid-cols-1 xl:grid-cols-3 gap-4">
              {/* 도넛 + 중앙 총원 레이블 */}
              <div className="relative">
                <ResponsiveContainer width="100%" height={200} debounce={50}>
                  <PieChart key={empChartInView ? 1 : 0}>
                    <Pie
                      data={empData}
                      dataKey="value"
                      nameKey="name"
                      cx="50%"
                      cy="50%"
                      startAngle={90}
                      endAngle={-270}
                      innerRadius={30}
                      outerRadius={55}
                      paddingAngle={2}
                      isAnimationActive={empChartInView}
                      animationBegin={300}
                      animationDuration={800}
                    >
                      {empData.map((e, i) => <Cell key={e.name} fill={PAL[i]} />)}
                    </Pie>
                    <Tooltip content={<TT />} />
                  </PieChart>
                </ResponsiveContainer>
                {totalEmp > 0 && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="text-center leading-tight">
                      <div className="text-base font-extrabold text-stone-800 tabular-nums">{totalEmp}</div>
                      <div className="text-[10px] text-stone-500 font-medium">건</div>
                    </div>
                  </div>
                )}
              </div>
              <div className="xl:col-span-2">
                <Matrix data={D.empType} rowKey="emp" cols={D.crossTypes.slice(0, 6)} />
              </div>
            </div>
          )}
          <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700">
            <b>고용형태별 분포 관찰</b>: {empData.length ? [...empData].sort((a, b) => b.value - a.value).map(e => `${e.name} ${e.value}건`).join(" · ") : "라이브 시트에 고용형태 없음 — 수동 업로드 시 표시."} <span className="text-stone-500">※ 절대 건수 비교만으로는 위험도를 알 수 없음. 각 고용형태별 <b>전체 근로자 수(분모)</b>와 비교한 발생률(per-100) 산출 후에야 비교 가능. 인력 DB 연동 후 재분석 권장.</span>
          </div>
        </Card>

        {/* ── 연령×근속 교차 분석 ── */}
        {D.ageTenure && (
          <Card title="연령대 × 근속연수 매트릭스" titleIcon={Users} sub="인력 프로파일별 위험 분포 — 타겟 교육 설계 기반" delay={270}>
            <Matrix data={D.ageTenure} rowKey="age" cols={["1년 미만","1-2년","3-4년","5-9년","10-14년","15년 이상"]} />
            <div className="mt-4 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700">
              <b>핵심 발견</b>: {peakAge ? peakAge.name : '-'}·{peakTen ? peakTen.name : '-'} 재해자가 가장 많음 — 중장년 신규 입사자가 <b>가장 고위험 그룹</b>.
              <span className="text-stone-500">※ 인력 구성비(분모) 확인 후 노출량 보정 비교 필요.</span>
            </div>
          </Card>
        )}

      </div>

      {/* ── 핵심 고위험 프로필 요약 ── */}
      <Card title="핵심 고위험 프로필 요약" titleIcon={Siren}>
        <div ref={profileRef} className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs font-bold text-red-700 mb-1">연령 TOP</div>
            <div className="text-lg font-extrabold tabular-nums">
              {peakAge ? peakAge.name : '-'} · <span className="tabular-nums">{cAgePeak}</span>건 (<span className="tabular-nums">{(cAgePct / 10).toFixed(1)}</span>%)
            </div>
            <div className="text-xs text-stone-600 mt-1">절대 건수 최다 — {peakAge ? peakAge.name : '-'} 인력 비중과 비교 검토 필요</div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="text-xs font-bold text-amber-700 mb-1">근속 TOP</div>
            <div className="text-lg font-extrabold tabular-nums">
              {peakTen ? peakTen.name : '-'} · <span className="tabular-nums">{cTenPeak}</span>건 (<span className="tabular-nums">{(cTenPct / 10).toFixed(1)}</span>%)
            </div>
            <div className="text-xs text-stone-600 mt-1">근속 {peakTen ? peakTen.name : '-'} 비중 최다 — 신규자 교육 점검 후보</div>
          </div>
          <div className="rounded-lg border border-amber-100 bg-amber-50/30 p-4">
            <div className="text-xs font-bold text-amber-700 mb-1">성별 편중 <span className="text-[10px] font-normal text-stone-400">(전 부문 기준)</span></div>
            <div className="text-lg font-extrabold tabular-nums">
              여성 <span className="tabular-nums">{cFemale}</span>건 (<span className="tabular-nums">{(cFemalePct / 10).toFixed(1)}</span>%)
            </div>
            <div className="text-xs text-stone-600 mt-1">매장 직원 성비 반영 추정 — 분모 검증 필요</div>
          </div>
        </div>
      </Card>
    </div>
  );
}


// ========== TAB 6: Cost & Risk ==========
export default HumanFactors;

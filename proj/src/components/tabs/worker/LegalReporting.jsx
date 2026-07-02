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

function LegalReporting({ D, yearFilter, allYearly, basis, rawKind }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const k = D.kpis;
  const basisLabel = basis === 'approval' ? '산재 승인' : '사고경위';
  // 라이브 연도별 데이터 — 기준 전환 시 재빌드됨 (2023 유령 없음)
  const yearlyApproval = (allYearly || []).map((y, i, arr) => {
    const count = (y.s || 0) + (y.j || 0) + (y.e || 0);
    const prev = i > 0 ? ((arr[i - 1].s || 0) + (arr[i - 1].j || 0) + (arr[i - 1].e || 0)) : null;
    return { year: y.year, count, lossDays: y.loss_days || 0, yoy: prev ? ((count - prev) / prev) * 100 : null };
  });
  const kindData = Object.entries(D.kind).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  
  // F2: 실제 데이터 기반 알림 규칙 동적 계산
  const tenureUnder1 = D.tenure?.["1년 미만"] || 0;
  const tenureTotal = Object.values(D.tenure || {}).reduce((s,v)=>s+v, 0) || 1;
  // D.monthly 는 배열 [{ym,y,m,s,j,t}] — 월 총건은 m.t. (객체 형태도 방어)
  const _monthlyArr = Array.isArray(D.monthly) ? D.monthly : Object.values(D.monthly || {});
  const monthlyMax = Math.max(0, ..._monthlyArr.map(m => (typeof m === "number" ? m : (m?.t ?? m?.count ?? 0))));
  const alertRules = [
    { type: "CRITICAL", rule: "사망 사고 발생 (전체 기간 기준)", target: "CEO · 안전보건총괄 · 법무팀", count: rawKind?.["사망"] || 0, triggered: Math.floor(rawKind?.["사망"] || 0) > 0, color: { bg:"#FEF2F2", border:"#FCA5A5", badge:"#DC2626" } },
    { type: "HIGH",     rule: `월간 최다 발생 ${monthlyMax}건 (임계치 15건 초과)`, target: "해당 팀장 · 부서장", count: monthlyMax, triggered: monthlyMax > 15, color: { bg:"#FFF7ED", border:"#FDBA74", badge:"#EA580C" } },
    { type: "MEDIUM",   rule: `신입(1년 미만) 사고 비중 ${((tenureUnder1/tenureTotal)*100).toFixed(0)}% (임계치 30% 초과)`, target: "교육팀 · HR팀", count: tenureUnder1, triggered: tenureUnder1 / tenureTotal > 0.30, color: { bg:"#FFFBEB", border:"#FDE68A", badge:"#D97706" } },
    { type: "MEDIUM",   rule: `산재 미제출 ${k.not_submitted || 0}건 ${yearFilter && yearFilter !== "all" ? "(해당 연도 추정)" : "누적"}`, target: "안전보건팀", count: k.not_submitted || 0, triggered: (k.not_submitted || 0) > 0, color: { bg:"#FFFBEB", border:"#FDE68A", badge:"#D97706" } },
    { type: "LOW",      rule: "부서별 월별 패턴 이상 감지 (자동)", target: "부서 안전담당자", count: "자동", triggered: false, color: { bg:"#F8FAFC", border:"#E2E8F0", badge:"#64748B" } },
  ];
  const submitRate = parseFloat(pct(k.submitted, k.submitted + k.not_submitted));

  // filterData가 연도 정확한 loss_days_total/avg 제공 — 직접 사용
  const lossTotal = k.loss_days_total;
  const lossAvg = k.loss_days_avg;

  const kpiRef = useRef(null);
  const kpiInView = useInView(kpiRef);
  const chartRef = useRef(null);
  const chartInView = useInView(chartRef);

  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 600);
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 600);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);

  const countTotal    = useCountUp(k.total,                  900, kpiInView);
  const countDeath    = useCountUp(D.kind["사망"] || 0,       900, kpiInView);
  const countCommute  = useCountUp(D.kind["출퇴근"] || 0,     900, kpiInView);

  // 막대 위 라벨 — 건수(굵게) + 전년대비 증감율(색상). 라인과 겹쳐도 보이도록 흰 테두리(halo).
  const CountYoYLabel = ({ x, y, width, value, index }) => {
    const row = yearlyApproval[index];
    const cx = x + width / 2;
    const halo = { paintOrder: 'stroke', stroke: '#fff', strokeWidth: 3.5, strokeLinejoin: 'round' };
    return (
      <g>
        {row?.yoy != null && (
          <text x={cx} y={y - 20} textAnchor="middle" fontSize={9.5} fontWeight={800}
            fill={row.yoy < 0 ? '#047857' : '#B91C1C'} style={halo}>
            {row.yoy < 0 ? '▼' : '▲'}{Math.abs(row.yoy).toFixed(0)}%
          </text>
        )}
        <text x={cx} y={y - 7} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1C1917" style={halo}>{value}</text>
      </g>
    );
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>
      <div ref={kpiRef} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* 산재 승인 현황 — 라이브 기준 (상단 필터·기준 전환 연동) */}
        <div className="rounded-[20px] p-4 sm:p-5 bg-white border border-blue-100 relative overflow-hidden dash-fade-in transition-shadow hover:shadow-md" style={{ animationDelay: '0ms' }}>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">{basisLabel} 현황</div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className="text-3xl font-extrabold tabular-nums text-[#071E4A]">{countTotal.toLocaleString()}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
            <div className="text-xs text-stone-500">{basis === 'approval' ? '근로복지공단 승인 기준' : '사고 발생 기준'}</div>
          </div>
          <div className="text-xs text-stone-500 mt-1">
            근로손실 <b className="tabular-nums">{fmt(lossTotal)}</b>일 · 평균 {lossAvg != null ? Number(lossAvg).toFixed(1) : "-"}일
            {Number.isFinite(submitRate) && submitRate >= 0 && (
              <span className="ml-2">· 제출률 <b className="tabular-nums text-stone-700">{submitRate.toFixed(0)}%</b></span>
            )}
          </div>
        </div>
        <div className="rounded-[20px] p-4 sm:p-5 bg-white border border-red-200 dash-fade-in transition-shadow hover:shadow-md" style={{ animationDelay: '80ms' }}>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">사고사망 (T10)</div>
          <div className="text-3xl font-extrabold tabular-nums mt-2" style={{ color: '#D70011' }}>{countDeath.toLocaleString()}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
          <div className="text-xs text-stone-500 mt-1">중대재해 처벌법 대상</div>
        </div>
        <div className="rounded-[20px] p-4 sm:p-5 bg-white border border-stone-200 dash-fade-in transition-shadow hover:shadow-md" style={{ animationDelay: '160ms' }}>
          <div className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">출퇴근 재해</div>
          <div className="text-3xl font-extrabold tabular-nums mt-2 text-[#071E4A]">{countCommute.toLocaleString()}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
          <div className="text-xs text-stone-500 mt-1">통제 외지만 보상 운영</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="재해 종류별 분포" titleIcon={ClipboardList} sub="사고/출퇴근/질병/불인정 구분 — 법적 카테고리" right={<ExportBtn rows={kindData.map(r=>({재해종류:r.name,건수:r.value}))} filename="재해종류별_분포.csv" />}>
          <ResponsiveContainer width="100%" height={Math.max(200, kindData.length * 26)} debounce={50}>
            <BarChart data={kindData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" domain={[0, dm => Math.max(1, Math.ceil(dm * 1.12))]} tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" interval={0} tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={72} />
              <Tooltip content={<TT />} />
              <Bar dataKey="value" radius={[0,6,6,0]}>
                {kindData.map((e, i) => {
                  const color = e.name === "사망" ? RD : e.name === "사고" ? BL : e.name === "질병" ? PR : e.name === "출퇴근" ? OR : e.name === "불인정" ? GR : "#D6D3D1";
                  return <Cell key={i} fill={color} />;
                })}
                <LabelList dataKey="value" position="right" style={{ fontSize: 11, fill: "#1C1917", fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        {yearlyApproval.length > 0 ? (
          <div ref={chartRef}>
            <Card title="연도별 산재 승인 추세" titleIcon={ShieldCheck} sub={`승인 건수 · 근로손실일수 — ${basisLabel} 기준`} right={<ExportBtn rows={yearlyApproval.map(y=>({연도:y.year,승인건수:y.count,근로손실일수:y.lossDays}))} filename="연도별_산재승인.csv" />}>
              <ResponsiveContainer width="100%" height={220} debounce={50}>
                <ComposedChart key={chartInView ? 1 : 0} data={yearlyApproval} margin={{ top: 34, left: 0, right: isMobile ? 4 : 8 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="l" domain={[0, dm => Math.ceil((dm * 1.55) / 10) * 10]} tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} width={28} />
                  {isMobile
                    ? <YAxis yAxisId="r" orientation="right" domain={[0, dm => Math.ceil(dm * 1.2)]} hide />
                    : <YAxis yAxisId="r" orientation="right" domain={[0, dm => Math.ceil(dm * 1.2)]} tick={{ fontSize: 10, fill: "#A8A29E" }} axisLine={false} tickLine={false} width={40} />
                  }
                  <Tooltip content={<TT />} />
                  <Bar yAxisId="l" dataKey="count" name="승인 건수" radius={[6,6,0,0]} fill={BL} maxBarSize={48}
                    isAnimationActive={chartInView} animationDuration={600} animationBegin={0}>
                    <LabelList content={<CountYoYLabel />} />
                  </Bar>
                  <Line yAxisId="r" dataKey="lossDays" name="근로손실일수" stroke={OR} strokeWidth={2} dot={{ r: 3 }}
                    isAnimationActive={chartInView} animationDuration={800} animationBegin={300} />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>
          </div>
        ) : (
          <Card title="연도별 산재 승인 추세" titleIcon={ShieldCheck} sub="연도별 데이터 없음">
            <EmptyState message="표시할 연도별 데이터가 없습니다" />
          </Card>
        )}
      </div>
      
      {/* 중대재해처벌법 12개 체크리스트 */}
      
      {/* Alert simulation */}
      <Card title="자동 알림 시뮬레이션" titleIcon={Bell} sub="이상치 탐지 규칙 기반 — KakaoTalk Business API 연동 예시" right={<ExportBtn rows={alertRules.filter(a=>a.triggered).map(a=>({단계:a.type,규칙:a.rule,수신자:a.target,수치:a.count}))} filename="알림_트리거_목록.csv" />}>
        <div className="space-y-2">
          {alertRules.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border transition-all hover:-translate-y-0.5 hover:shadow-sm min-h-[44px]"
              style={{ background: a.triggered ? a.color.bg : "#FAFAF9", borderColor: a.triggered ? a.color.border : "#E7E5E4" }}>
              <div className="flex-shrink-0">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: a.color.badge }}>{a.type}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-stone-800 line-clamp-2">{a.rule}</div>
                <div className="text-[11px] text-stone-500 mt-0.5">수신자: {a.target}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-base font-extrabold tabular-nums ${a.triggered ? "text-red-700" : "text-stone-400"}`}>{a.count}</div>
                <div className="text-[10px] text-stone-400">{typeof a.count === "number" ? "건" : ""}</div>
              </div>
              {a.triggered && <div className="flex-shrink-0 w-2 h-2 rounded-full animate-pulse" style={{ background: a.color.badge }} />}
            </div>
          ))}
          <div className="text-[10px] text-stone-400 pt-1 flex items-center gap-1">
            <Bell size={10} />
            <span>실측 데이터 기반 자동 계산 · KakaoTalk Business API 연동 시 실시간 발송</span>
          </div>
        </div>
      </Card>
    </div>
  );
}


// ========== App Shell ==========

// ========== NEW TAB 8: 매장 통합 분석 ==========
export default LegalReporting;

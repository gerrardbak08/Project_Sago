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

function LegalReporting({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const k = D.kpis;
  const kindData = Object.entries(D.kind).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value);
  
  // F2: 실제 데이터 기반 알림 규칙 동적 계산
  const tenureUnder1 = D.tenure?.["1년 미만"] || 0;
  const tenureTotal = Object.values(D.tenure || {}).reduce((s,v)=>s+v, 0) || 1;
  const monthlyMax = Math.max(...Object.values(D.monthly || {}).map(m => typeof m === "number" ? m : (m?.count||m||0)), 0);
  const alertRules = [
    { type: "CRITICAL", rule: "사망 사고 발생", target: "CEO · 안전보건총괄 · 법무팀", count: D.kind?.["사망"] || 0, triggered: (D.kind?.["사망"] || 0) > 0, color: { bg:"#FEF2F2", border:"#FCA5A5", badge:"#DC2626" } },
    { type: "HIGH",     rule: `월간 최다 발생 ${monthlyMax}건 (임계치 15건 초과)`, target: "해당 팀장 · 부서장", count: monthlyMax, triggered: monthlyMax > 15, color: { bg:"#FFF7ED", border:"#FDBA74", badge:"#EA580C" } },
    { type: "MEDIUM",   rule: `신입(1년 미만) 사고 비중 ${((tenureUnder1/tenureTotal)*100).toFixed(0)}% (임계치 30% 초과)`, target: "교육팀 · HR팀", count: tenureUnder1, triggered: tenureUnder1 / tenureTotal > 0.30, color: { bg:"#FFFBEB", border:"#FDE68A", badge:"#D97706" } },
    { type: "MEDIUM",   rule: `산재 미제출 ${k.not_submitted || 0}건 누적`, target: "안전보건팀", count: k.not_submitted || 0, triggered: (k.not_submitted || 0) > 0, color: { bg:"#FFFBEB", border:"#FDE68A", badge:"#D97706" } },
    { type: "LOW",      rule: "부서별 월별 패턴 이상 감지 (자동)", target: "부서 안전담당자", count: "자동", triggered: false, color: { bg:"#F8FAFC", border:"#E2E8F0", badge:"#64748B" } },
  ];
  const submitRate = parseFloat(pct(k.submitted, k.submitted + k.not_submitted));
  
  
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-lg p-5 bg-white border border-indigo-100 relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">산재 제출 현황</div>
          <div className="flex items-baseline gap-3 mt-2">
            <div className="text-2xl sm:text-3xl font-bold tabular-nums">{submitRate}%</div>
            <div className="text-xs opacity-80">제출률</div>
          </div>
          <div className="text-xs opacity-80 mt-1">제출 {k.submitted}건 · 미기록 {k.not_submitted}건</div>
          <div className="mt-3 h-2 bg-stone-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-400 rounded-full" style={{ width: `${submitRate}%` }} /></div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-red-200">
          <div className="text-xs text-red-600 font-bold">사고사망 (T10)</div>
          <div className="text-2xl font-extrabold tabular-nums mt-2">{D.kind["사망"] || 0}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
          <div className="text-xs text-stone-500 mt-1">중대재해 처벌법 대상</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">출퇴근 재해</div>
          <div className="text-2xl font-extrabold tabular-nums mt-2">{D.kind["출퇴근"] || 0}<span className="text-sm text-stone-500 font-normal ml-1">건</span></div>
          <div className="text-xs text-stone-500 mt-1">통제 외지만 보상 운영</div>
        </div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="재해 종류별 분포" titleIcon={ClipboardList} sub="사고/출퇴근/질병/불인정 구분 — 법적 카테고리" right={<ExportBtn rows={kindData.map(r=>({재해종류:r.name,건수:r.value}))} filename="재해종류별_분포.csv" />}>
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <BarChart data={kindData} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={70} />
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
        
      </div>
      
      {/* 중대재해처벌법 12개 체크리스트 */}
      
      {/* Alert simulation */}
      <Card title="자동 알림 시뮬레이션" titleIcon={Bell} sub="이상치 탐지 규칙 기반 — KakaoTalk Business API 연동 예시" right={<ExportBtn rows={alertRules.filter(a=>a.triggered).map(a=>({단계:a.type,규칙:a.rule,수신자:a.target,수치:a.count}))} filename="알림_트리거_목록.csv" />}>
        <div className="space-y-2">
          {alertRules.map((a, i) => (
            <div key={i} className="flex items-center gap-3 p-3 rounded-lg border transition"
              style={{ background: a.triggered ? a.color.bg : "#FAFAF9", borderColor: a.triggered ? a.color.border : "#E7E5E4" }}>
              <div className="flex-shrink-0">
                <span className="text-[10px] font-bold px-2 py-1 rounded-full text-white" style={{ background: a.color.badge }}>{a.type}</span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-xs font-semibold text-stone-800 truncate">{a.rule}</div>
                <div className="text-[10px] text-stone-500 mt-0.5">수신자: {a.target}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className={`text-base font-extrabold tabular-nums ${a.triggered ? "text-red-700" : "text-stone-400"}`}>{a.count}</div>
                <div className="text-[10px] text-stone-400">{typeof a.count === "number" ? "건" : ""}</div>
              </div>
              {a.triggered && <div className="flex-shrink-0 w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: a.color.badge }} />}
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

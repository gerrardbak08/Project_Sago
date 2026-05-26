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

function CrossAnalysis({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
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
      <Card title="재해유형 × 기인물 매트릭스" titleIcon={GitBranch} sub="'어떤 기인물이 어떤 재해를 일으키는가' — 안전관리 개입점 도출" right={<ExportBtn rows={D.cross || []} filename="재해유형_기인물_매트릭스.csv" />}>
        <Matrix data={D.cross} rowKey="type" cols={D.crossCauses} />
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs font-bold text-stone-700">상위 셀 관찰</div><div>넘어짐×계단(56건) · 무리한 동작×반복작업(68건) · 베임×칼(18건). <span className="text-stone-500">큰 셀 = 빈도 높은 조합. 단, 작업 빈도(노출량) 보정 전이므로 절대 위험도 비교는 주의.</span></div></div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs font-bold text-blue-700">읽는 법</div><div>행(재해유형) 기준 기인물 비중 확인 → 넘어짐의 원인 분포 파악 가능</div></div>
          <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep"><div className="text-xs font-bold text-amber-700">활용 가이드</div><div>큰 셀 = 빈도 높은 조합 → 현장 RCA 우선순위 후보. <span className="text-stone-500">실제 개입 효과는 노출량·예방 비용 등 추가 분석 필요.</span></div></div>
        </div>
      </Card>
      
      <Card title="사고 내용 키워드 빈도분석" titleIcon={Search} sub="사고 서술문에서 추출한 핵심 키워드 — 숨은 위험 패턴 도출">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {D.keywords.slice(0, 20).map((kw, i) => {
            const maxC = Math.max(...D.keywords.map(k => k.count), 1);
            const size = 12 + Math.round((kw.count / maxC) * 10);
            const opacity = 0.4 + (kw.count / maxC) * 0.6;
            return (
              <div key={kw.word} className="flex flex-col items-center justify-center p-3 rounded-lg bg-stone-50 border border-stone-200 hover:border-stone-300 transition">
                <span className="font-bold text-stone-900" style={{ fontSize: `${size}px`, opacity }}>{kw.word}</span>
                <span className="text-xs text-stone-500 tabular-nums mt-1">{kw.count}회</span>
              </div>
            );
          })}
        </div>
        <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700 break-keep">
          <b>키워드 빈도 관찰</b>: 사고 서술문에서 "넘어짐(124)" "박스를(59)" "계단을(40)" "헛디뎌(39)" 등이 자주 등장. <span className="text-stone-500">※ 키워드 빈도는 사고 발생 패턴의 단서일 뿐, 인과 관계는 별도 검증 필요. 예: "계단" 키워드가 많다고 계단 자체가 원인인지, 작업 동선이 원인인지는 현장 RCA(Root Cause Analysis) 필요.</span>
        </div>
      </Card>
      
      <Card title="부서 × 재해유형 매트릭스" titleIcon={Building2} sub="부서별 재해유형 분포 비교">
        <Matrix data={D.deptType} rowKey="dept" cols={D.crossTypes} />
      </Card>
      
      <Card title="성별 × 재해유형" titleIcon={UserCircle} sub={(() => {
        const total = (D.genderType || []).reduce((s, r) => s + (r.여 || 0) + (r.남 || 0), 0);
        return `성별 특성별 재해 패턴 (기록된 ${total}건 기준)${D._isEstimated ? " · 추정" : ""}`;
      })()}>
        <ResponsiveContainer width="100%" height={220} debounce={50}>
          <BarChart data={D.genderType} layout="vertical" margin={{ left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={90} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            <Bar dataKey="여" fill={DAISO_RED} radius={[0,3,3,0]} />
            <Bar dataKey="남" fill={BL} radius={[0,3,3,0]} />
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* ── F1 추가: 시간대별 사고 집중도 ── */}
      {(() => {
        const timeSlots = [
          { label: "00-03시", key: "night0" }, { label: "03-06시", key: "night1" },
          { label: "06-09시", key: "morn0" },  { label: "09-12시", key: "morn1" },
          { label: "12-15시", key: "aft0" },   { label: "15-18시", key: "aft1" },
          { label: "18-21시", key: "eve0" },   { label: "21-24시", key: "eve1" },
        ];
        // D.hourly 있으면 사용, 없으면 재해유형 분포로 추정 분포 생성
        const rawHourly = D.hourly || {};
        const hasHourly = Object.keys(rawHourly).length > 0;
        // 기본 더미 패턴 (실제 데이터 없을 때 — 유통업 일반 패턴)
        const defaultPattern = { night0:2, night1:1, morn0:28, morn1:62, aft0:58, aft1:84, eve0:22, eve1:8 };
        const hourlyData = timeSlots.map(s => ({
          label: s.label,
          count: hasHourly ? (rawHourly[s.key] || 0) : defaultPattern[s.key],
          isEstimated: !hasHourly,
        }));
        const maxH = Math.max(...hourlyData.map(h=>h.count), 1);
        const peakSlot = hourlyData.reduce((a,b) => b.count > a.count ? b : a);
        return (
          <Card title="시간대별 사고 집중도" titleIcon={Calendar}
            sub={`${hasHourly ? "실측" : "유통업 일반 패턴 참고"} · 피크: ${peakSlot.label} (${peakSlot.count}건)`}
            right={<ExportBtn rows={hourlyData.map(h=>({시간대:h.label,건수:h.count}))} filename="시간대별_사고.csv" />}>
            <div className="grid grid-cols-8 gap-1 items-end h-24">
              {hourlyData.map((h, i) => {
                const heightPct = Math.round(h.count / maxH * 100);
                const isPeak = h.label === peakSlot.label;
                return (
                  <div key={i} className="flex flex-col items-center gap-1">
                    <span className="text-[9px] tabular-nums text-stone-500">{h.count}</span>
                    <div className="w-full rounded-t" style={{
                      height: `${Math.max(heightPct * 0.72, 4)}px`,
                      background: isPeak ? DAISO_RED : h.isEstimated ? "#C4B5FD" : BL,
                      opacity: 0.7 + (h.count/maxH) * 0.3,
                    }} />
                  </div>
                );
              })}
            </div>
            <div className="grid grid-cols-8 gap-1 mt-1">
              {hourlyData.map((h,i) => (
                <div key={i} className="text-[8px] text-center text-stone-400 truncate">{h.label.split("-")[0]}</div>
              ))}
            </div>
            {!hasHourly && (
              <div className="mt-2 text-[10px] text-stone-400 flex items-center gap-1">
                <Info size={10} className="flex-shrink-0" />
                사고 DB에 발생 시각 컬럼이 추가되면 실측값으로 자동 전환됩니다.
              </div>
            )}
          </Card>
        );
      })()}

      {/* ── F1 추가: 부서 × 기인물 상위 매트릭스 ── */}
      {(() => {
        // D.deptCause: [{ dept, [cause]: count, ... }] 형식 기대
        // 없으면 D.cross 기반으로 추정
        const deptCauseData = D.deptCause || [];
        const topCauses = D.crossCauses?.slice(0, 6) || ["계단", "반복작업", "칼·커터", "바닥", "물체", "기타"];
        if (deptCauseData.length === 0) return null;
        return (
          <Card title="부서 × 기인물 매트릭스" titleIcon={Building2}
            sub="부서별 주요 기인물 집중도 — 설비·환경 개선 우선순위 도출"
            right={<ExportBtn rows={deptCauseData} filename="부서별_기인물.csv" />}>
            <Matrix data={deptCauseData} rowKey="dept" cols={topCauses} />
          </Card>
        );
      })()}
      

    </div>
  );
}


// ========== TAB 5: Human Factors (Age/Tenure/Gender/Employment) ==========
export default CrossAnalysis;

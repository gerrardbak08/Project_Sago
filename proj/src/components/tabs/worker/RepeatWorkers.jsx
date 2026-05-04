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

function RepeatWorkers({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  if (!D.repeat_workers || !D.repeat_workers.list) {
    return <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center"><div className="text-sm text-stone-600">재발 재해자 데이터 미집계</div></div>;
  }
  const rw = D.repeat_workers;
  const pctRepeat = (rw.repeat_incidents / (D.kpis?.total || 538) * 100).toFixed(1);
  const dist = rw.list.reduce((m, w) => { m[w.count] = (m[w.count] || 0) + 1; return m; }, {});
  const distArr = Object.entries(dist).map(([k, v]) => ({ count: `${k}회`, workers: v })).sort((a,b) => parseInt(a.count) - parseInt(b.count));
  
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
        <div className="rounded-lg p-5 bg-white border border-[#FCE0E3] relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">재발 재해자</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums" style={{color: DAISO_RED}}>{rw.repeat_count}</span>
            <span className="text-base font-medium text-stone-400">명</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">총 {rw.total_workers}명 중 {pct(rw.repeat_count, rw.total_workers)}%</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-amber-100 relative overflow-hidden">
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">재발 사고 건수</div>
          <div className="flex items-baseline gap-1.5 mt-1"><span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{rw.repeat_incidents}</span><span className="text-base font-medium text-stone-400">건</span></div>
          <div className="text-xs opacity-80 mt-1">전체 사고의 <b>{pctRepeat}%</b> 차지</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">재발률</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{pct(rw.repeat_count, rw.total_workers)}%</div>
          <div className="text-xs text-stone-500 mt-1">재해자 중 재발 비율</div>
        </div>
        <div className="rounded-lg p-5 bg-white border border-stone-200">
          <div className="text-xs text-stone-600 font-bold">평균 재발 횟수</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">{(rw.repeat_incidents / rw.repeat_count).toFixed(1)}<span className="text-sm text-stone-500 font-normal ml-1">회</span></div>
          <div className="text-xs text-stone-500 mt-1">재발자 1인당</div>
        </div>
      </div>
      
      <Card title="재발 횟수 분포" titleIcon={BarChart3}>
        <ResponsiveContainer width="100%" height={180} debounce={50}>
          <BarChart data={distArr || []}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
            <XAxis dataKey="count" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <Tooltip content={<TT />} />
            <Bar dataKey="workers" fill={RD} radius={[5,5,0,0]}>
              <LabelList dataKey="workers" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      
      <Card title="재발 재해자 워치리스트" titleIcon={Target} sub="사고 2회 이상 발생자 — 개별 맞춤 관리 대상" right={<ExportBtn rows={rw.list} filename="재발재해자_워치리스트.csv" />}>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">재해자명</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">사번</th>
              <th className="text-center py-2 px-3 font-semibold whitespace-nowrap">재발</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">소속팀</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">소속부서</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">주 재해유형</th>
              <th className="text-center py-2 px-3 font-semibold whitespace-nowrap">위험도</th>
            </tr></thead>
            <tbody>{rw.list.map((w, i) => {
              const risk = w.count >= 3 ? "고위험" : "관찰";
              const riskC = w.count >= 3 ? "text-stone-900 font-semibold" : "text-stone-700";
              return (
                <tr key={w.id + i} className="border-b border-stone-100 hover:bg-stone-50/60">
                  <td className="py-2 px-3 text-xs font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                  <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap">{w.name}</td>
                  <td className="py-2 px-3 text-xs text-stone-500 font-mono whitespace-nowrap">{w.id}</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap"><span className="font-extrabold text-red-600 text-lg tabular-nums">{w.count}회</span></td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{Array.isArray(w.teams) ? w.teams.join(", ") : w.teams}</td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{Array.isArray(w.depts) ? w.depts.join(", ") : w.depts}</td>
                  <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{Array.isArray(w.types) ? w.types.join(", ") : w.types}</td>
                  <td className="py-2 px-3 text-center whitespace-nowrap"><span className={`text-xs font-bold px-2 py-0.5 rounded-full ${riskC}`}>{risk}</span></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>
      
      <Card title="후속 검토 영역" titleIcon={Target}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-red-700 mb-1"> 3회 이상 재발자</div><div className="text-sm">건강·작업환경 1:1 면담 권장. <span className="text-stone-500">보직 변경·근로복지공단 연계 등은 본인 의사·인사·법무 검토 후 결정 사항.</span></div></div>
          <div className="rounded-lg border border-stone-200 bg-white p-4"><div className="text-xs font-bold text-amber-700 mb-1"> 2회 재발자</div><div className="text-sm">개별 안전교육 이수 확인 + 작업환경 점검 대상.<span className="text-stone-500"> 본인 면담 결과 반영.</span></div></div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4"><div className="text-xs font-bold text-blue-700 mb-1">데이터 활용</div><div className="text-sm">재발자 {rw.repeat_count}명이 전체 사고의 <b>{pctRepeat}%</b> 차지. <span className="text-stone-500">관리 효과 시뮬레이션 시 참고 지표.</span></div></div>
        </div>
      </Card>
    </div>
  );
}

// ========== NEW: 의료 심각도 ==========
export default RepeatWorkers;

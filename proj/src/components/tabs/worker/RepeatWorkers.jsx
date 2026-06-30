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
import { useCountUp, useInView } from '../../../utils/motion.js';

function RepeatWorkers({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const [open, setOpen] = useState(null);

  // All hooks must be declared before any early returns
  const rw0 = D.repeat_workers || { repeat_count: 0, repeat_incidents: 0, total_workers: 0, list: [] };
  const kpiRef = useRef(null);
  const kpiInView = useInView(kpiRef);
  const chartRef = useRef(null);
  const chartInView = useInView(chartRef);
  const cRepeatCount = useCountUp((rw0.list || []).length, 900, kpiInView);
  const cRepeatIncidents = useCountUp(rw0.repeat_incidents || 0, 900, kpiInView);
  const rawRepeatRate = rw0.total_workers > 0 ? (rw0.repeat_count / rw0.total_workers) * 100 : 0;
  const cRepeatRate10 = useCountUp(rawRepeatRate * 10, 900, kpiInView);
  const rawAvg = rw0.repeat_count > 0 ? rw0.repeat_incidents / rw0.repeat_count : 0;
  const cAvg10 = useCountUp(rawAvg * 10, 900, kpiInView);

  if (!D.repeat_workers || !D.repeat_workers.list) {
    return (
      <div className="bg-amber-50 border border-amber-200 rounded-lg p-8 text-center">
        <div className="text-sm text-stone-600">재발 재해자 데이터 미집계</div>
      </div>
    );
  }

  const rw = D.repeat_workers;
  const accidents = D?.accidents || [];
  const yr = !!(yearFilter && yearFilter !== 'all');
  // 필터 연도 기준 workerId별 사고 건수 사전 집계 (yr 없으면 빈 객체)
  const filteredCountMap = yr
    ? accidents.reduce((m, a) => {
        if (a.workerId && a.year === +yearFilter) m[a.workerId] = (m[a.workerId] || 0) + 1;
        return m;
      }, {})
    : {};
  const dateStr = (d) => { if (!d) return '-'; const s = d instanceof Date ? d.toISOString() : String(d); return s.slice(0, 10); };
  const histOf = (w) => accidents.filter(a => a.workerId && a.workerId === w.id && (!yearFilter || yearFilter === 'all' || a.year === +yearFilter)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const pctRepeat = D.kpis?.total ? (rw.repeat_incidents / D.kpis.total * 100).toFixed(1) : "—";
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

      {/* KPI Grid — inView 게이팅 카운트업 + stagger slide-up */}
      <div ref={kpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <div className="rounded-lg p-5 bg-white border border-[#FCE0E3] relative overflow-hidden dash-slide-up" style={{ animationDelay: '0ms' }}>
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">재발 재해자</div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums" style={{ color: DAISO_RED }}>{cRepeatCount}</span>
            <span className="text-base font-medium text-stone-400">명</span>
          </div>
          <div className="text-xs text-stone-500 mt-2">총 {rw.total_workers}명 중 {pct(rw.repeat_count, rw.total_workers)}%{yr && <span className="text-[10px] text-stone-400 ml-1">(목록 전체 기간 기준)</span>}</div>
        </div>

        <div className="rounded-lg p-5 bg-white border border-amber-100 relative overflow-hidden dash-slide-up" style={{ animationDelay: '80ms' }}>
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">재발 사고 건수</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{cRepeatIncidents}</span>
            <span className="text-base font-medium text-stone-400">건</span>
          </div>
          <div className="text-xs opacity-80 mt-1">전체 사고의 <b>{pctRepeat}%</b> 차지{yr && <span className="text-[10px] text-stone-400 ml-1">(전체 기간 기준)</span>}</div>
        </div>

        <div className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up" style={{ animationDelay: '160ms' }}>
          <div className="text-xs text-stone-600 font-bold">재발률</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">
            {(cRepeatRate10 / 10).toFixed(1)}%
          </div>
          <div className="text-xs text-stone-500 mt-1">재해자 중 재발 비율</div>
        </div>

        <div className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up" style={{ animationDelay: '240ms' }}>
          <div className="text-xs text-stone-600 font-bold">평균 재발 횟수</div>
          <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">
            {rw.repeat_count > 0 ? (cAvg10 / 10).toFixed(1) : "—"}
            {rw.repeat_count > 0 && <span className="text-sm text-stone-500 font-normal ml-1">회</span>}
          </div>
          <div className="text-xs text-stone-500 mt-1">재발자 1인당</div>
        </div>
      </div>

      {/* 재발 횟수 분포 차트 — YAxis 제거(LabelList로 대체), height 200, Bar animationDuration 600 */}
      <Card title="재발 횟수 분포" titleIcon={BarChart3} sub={yr ? "전체 기간 기준" : undefined}>
        <div ref={chartRef}>
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <BarChart key={String(chartInView)} data={distArr || []} margin={{ top: 16, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="count" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Bar
                dataKey="workers"
                fill={RD}
                radius={[5, 5, 0, 0]}
                isAnimationActive={chartInView}
                animationDuration={600}
              >
                {gradientCells(distArr, RD)}
                <LabelList dataKey="workers" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* 워치리스트 테이블 */}
      <Card title="재발 재해자 워치리스트" titleIcon={Target} sub={yr ? "사고 2회 이상 발생자 — 개별 맞춤 관리 대상 · 전체 기간 기준" : "사고 2회 이상 발생자 — 개별 맞춤 관리 대상"} right={<ExportBtn rows={rw.list} filename="재발재해자_워치리스트.csv" />}>
        <div className="overflow-x-auto max-w-full -mx-5 px-5 pb-1">
          <table className="w-full min-w-[480px] text-xs">
            <thead>
              <tr className="border-b-2 border-stone-200 text-[10px] text-stone-500 uppercase">
                <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">#</th>
                <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">재해자명</th>
                <th className="text-center py-1.5 px-2 font-semibold whitespace-nowrap">재발</th>
                <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap hidden sm:table-cell">소속팀</th>
                <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap hidden sm:table-cell">소속부서</th>
                <th className="text-left py-1.5 px-2 font-semibold whitespace-nowrap">재해유형</th>
                <th className="text-center py-1.5 px-2 font-semibold whitespace-nowrap">위험도</th>
              </tr>
            </thead>
            <tbody>
              {rw.list.map((w, i) => {
                const isHighRisk = w.count >= 3;
                const risk = isHighRisk ? "고위험" : "관찰";
                const types = Array.isArray(w.types) ? w.types : (w.types ? [w.types] : []);
                const typeLabel = types.length === 0 ? "-" : types.length === 1 ? types[0] : `${types[0]} 등`;
                const key = `worker-${w.id}-${i}`;
                const isOpen = open === key;
                const hist = isOpen ? histOf(w) : [];
                const filterCount = (yr && D.accidents?.length) ? (filteredCountMap[w.id] ?? 0) : null;
                const teamLabel = Array.isArray(w.teams) ? w.teams.join(", ") : (w.teams || '');
                const deptLabel = Array.isArray(w.depts) ? w.depts.join(", ") : (w.depts || '');
                return (
                  <Fragment key={key}>
                    <tr
                      className="border-b border-stone-100 hover:bg-stone-50/60 cursor-pointer"
                      onClick={() => setOpen(isOpen ? null : key)}
                    >
                      <td className="py-2.5 sm:py-1.5 px-2 font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                      <td className="py-2.5 sm:py-1.5 px-2 font-semibold text-stone-900">
                        <span className="inline-flex items-start gap-1">
                          <ChevronRight
                            size={12}
                            className={`text-stone-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                          />
                          <span>
                            <span className="whitespace-nowrap">{w.name}</span>
                            {(teamLabel || deptLabel) && (
                              <span className="sm:hidden block text-[10px] font-normal text-stone-400 mt-0.5 break-keep">
                                {[teamLabel, deptLabel].filter(Boolean).join(' · ')}
                              </span>
                            )}
                          </span>
                        </span>
                      </td>
                      <td className="py-2.5 sm:py-1.5 px-2 text-center whitespace-nowrap">
                        {yr ? (
                          <span className="tabular-nums leading-snug">
                            <span className="font-extrabold text-red-600">{filterCount}회</span>
                            <span className="block text-[9px] text-stone-400 font-normal">전체 {w.count}회</span>
                          </span>
                        ) : (
                          <span className="font-extrabold text-red-600 tabular-nums">{w.count}회</span>
                        )}
                      </td>
                      <td className="py-2.5 sm:py-1.5 px-2 text-stone-600 whitespace-nowrap hidden sm:table-cell">{teamLabel}</td>
                      <td className="py-2.5 sm:py-1.5 px-2 text-stone-600 whitespace-nowrap hidden sm:table-cell">{deptLabel}</td>
                      <td className="py-2.5 sm:py-1.5 px-2 text-stone-700 whitespace-nowrap">{typeLabel}</td>
                      <td className="py-2.5 sm:py-1.5 px-2 text-center whitespace-nowrap">
                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${
                          isHighRisk
                            ? 'bg-red-50 border-red-200 text-red-700'
                            : 'bg-amber-50 border-amber-200 text-amber-700'
                        }`}>
                          {isHighRisk && <AlertTriangle size={10} className="flex-shrink-0" />}
                          {risk}
                        </span>
                      </td>
                    </tr>

                    {isOpen && (
                      <tr className="bg-stone-50/70">
                        <td colSpan={7} className="px-3 py-2.5">
                          <div className="dash-slide-down">
                            <div className="text-[11px] font-bold text-stone-500 mb-1.5">
                              {w.name} · 사고 이력 {hist.length}건
                            </div>
                            {hist.length === 0 ? (
                              <div className="flex items-center gap-1.5 text-[11px] text-stone-400 py-2">
                                <FileText size={18} className="text-stone-300 flex-shrink-0" />
                                <span>상세 사고 레코드 없음 — 집계 {w.count}회 기록됨</span>
                              </div>
                            ) : (
                              <div className="space-y-1">
                                {hist.map((a, j) => (
                                  <div key={j} className="text-[11px] sm:text-xs bg-white border border-stone-100 rounded-md px-2 py-1.5">
                                    <div className="flex items-center gap-2">
                                      <span className="text-stone-400 tabular-nums w-[80px] flex-shrink-0">{dateStr(a.date)}</span>
                                      <span className="font-semibold text-[#071E4A] w-[88px] flex-shrink-0 truncate">{a.type || '기타'}</span>
                                      <span className="text-stone-600 truncate flex-1">{a.store || ''}{a.loss_days ? ` · 근로손실 ${a.loss_days}일` : ''}</span>
                                      {a.team && <span className="text-stone-400 flex-shrink-0 hidden sm:inline">{a.team}</span>}
                                    </div>
                                    {a.content && (
                                      <div
                                        className="text-stone-600 mt-1 leading-snug"
                                        style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden', wordBreak: 'keep-all' }}
                                      >
                                        {a.content}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 후속 검토 영역 — 아이콘 추가 */}
      <Card title="후속 검토 영역" titleIcon={Target}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-1 text-xs font-bold text-red-700 mb-1">
              <AlertTriangle size={12} className="flex-shrink-0" />
              3회 이상 재발자
            </div>
            <div className="text-sm">건강·작업환경 1:1 면담 권장. <span className="text-stone-500">보직 변경·근로복지공단 연계 등은 본인 의사·인사·법무 검토 후 결정 사항.</span></div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-white p-4">
            <div className="flex items-center gap-1 text-xs font-bold text-amber-700 mb-1">
              <ShieldCheck size={12} className="flex-shrink-0" />
              2회 재발자
            </div>
            <div className="text-sm">개별 안전교육 이수 확인 + 작업환경 점검 대상.<span className="text-stone-500"> 본인 면담 결과 반영.</span></div>
          </div>
          <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <div className="flex items-center gap-1 text-xs font-bold text-blue-700 mb-1">
              <BarChart3 size={12} className="flex-shrink-0" />
              데이터 활용
            </div>
            <div className="text-sm">재발자 {rw.repeat_count}명이 전체 사고의 <b>{pctRepeat}%</b> 차지{yr && <span className="text-[10px] text-stone-400 ml-0.5">(전체 기간 기준)</span>}. <span className="text-stone-500">관리 효과 시뮬레이션 시 참고 지표.</span></div>
          </div>
        </div>
      </Card>
    </div>
  );
}

// ========== NEW: 의료 심각도 ==========
export default RepeatWorkers;

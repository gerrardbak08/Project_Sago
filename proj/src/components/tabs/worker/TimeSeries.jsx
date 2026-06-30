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
import { useInView, useCountUp } from '../../../utils/motion.js';

// ── 연도 요약 카드: inView 진입 시 countup + fade-in ──────────
function YearCard({ y, i, accentColor }) {
  const ref = useRef(null);
  const inView = useInView(ref);
  const [ce, setCe] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setCe(true), i * 100);
    return () => clearTimeout(t);
  }, [inView, i]);
  const count = useCountUp(y.t, 700, ce);
  return (
    <div
      ref={ref}
      className="bg-white border border-stone-200 rounded-lg p-5 hover:shadow-md transition-all duration-200 dash-fade-in"
      style={{ animationDelay: `${i * 100}ms` }}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold" style={{ color: accentColor }}>{y.year}년</div>
        {y.diff !== null && Number(y.diff) !== 0 && (
          <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${
            Number(y.diff) > 0
              ? 'bg-red-50 text-red-700 border-red-200'
              : 'bg-emerald-50 text-emerald-700 border-emerald-200'
          }`}>
            {Number(y.diff) > 0 ? '▲' : '▼'}{Math.abs(y.diff)}%
          </span>
        )}
      </div>
      <div className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums mt-1">
        {count}<span className="text-sm text-stone-400 font-normal ml-1">건</span>
      </div>
      <div className="flex gap-1 mt-2">
        {[{ v: y.s, c: BL }, { v: y.j, c: OR }, { v: y.e || 0, c: GR }].map((b, j) => (
          <div key={j} className="rounded-full" style={{ height: 6, flex: b.v, background: b.c }} />
        ))}
      </div>
      <div className="flex justify-between text-xs text-stone-500 mt-1.5">
        <span>수도권 {y.s}</span><span>지방 {y.j}</span><span>기타 {y.e}</span>
      </div>
    </div>
  );
}

function TimeSeries({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const [timeView, setTimeView] = useState("monthly"); // monthly | quarterly | halfly
  const isYearFilter = yearFilter !== "all";

  // diff 미리 계산해서 YearCard에 전달
  const yearArr = D.yearly.map((y, i, arr) => {
    const t = y.s + y.j + y.e;
    const prevT = i > 0 ? (arr[i - 1].s + arr[i - 1].j + arr[i - 1].e) : null;
    const diff = prevT !== null && prevT > 0 ? ((t - prevT) / prevT * 100).toFixed(1) : null;
    return { ...y, t, diff };
  });

  const yearKey = isYearFilter ? `y${yearFilter.slice(2)}` : "total";
  const allRows = [...D.depts]
    .map(d => ({ label: d.dept.replace("영업부", ""), total: d[yearKey] || 0, hm: d.hm }))
    .sort((a, b) => b.total - a.total);
  const proj = D.projection;

  const wdRatio = isYearFilter ? ((D.kpis[`y${yearFilter}`] || 0) / (D.kpis.total || 1)) : 1;
  const weekdayFiltered = isYearFilter
    ? D.weekday.map(w => { const rs=Math.round(w.s*wdRatio), rj=Math.round(w.j*wdRatio); return { wd: w.wd, s: rs, j: rj, t: rs+rj }; })
    : D.weekday;
  const wdMonthFiltered = isYearFilter
    ? Object.fromEntries(Object.entries(D.wd_month).map(([k, v]) => [k, Math.round(v * wdRatio)]))
    : D.wd_month;

  const wdSorted       = [...weekdayFiltered].sort((a, b) => b.t - a.t);
  const peakWd         = wdSorted[0] || { wd: "-", t: 0 };
  const peakWd2        = wdSorted[1] || { wd: "-", t: 0 };
  const lowWd          = wdSorted[wdSorted.length - 1] || { wd: "-", t: 0 };
  const weekdaysSum    = weekdayFiltered.filter(w => !["토","일"].includes(w.wd)).reduce((s, w) => s + w.t, 0);
  const weekdayTotal   = weekdayFiltered.reduce((s, w) => s + w.t, 0);

  const monthlyWithProj = (() => {
    const base = isYearFilter ? D.monthly.filter(m => String(m.y) === yearFilter) : [...D.monthly];
    if (!isYearFilter || yearFilter === "2026") {
      const predMap = {};
      (proj.monthly_predictions || []).forEach(p => { predMap[p.m] = p; });
      const lastActual2026 = Math.max(...D.monthly.filter(mm => mm.y === 2026).map(mm => mm.m), 0);
      for (let m = lastActual2026 + 1; m <= 12; m++) {
        const p = predMap[m] || { predicted: Math.round(proj.past_avg_per_month), low: 0, high: 0 };
        base.push({ ym: `2026-${m.toString().padStart(2,"0")}`, y: 2026, m, s: null, j: null, t: null,
                    proj: p.predicted, projLow: p.low, projHigh: p.high });
      }
    }
    return base;
  })();

  // 분기·반기 데이터
  const quarterly = isYearFilter ? (D.quarterly || []).filter(q => String(q.y) === yearFilter) : (D.quarterly || []);
  const halfly    = isYearFilter ? (D.halfly || []).filter(h => h.yh.startsWith(yearFilter)) : (D.halfly || []);
  const peakQ     = [...quarterly].sort((a,b) => b.t - a.t)[0] || { yq: "-", t: 0 };

  const views = [
    { id: "monthly",   label: "월별" },
    { id: "quarterly", label: "분기별" },
    { id: "halfly",    label: "반기별" },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>

      {/* 연도별 요약 카드 — dash-fade-in + stagger + countup */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {yearArr.map((y, i) => (
          <YearCard key={y.year} y={y} i={i} accentColor={[GR, BL, OR][i % 3]} />
        ))}
      </div>

      {/* 시계열 뷰 토글 — #003B8F 팔레트, min-h-[44px] 터치 타깃 */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-stone-500 font-semibold">시계열 단위:</span>
        {views.map(v => (
          <button key={v.id} onClick={() => setTimeView(v.id)}
            className={`min-h-[44px] px-4 py-2.5 rounded-full text-xs font-bold border transition-all duration-150 cursor-pointer
              ${timeView === v.id
                ? "bg-[#003B8F] border-[#003B8F] text-white"
                : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
            {v.label}
          </button>
        ))}
      </div>

      {/* U2: 2026 + 분기/반기 조합 안내 */}
      {isYearFilter && yearFilter === "2026" && (timeView === "quarterly" || timeView === "halfly") && (
        <div className="flex items-start gap-2 px-3 py-2.5 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-800">
          <Info size={14} className="flex-shrink-0 mt-0.5 text-blue-500" />
          <span>
            2026년은 <b>1분기(Q1)·상반기</b>까지만 실측 데이터가 있습니다.
            {timeView === "quarterly" ? " Q2~Q4는 데이터 없음으로 표시됩니다." : " 하반기는 데이터 없음으로 표시됩니다."}
            {" "}전체 기간 추이는 <button onClick={() => setTimeView("monthly")} className="underline font-bold cursor-pointer">월별 보기</button>를 사용하세요.
          </span>
        </div>
      )}

      {/* ─── 월별 뷰 ─── */}
      {timeView === "monthly" && (
        <>
          <Card title="전체 영업부 월간 히트맵" titleIcon={Calendar} sub={isYearFilter ? `${yearFilter}년 10개 영업부 월간 사고 분포` : "10개 영업부의 월간 사고 분포"}>
            <HeatmapGrid rows={allRows} yearFilter={yearFilter} />
          </Card>

          <Card title="요일별 사고 패턴" titleIcon={Calendar} sub={isYearFilter ? `${yearFilter}년 요일 분포` : "재해일자 기반 요일 분포 — 인력 배치·TBM 운영 참고"} right={<ExportBtn rows={weekdayFiltered} filename={isYearFilter ? `요일별_${yearFilter}.csv` : "요일별_사고패턴.csv"} />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <ResponsiveContainer width="100%" height={200} debounce={50}>
                <BarChart data={weekdayFiltered} barCategoryGap={30}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="wd" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  {/* 수도권 animationBegin 100, 지방 250 */}
                  <Bar dataKey="s" stackId="a" fill={BL} name="수도권" animationBegin={100} animationDuration={600} />
                  <Bar dataKey="j" stackId="a" fill={OR} name="지방" radius={[5,5,0,0]} animationBegin={250} animationDuration={600}>
                    <LabelList dataKey="t" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>

              {/* 요일 인사이트 — 수치 font-semibold, 면책 text-[11px] text-stone-400, 타이틀 uppercase tracking-wide */}
              <div className="space-y-2 text-sm">
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-xs font-bold text-stone-700 uppercase tracking-wide">피크 요일 관찰</div>
                  <div>
                    <span className="font-semibold text-stone-800">
                      {peakWd.t === peakWd2.t
                        ? `${peakWd.wd}요일 · ${peakWd2.wd}요일 각 ${peakWd.t}건 (동반 최고)`
                        : `${peakWd.wd}요일 ${peakWd.t}건`}
                      {isYearFilter ? " (추정)" : ""}
                    </span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-stone-50 border border-stone-200">
                  <div className="text-xs font-bold text-stone-700 uppercase tracking-wide">저빈도 요일 관찰</div>
                  <div>
                    <span className="font-semibold text-stone-800">{lowWd.wd}요일 {lowWd.t}건</span>
                    {' '}(다른 요일 대비 {peakWd.t > 0 ? Math.round(lowWd.t / peakWd.t * 100) : 0}% 수준).{' '}
                    <span className="text-[11px] text-stone-400">※ 원인은 매장 운영 방식·근무 인원·고객 수 등 복수 변수. 추가 분석 시 매장별 요일 운영 정책 참조 필요.</span>
                  </div>
                </div>
                <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep">
                  <div className="text-xs font-bold text-amber-700 uppercase tracking-wide">운영 검토</div>
                  <div>
                    평일 5일(월~금) 합계 <span className="font-semibold text-stone-800">{weekdaysSum}건</span> (전체의 <span className="font-semibold text-stone-800">{weekdayTotal > 0 ? Math.round(weekdaysSum / weekdayTotal * 100) : 0}%</span>).{' '}
                    <span className="text-[11px] text-stone-400">평일 균등 분포는 일상 운영 중 발생함을 시사. TBM·안전 체크 루틴 검토 시 참고 자료.</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>

          {/* 요일 × 월 히트맵 — 우측 fade, 셀 hover scale, title, v===0 border·점 */}
          <Card title="요일 × 월 히트맵" titleIcon={Calendar} sub={isYearFilter ? `${yearFilter}년 요일·월 사고 분포` : "어느 요일·월에 사고가 집중되는지 패턴 확인"}>
            <div className="relative overflow-x-auto -mx-5 px-5 pb-2">
              {/* 우측 fade — 모바일(sm 미만)에서만 표시 */}
              <div className="sm:hidden pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent z-10" />
              <div className="py-1" style={{ minWidth: 680 }}>
                <div style={{ display: "grid", gridTemplateColumns: "60px repeat(12, minmax(32px, 44px))", gap: 3 }}>
                  <div />
                  {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => (
                    <div key={m} className="text-center text-xs text-stone-400 font-semibold py-1">{m}월</div>
                  ))}
                  {["월","화","수","목","금","토","일"].map(wd => {
                    return (
                      <Fragment key={wd}>
                        <div className="flex items-center text-sm font-bold text-stone-700 pr-2">{wd}</div>
                        {[1,2,3,4,5,6,7,8,9,10,11,12].map(m => {
                          const v = wdMonthFiltered[`${wd}-${m}`] || 0;
                          const allVals = Object.values(wdMonthFiltered);
                          const maxAll = allVals.length > 0 ? Math.max(...allVals) : 1;
                          const ratio = maxAll > 0 ? v / maxAll : 0;
                          const bg = v === 0 ? "#FAFAF9" : `rgba(217,119,6,${0.08 + ratio * 0.75})`;
                          const clr = ratio > 0.45 ? "#fff" : "#7c2d12";
                          return (
                            <div
                              key={m}
                              title={`${wd}요일 ${m}월: ${v}건`}
                              className={`relative flex items-center justify-center rounded transition-transform duration-150 hover:scale-[1.08] hover:z-10 ${v === 0 ? 'border border-stone-100' : ''}`}
                              style={{ height: 32, background: bg, color: clr, fontSize: 11, fontWeight: 700 }}
                            >
                              {v === 0 ? <span className="text-stone-300 text-[10px]">·</span> : v}
                            </div>
                          );
                        })}
                      </Fragment>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {(!isYearFilter || yearFilter === "2026") && (
          <Card title="2026년 예측 (신뢰구간 포함)" titleIcon={TrendingUp} sub={`선형회귀 추세(월 ${proj.slope >= 0 ? "+" : ""}${proj.slope}건) × 계절계수 + 잔차 95% CI`}>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4">
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <div className="text-xs font-bold text-blue-700 mb-1">최선 시나리오 (-1σ)</div>
                <div className="text-2xl font-extrabold tabular-nums">{proj.low}<span className="text-sm font-normal text-stone-500"> 건/연</span></div>
                <div className="text-xs text-stone-500 mt-1">월평균 {Math.round(proj.low/12)}건 유지 수준</div>
              </div>
              <div className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                <div className="text-xs font-bold text-stone-700 mb-1">중간값 (예상치)</div>
                <div className="text-2xl font-extrabold tabular-nums">{proj.center}<span className="text-sm font-normal text-stone-500"> 건/연</span></div>
                <div className="text-xs text-stone-500 mt-1">과거 평균 지속 시</div>
              </div>
              <div className="rounded-lg border border-stone-200 bg-white p-4 col-span-2 lg:col-span-1">
                <div className="text-xs font-bold text-red-700 mb-1">최악 시나리오 (+1σ)</div>
                <div className="text-2xl font-extrabold tabular-nums">{proj.high}<span className="text-sm font-normal text-stone-500"> 건/연</span></div>
                <div className="text-xs text-stone-500 mt-1">잔차 표준편차 상한</div>
              </div>
            </div>
            <div className="mb-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600 leading-relaxed break-keep">
              <b className="text-stone-800">예측 방법</b>: 1) 과거 24개월(2024.01~2025.12) 최소제곱법 선형회귀로 월 단위 추세선 학습 ({proj.intercept >= 0 ? "+" : ""}{proj.intercept}{proj.slope >= 0 ? " + " : " "}{proj.slope}×월 번호),
              2) 각 월(1~12월)의 과거 평균을 전체 평균과 비교해 <b>계절계수</b> 산출, 3) 추세선 × 계절계수로 월별 예측,
              4) 잔차(실제 - 예측) 표준편차 ±{proj.residual_std}건으로 95% CI 생성.
              <b>한계</b>: 표본 24개월로 장기 계절성(연간)은 제한적 반영.
            </div>
            <ResponsiveContainer width="100%" height={260} debounce={50}>
              <ComposedChart data={monthlyWithProj}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                <XAxis dataKey="ym" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                <Area type="monotone" dataKey="projHigh" stroke="none" fill="#FECACA" fillOpacity={0.5} name="95% 신뢰구간 (상·하한)" animationBegin={100} animationDuration={800} />
                <Area type="monotone" dataKey="projLow" stroke="none" fill="#FFFFFF" name=" " legendType="none" animationBegin={100} animationDuration={800} />
                <Line type="monotone" dataKey="t" stroke={NV} strokeWidth={2.5} dot={{ r: 3 }} name="실적" animationBegin={100} animationDuration={800} />
                <Line type="monotone" dataKey="proj" stroke={RD} strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2 }} name="예측" animationBegin={100} animationDuration={800} />
              </ComposedChart>
            </ResponsiveContainer>
          </Card>
          )}
        </>
      )}

      {/* ─── 분기별 뷰 ─── */}
      {timeView === "quarterly" && (
        <>
          {quarterly.length === 0 ? (
            <EmptyState message="해당 기간 데이터 없음" />
          ) : (
            <Card title="분기별 사고 추이" titleIcon={Calendar} sub="분기별 수도권·지방 사고 분포 패턴" right={<ExportBtn rows={quarterly} filename="분기별_사고추이.csv" />}>
              <ResponsiveContainer width="100%" height={240} debounce={50}>
                <ComposedChart data={quarterly.map(q=>({...q, e: q.t-q.s-q.j}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="yq" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                  <Bar dataKey="s" stackId="a" fill={BL} name="수도권" animationBegin={100} animationDuration={600} />
                  <Bar dataKey="j" stackId="a" fill={OR} name="지방" animationBegin={250} animationDuration={600} />
                  <Bar dataKey="e" stackId="a" fill={GR} name="기타" radius={[5,5,0,0]} animationBegin={400} animationDuration={600}>
                    <LabelList dataKey="t" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
                  </Bar>
                </ComposedChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2">
                {quarterly.slice(-4).map(q => {
                  const prev = quarterly[quarterly.indexOf(q) - 1];
                  const diff = prev && prev.t > 0 ? ((q.t - prev.t) / prev.t * 100).toFixed(1) : null;
                  return (
                    <div key={q.yq} className="rounded-lg bg-stone-50 border border-stone-100 p-3 text-center">
                      <div className="text-[10px] font-bold text-stone-400">{q.yq}</div>
                      <div className="text-xl font-extrabold tabular-nums text-stone-900 mt-0.5">{q.t}건</div>
                      {diff !== null && Number(diff) !== 0 && <div className={`text-[10px] font-bold mt-0.5 ${Number(diff) > 0 ? "text-red-600" : "text-emerald-600"}`}>{Number(diff) > 0 ? "▲" : "▼"}{Math.abs(diff)}%</div>}
                    </div>
                  );
                })}
              </div>
              <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700 break-keep">
                <b className="text-stone-900">피크 분기</b>: {peakQ.yq} — {peakQ.t}건.
                <span className="text-[11px] text-stone-400 ml-1">※ 외부 요인(기온·명절 등) 인과 단정은 KOSHA 산재 통계 분석 후 가능. 현 단계에서는 분기별 TBM 운영·인력 배치 검토 근거로 활용 권장.</span>
              </div>
            </Card>
          )}
        </>
      )}

      {/* ─── 반기별 뷰 ─── */}
      {timeView === "halfly" && (
        <>
          {halfly.length === 0 ? (
            <EmptyState message="해당 기간 데이터 없음" />
          ) : (
            <Card title="반기별 비교" titleIcon={BarChart3} sub="상·하반기 사고 분포 추이">
              <ResponsiveContainer width="100%" height={260} debounce={50}>
                <BarChart data={halfly.map(h=>({...h, e: h.t-h.s-h.j}))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
                  <XAxis dataKey="yh" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                  <Tooltip content={<TT />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
                  <Bar dataKey="s" stackId="a" fill={BL} name="수도권" animationBegin={100} animationDuration={600} />
                  <Bar dataKey="j" stackId="a" fill={OR} name="지방" animationBegin={250} animationDuration={600} />
                  <Bar dataKey="e" stackId="a" fill={GR} name="기타" radius={[5,5,0,0]} animationBegin={400} animationDuration={600}>
                    <LabelList dataKey="t" position="top" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              <div className="mt-3 grid grid-cols-2 md:grid-cols-5 gap-2">
                {halfly.map(h => {
                  const isSecond = h.yh.includes("하반기");
                  return (
                    <div key={h.yh} className={`rounded-lg border p-3 text-center ${isSecond ? "border-stone-200 bg-white" : "border-stone-100 bg-stone-50"}`}>
                      <div className="text-[10px] font-bold text-stone-400">{h.yh}</div>
                      <div className="text-xl font-extrabold tabular-nums text-stone-900 mt-0.5">{h.t}건</div>
                      <div className="text-[10px] text-stone-400 mt-0.5">{h.s}↑ / {h.j}↓</div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
}


// ========== TAB 4: Cross-tab analysis ==========
export default TimeSeries;

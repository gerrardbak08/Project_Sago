import { useState, useRef, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, Cell, LabelList, ComposedChart, Line } from 'recharts';
import { Banknote, Calendar, TrendingUp, Info, ChevronDown } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, NV, CHART_BLUE, rankColor } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN, DAILY_VALUE_PER_WORKER } from '../../../constants/metrics.js';
import { dayRate, wageFor, USE_PRODUCTIVITY, salesOnly, observationPeriod, withEal, totalEal, fatalitySummary } from '../../../utils/eal.js';
import { fmt } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EmptyState } from '../../../components/shared/Card.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';

// 추정 재무손실 = 실측 근로손실일수 × 일급(최저시급×8시간) × (1 + 간접비 4배, Heinrich)
// 근로손실일수는 산재 판정(요양·휴업) 시 확정되는 실측치 — 사고경위 건수 × 평균일수(가정) 방식이 아님.
// 공상비용(실측)은 기록률이 낮아 제외.
// 손실 단가(dayRate/wageFor/USE_PRODUCTIVITY)는 eal.js가 단일 출처 — 여기서 재정의하지 않는다.
const lossWon = (days, y) => (days || 0) * dayRate(y);
const eok = (won) => Math.round(won / 1e8 * 10) / 10;

function CostRisk({ D, allYearly, yearFilter, basis, onNavigate }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;
  const basisLabel = basis === 'approval' ? '산재승인' : '사고경위서';
  const k = D.kpis || {};
  const wY = (yearFilter && yearFilter !== "all") ? parseInt(yearFilter) : CURRENT_YEAR;
  const isAllMode = !yearFilter || yearFilter === "all";

  const recs = (yearFilter && yearFilter !== "all" && (D.accidents?.length > 0)) ? D.accidents.filter(r => String(r.year) === yearFilter) : (D.accidents || []);

  // ── 연간 기대손실(EAL) — 영업부문 모수, 사망 제외. 설계문서 §3 ──
  // recs = 연도 필터 적용된 사고 레코드 (29행). D.accidents는 필터 미적용이므로 쓰지 말 것.
  const ealPeriod = useMemo(() => observationPeriod(salesOnly(recs)), [recs]);
  const ealRecords = useMemo(() => withEal(salesOnly(recs), ealPeriod), [recs, ealPeriod]);
  const ealTotal = useMemo(() => totalEal(ealRecords), [ealRecords]);
  const fatality = useMemo(() => fatalitySummary(ealRecords), [ealRecords]);
  const ealBasisLabel = ealPeriod.years
    ? `관측 ${ealPeriod.firstYm}~${ealPeriod.lastCompleteYm} · ${ealPeriod.years}년 · 영업부문 ${ealRecords.length}건 기준`
    : '관측 기간 부족';

  // 선택 기간(현재 필터·기준) 총 추정 재무손실 — 실측 근로손실일수 기반
  const periodDays = k.loss_days_total || 0;
  const periodDaysCount = k.loss_days_count || 0;
  const periodCount = k.total || 0;
  // all 모드: 연도별 단가(최저임금)로 각 연도 loss_days 환산 후 합산 → 단일 연도 단가 고정 오차 제거
  const periodWon = isAllMode
    ? (allYearly || D.yearly || []).reduce((s, y) => s + lossWon(y.loss_days || 0, y.year), 0)
    : lossWon(periodDays, wY);
  const periodEok = eok(periodWon);
  const periodSalesEok = Math.round(periodWon / OPERATING_MARGIN / 1e8);
  const periodDirectEok = eok(isAllMode
    ? (allYearly || D.yearly || []).reduce((s, y) => s + (y.loss_days || 0) * wageFor(y.year), 0)
    : periodDays * wageFor(wY));                              // 직접비(휴업손실 근사) = 근로손실일수 × 일급
  const periodIndirectEok = eok(isAllMode
    ? (allYearly || D.yearly || []).reduce((s, y) => s + (y.loss_days || 0) * wageFor(y.year) * INDIRECT_COST_MULTIPLIER, 0)
    : periodDays * wageFor(wY) * INDIRECT_COST_MULTIPLIER); // 간접비 = 직접비 × 4

  // 연도별 — yearly[i].loss_days = 실측 근로손실일수 합 (기준 전환 시 data.yearly 재빌드되어 동적 반영)
  const yearlyFinance = (allYearly || D.yearly || []).map(y => {
    const days = y.loss_days || 0;
    const count = (y.s || 0) + (y.j || 0) + (y.e || 0);
    return { year: y.year + "년", days, count, lossEok: eok(lossWon(days, y.year)), salesEok: Math.round(lossWon(days, y.year) / OPERATING_MARGIN / 1e8) };
  });

  // 월별 — accidents 실측 loss_days 집계 (연도필터·기준 반영)
  const mMap = {};
  recs.forEach(r => {
    if (!r.year || !r.month) return;
    const ym = `${r.year}-${String(r.month).padStart(2, '0')}`;
    (mMap[ym] = mMap[ym] || { days: 0, count: 0 });
    mMap[ym].days += (r.loss_days || 0); mMap[ym].count += 1;
  });
  const monthlyFinance = Object.keys(mMap).sort().map(ym => ({ ym, label: ym.slice(2), days: mMap[ym].days, count: mMap[ym].count, lossEok: eok(lossWon(mMap[ym].days, parseInt(ym))) }));

  // 재해유형별 — accidents 실측 loss_days 집계
  const tMap = {};
  recs.forEach(r => { const t = r.type || '기타'; (tMap[t] = tMap[t] || { days: 0, count: 0 }); tMap[t].days += (r.loss_days || 0); tMap[t].count += 1; });
  const typeFinance = Object.keys(tMap).map(t => ({ type: t, days: tMap[t].days, count: tMap[t].count, lossEok: eok(lossWon(tMap[t].days, wY)) }))
    .filter(t => t.days > 0).sort((a, b) => b.lossEok - a.lossEok).slice(0, 8);

  // ── 모션 훅 ──────────────────────────────────────────────
  const kpiRef = useRef(null);
  const kpiInView = useInView(kpiRef);

  // useCountUp — 소수: target×10 전달 → countUp → /10 toFixed(1)
  const cuPeriodEok    = useCountUp(Math.round(periodEok * 10), 900, kpiInView);
  const cuDailyValue   = useCountUp(DAILY_VALUE_PER_WORKER || 0, 900, kpiInView);
  const cuPeriodDays   = useCountUp(periodDays, 900, kpiInView);
  const cuDirectEok    = useCountUp(Math.round(periodDirectEok * 10), 900, kpiInView);
  const cuIndirectEok  = useCountUp(Math.round(periodIndirectEok * 10), 900, kpiInView);
  const cuSalesEok     = useCountUp(periodSalesEok, 900, kpiInView);

  // 산식 배너 collapse
  const [formulaOpen, setFormulaOpen] = useState(false);

  // 월별 X축 각도·높이 동적
  const mLen = monthlyFinance.length;
  const xAngle  = mLen > 18 ? -45 : mLen > 12 ? -30 : 0;
  const xHeight  = mLen > 18 ? 50  : mLen > 12 ? 40  : 20;

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        <span className="text-stone-300">·</span>
        <span>기준: <b className="text-brand-navy">{basisLabel}</b> <span className="text-stone-400">(상단 토글로 전환)</span></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>

      {/* 사고경위서 기준 안내 — 손실이 실측 근로손실일수 기반이라 연도에 따라 산재승인과 같아질 수 있음 */}
      {basis !== 'approval' && (
        <div className="rounded-lg bg-blue-50/60 border border-blue-100 px-3.5 py-2.5 flex items-start gap-2 text-xs text-stone-600 leading-relaxed break-keep">
          <Info size={13} className="text-[#1D4ED8] flex-shrink-0" style={{ marginTop: 2 }} />
          <span>
            <b className="text-brand-navy">추정 재무손실은 실측 근로손실일수(산재 처리 시 확정)</b> 기반입니다. 근로손실일수는 산재 처리된 건에만 기록되므로,
            <b> 특정 연도(예: 2026년)에는 사고경위·산재승인 손실이 동일하게</b> 나올 수 있습니다.
            <span className="text-stone-500"> 전체기간·2024·2025 등 다른 기간은 기준 전환에 따라 다르게 반영됩니다. (사고건수는 기준별로 항상 다르게 집계됩니다.)</span>
          </span>
        </div>
      )}

      {/* KPI 4-카드 — inView stagger + hover lift */}
      <div ref={kpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">

        {/* Primary — 총 추정 재무손실: col-span-2 on mobile, 1 on lg */}
        <div
          className="col-span-2 lg:col-span-1 rounded-lg p-5 text-white dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-lg"
          style={{ background: CHART_BLUE, animationDelay: "0ms" }}
        >
          <div className="text-xs text-white/70 font-medium uppercase tracking-wide">총 추정 재무손실</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums">
              {(cuPeriodEok / 10).toFixed(1)}
            </span>
            <span className="text-base font-medium text-white/60">억원</span>
          </div>
          <div className="text-[11px] text-white/65 mt-2 break-keep">
            {USE_PRODUCTIVITY
              ? `근로손실 ${fmt(periodDays)}일 × 인당 ${fmt(DAILY_VALUE_PER_WORKER)}원/일 · 실측분만`
              : `직접비 ${periodDirectEok.toFixed(1)}억 + 간접비 ${periodIndirectEok.toFixed(1)}억 · 실측분만`}
          </div>
        </div>

        {/* 연간 기대손실(EAL) — 누적이 아니라 연간 환산. 결측 보정 포함이라 위 카드와 배율이 다르다. */}
        <div className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ animationDelay: "60ms" }}>
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">연간 기대손실 (EAL)</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums text-[#071E4A]">
              {ealPeriod.years ? (ealTotal / 1e8).toFixed(1) : '—'}
            </span>
            <span className="text-base font-medium text-stone-400">억원/년</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 break-keep">
            {ealBasisLabel}
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5 break-keep">
            결측 보정 포함 · 사망 제외
          </div>
        </div>

        {/* 중대재해 — 금액 환산 대상이 아니다. 법정 요양근로손실일수(별표1)로만 표기. 설계문서 §9.2 */}
        <div onClick={() => onNavigate?.('legal')} role={onNavigate ? 'button' : undefined}
          className={`rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md ${onNavigate ? 'cursor-pointer' : ''}`}
          style={{ animationDelay: "120ms" }}>
          <div className="text-xs font-medium uppercase tracking-wide" style={{ color: DAISO_RED }}>중대재해</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-3xl sm:text-4xl font-bold tracking-tight tabular-nums" style={{ color: DAISO_RED }}>
              {fatality.n}
            </span>
            <span className="text-base font-medium text-stone-400">건</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2 break-keep">
            법정 요양근로손실일수 {fmt(fatality.statutoryLossDays)}일
          </div>
          <div className="text-[11px] text-stone-400 mt-0.5 break-keep">
            금액 환산 대상 아님 · 법적 보고 기준 별도 관리
          </div>
        </div>

        {USE_PRODUCTIVITY ? (<>
          <div
            className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: "60ms" }}
          >
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">인당 1일 생산성</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
                {cuDailyValue.toLocaleString()}
              </span>
              <span className="text-base font-medium text-stone-400">원</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-2">매장 근로자 1인·1일 기준 (사용자 산정)</div>
          </div>
          <div
            className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: "120ms" }}
          >
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">실측 근로손실일수</div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
                {cuPeriodDays.toLocaleString()}
              </span>
              <span className="text-base font-medium text-stone-400">일</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-2">기록 {periodDaysCount}건 · 산재 판정 실측</div>
          </div>
        </>) : (<>
          <div
            className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: "60ms" }}
          >
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">직접비 <span className="text-stone-400 normal-case">(휴업손실)</span></div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
                {(cuDirectEok / 10).toFixed(1)}
              </span>
              <span className="text-base font-medium text-stone-400">억원</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-2">근로손실 {fmt(periodDays)}일 × 일급(최저시급×8)</div>
          </div>
          <div
            className="rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
            style={{ animationDelay: "120ms" }}
          >
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">간접비 <span className="text-stone-400 normal-case">(×{INDIRECT_COST_MULTIPLIER})</span></div>
            <div className="flex items-baseline gap-1.5 mt-1">
              <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
                {(cuIndirectEok / 10).toFixed(1)}
              </span>
              <span className="text-base font-medium text-stone-400">억원</span>
            </div>
            <div className="text-[11px] text-stone-500 mt-2">직접비 × {INDIRECT_COST_MULTIPLIER} (하인리히 1:{INDIRECT_COST_MULTIPLIER})</div>
          </div>
        </>)}

        {/* 매출 환산 — 항상 4번째 */}
        <div
          className="col-span-2 lg:col-span-1 rounded-lg p-5 bg-white border border-stone-200 dash-slide-up transition-all hover:-translate-y-0.5 hover:shadow-md"
          style={{ animationDelay: "180ms" }}
        >
          <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">매출 환산 · 건수</div>
          <div className="flex items-baseline gap-1.5 mt-1">
            <span className="text-2xl sm:text-3xl font-bold text-stone-900 tracking-tight tabular-nums">
              {cuSalesEok.toLocaleString()}
            </span>
            <span className="text-base font-medium text-stone-400">억원</span>
          </div>
          <div className="text-[11px] text-stone-500 mt-2">{basisLabel} {fmt(periodCount)}건 · 손실일수 실측 {periodDaysCount}건</div>
        </div>
      </div>

      {/* 산식 배너 — collapse 토글 */}
      <div className="rounded-lg border border-[#DCE7F7] bg-[#F2F6FC] overflow-hidden">
        <button
          onClick={() => setFormulaOpen(o => !o)}
          className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left min-h-[44px] active:scale-[0.97] transition-transform"
        >
          <Info size={15} style={{ color: '#2563EB', flexShrink: 0 }} />
          <span className="flex-1 text-xs text-stone-700 break-keep font-medium">
            {USE_PRODUCTIVITY
              ? `추정 재무손실 = 근로손실일수 × 인당 생산성(${fmt(DAILY_VALUE_PER_WORKER)}원)`
              : `직접비(휴업손실 근사) + 간접비×${INDIRECT_COST_MULTIPLIER} (하인리히) = 총 추정 재무손실`}
          </span>
          <ChevronDown
            size={14}
            className="text-[#2563EB] flex-shrink-0 transition-transform duration-300"
            style={{ transform: formulaOpen ? 'rotate(180deg)' : 'rotate(0deg)' }}
          />
        </button>
        <div
          className="overflow-hidden transition-all duration-300"
          style={{ maxHeight: formulaOpen ? '300px' : '0px' }}
        >
          <div className="px-3 pb-3 text-xs text-stone-700 break-keep leading-relaxed">
            {USE_PRODUCTIVITY ? (<>
              <b className="text-brand-navy">추정 재무손실</b> = 실측 근로손실일수 × <b>인당 1일 생산성({fmt(DAILY_VALUE_PER_WORKER)}원)</b>.
              <span className="text-stone-500"> 매장 근로자 1인의 1일 생산성 비용(사용자 산정)에 산재 판정 실측 근로손실일수를 곱해 산출. 기준(사고경위/산재승인)·연도·월 전환 시 동적 재계산.</span>
            </>) : (<>
              <b className="text-brand-navy">직접비</b> = 실측 근로손실일수 × 일급(최저시급×8시간) <span className="text-stone-400">[요양·장해·유족 등 보상금 제외 — 휴업손실 근사]</span> · <b className="text-brand-navy">간접비</b> = 직접비 × {INDIRECT_COST_MULTIPLIER} · <b className="text-brand-navy">총손실</b> = 직접비 + 간접비.
              <span className="text-stone-500"> ※ <b className="text-amber-700">임시 기준</b> — 인당 1일 생산성 비용 입력 시 그 값으로 자동 전환됩니다. 간접비 {INDIRECT_COST_MULTIPLIER}배는 하인리히(1931) 1:{INDIRECT_COST_MULTIPLIER}를 전 업종 일괄 채택한 값(업종별 실측 평균 아님), 한국 실측은 사망 1:6.2·중경상 1:7.1. 근로손실일수는 산재 판정 실측치.</span>
            </>)}
          </div>
        </div>
      </div>

      {/* 연도별 추정 재무손실 추이 */}
      <Card title="연도별 추정 재무손실 추이" titleIcon={Banknote} sub="사고건수와 추정 재무손실의 연도별 변화 — 기준 전환에 따라 동적 반영" right={<ExportBtn rows={yearlyFinance} filename={`연도별_추정재무손실_${basisLabel}.csv`} />}>
        {yearlyFinance.length === 0 ? (
          <EmptyState message="연도별 데이터 없음" />
        ) : (<>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mb-4">
          {yearlyFinance.map((y, i) => {
            const prev = i > 0 ? yearlyFinance[i - 1].lossEok : null;
            const delta = prev ? parseFloat(((y.lossEok - prev) / prev * 100).toFixed(1)) : null;
            return (
              <div key={y.year} className="rounded-lg p-4 border border-stone-200 bg-white">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-bold text-stone-600">{y.year}</span>
                  {delta !== null && delta !== 0 && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ background: delta > 0 ? "#FEE2E2" : "#DCFCE7", color: delta > 0 ? ALERT_RED : SAFE_GREEN }}>{delta > 0 ? "▲" : "▼"}{Math.abs(delta)}%</span>}
                </div>
                <div className="flex items-baseline gap-1">
                  <span className="text-2xl font-bold tabular-nums" style={{ color: i === yearlyFinance.length - 1 ? DAISO_RED : "#1C1917" }}>{y.lossEok.toFixed(1)}</span>
                  <span className="text-sm text-stone-400">억원</span>
                </div>
                <div className="text-[11px] text-stone-500 mt-1">사고 {y.count}건 · 매출 환산 {y.salesEok}억</div>
              </div>
            );
          })}
        </div>
        <ResponsiveContainer width="100%" height={220} debounce={50}>
          <ComposedChart data={yearlyFinance} margin={{ left: 10, right: 10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
            <XAxis dataKey="year" tick={{ fontSize: 10, fill: "#44403C", fontWeight: 600 }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}억`} />
            <Tooltip content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload;
              return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.year}</div><div>사고 {p.count}건 · 근로손실 {fmt(p.days)}일</div><div className="font-bold mt-0.5" style={{ color: DAISO_RED }}>손실 {p.lossEok.toFixed(1)}억원</div><div className="text-stone-500 mt-0.5">매출 환산 {p.salesEok}억</div></div>;
            }} />
            <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
            <Bar yAxisId="l" dataKey="count" fill="#D6D3D1" radius={[6, 6, 0, 0]} name="사고 건수" />
            <Line yAxisId="r" type="monotone" dataKey="lossEok" stroke={DAISO_RED} strokeWidth={3} dot={{ r: 5, fill: DAISO_RED }} name="추정 재무손실(억원)" />
          </ComposedChart>
        </ResponsiveContainer>
        </>)}
      </Card>

      {/* 월별 추정 재무손실 */}
      <Card title="월별 추정 재무손실" titleIcon={TrendingUp} sub={`${yrLabel} 월별 실측 근로손실일수 기반 추정 — 기준·연도 필터 동적 반영`} right={<ExportBtn rows={monthlyFinance} filename={`월별_추정재무손실_${basisLabel}.csv`} />}>
        {monthlyFinance.length === 0 ? (
          <EmptyState message="월별 데이터 없음" />
        ) : (
          <ResponsiveContainer width="100%" height={240} debounce={50}>
            <ComposedChart data={monthlyFinance} margin={{ left: 10, right: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 9, fill: "#78716C" }}
                axisLine={false}
                tickLine={false}
                interval="preserveStartEnd"
                angle={xAngle}
                textAnchor={xAngle < 0 ? 'end' : 'middle'}
                height={xHeight}
              />
              <YAxis yAxisId="l" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}억`} />
              <Tooltip content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload;
                return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.ym}</div><div>사고 {p.count}건 · 근로손실 {fmt(p.days)}일</div><div className="font-bold mt-0.5" style={{ color: DAISO_RED }}>추정손실 {p.lossEok.toFixed(1)}억원</div></div>;
              }} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              <Bar yAxisId="l" dataKey="count" fill="#1B3B7A" radius={[4, 4, 0, 0]} maxBarSize={30} name="사고 건수" />
              <Line yAxisId="r" type="monotone" dataKey="lossEok" stroke={DAISO_RED} strokeWidth={2.5} dot={{ r: 3, fill: DAISO_RED }} name="추정 재무손실(억원)" />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </Card>

      {/* 재해유형별 추정 재무손실 */}
      <Card title="재해유형별 추정 재무손실" titleIcon={Banknote} sub="Top 8 · 실측 근로손실일수 기반 — 1위 레드·2위 네이비·나머지 그레이" right={<ExportBtn rows={typeFinance} filename={`재해유형별_추정재무손실_${basisLabel}.csv`} />}>
        {typeFinance.length === 0 ? (
          <EmptyState message="재해유형 데이터 없음" />
        ) : (
          <div className="relative overflow-x-auto">
            <ResponsiveContainer width="100%" height={Math.max(180, typeFinance.length * 34)} debounce={50}>
              <BarChart data={typeFinance} layout="vertical" margin={{ left: 0, right: 24 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}억`} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 11, fill: "#44403C", fontWeight: 500 }} axisLine={false} tickLine={false} width={68} />
                <Tooltip content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload;
                  return <div className="bg-white border border-stone-200 rounded-lg shadow-[0_4px_12px_rgba(0,0,0,0.06)] px-3 py-2 text-xs"><div className="font-bold">{p.type}</div><div>{p.count}건 · 근로손실 {fmt(p.days)}일</div><div className="font-bold mt-0.5" style={{ color: DAISO_RED }}>추정손실 {p.lossEok.toFixed(1)}억원</div></div>;
                }} />
                <Bar dataKey="lossEok" radius={[0, 5, 5, 0]} name="추정 재무손실(억원)">
                  {typeFinance.map((e, i) => <Cell key={i} fill={rankColor(i)} />)}
                  <LabelList dataKey="lossEok" position="right" style={{ fontSize: 9, fill: NV, fontWeight: 700 }} formatter={v => `${v}억`} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
          </div>
        )}
      </Card>
    </div>
  );
}

export default CostRisk;

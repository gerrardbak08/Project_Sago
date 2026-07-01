import { useState, useMemo, useRef, useEffect } from 'react';
import { LineChart, ComposedChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine, Customized } from 'recharts';
import { Calendar, Plus, X } from 'lucide-react';
import { Card } from './Card.jsx';
import { fmt } from '../../utils/uiHelpers.jsx';
import { ALERT_RED, SAFE_GREEN } from '../../constants/colors.js';
import { useInView } from '../../utils/motion.js';

const KST_OFFSET_MIN = 9 * 60;

function todayKstMonth() {
  const now = new Date();
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const kst = new Date(utc + KST_OFFSET_MIN * 60000);
  return { y: kst.getFullYear(), m: kst.getMonth() + 1 };
}

// 기본 시점: 최신 연도의 1월 ~ 해당(최신 데이터)월 — 올해 누적(YTD) 월별 추이
function deriveDefaultPoints(monthly) {
  if (!monthly || monthly.length === 0) return [];
  const known = new Set(monthly.map(x => x.ym));
  const sorted = [...monthly].sort((a, b) => a.ym.localeCompare(b.ym));
  const last = sorted[sorted.length - 1].ym;       // 예: "2026-06"
  const ly = last.slice(0, 4);                       // "2026"
  const lm = parseInt(last.slice(5, 7), 10);         // 6
  const pts = [];
  for (let m = 1; m <= lm; m++) {
    const ym = `${ly}-${String(m).padStart(2, '0')}`;
    if (known.has(ym)) pts.push(ym);
  }
  return pts.length >= 2 ? pts : [last];
}

const arrow = (d) => d > 0 ? '▲' : (d < 0 ? '▼' : '—');
const deltaColor = (d) => d > 0 ? ALERT_RED : (d < 0 ? SAFE_GREEN : '#525252');

function PeriodComparison({ monthly, storeSnapshots, workerSnapshots }) {
  const [points, setPoints] = useState(() => deriveDefaultPoints(monthly));
  const [refYm, setRefYm] = useState(null);          // 사용자가 클릭으로 지정한 기준
  const [showPicker, setShowPicker] = useState(false);
  const pickerRef = useRef(null);
  const chartRef = useRef(null);
  const chartInView = useInView(chartRef);

  const availableYears = useMemo(
    () => Array.from(new Set(monthly.map(x => x.y))).sort(),
    [monthly]
  );
  const monthsList = useMemo(() => Array.from({ length: 12 }, (_, i) => i + 1), []);
  const [pickYear, setPickYear] = useState(availableYears[availableYears.length - 1] ?? new Date().getFullYear());
  const [pickMonth, setPickMonth] = useState(todayKstMonth().m);

  useEffect(() => {
    if (!showPicker) return;
    const onClick = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target)) setShowPicker(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [showPicker]);

  const sortedPoints = useMemo(() => [...points].sort(), [points]);
  const monthlyByYm = useMemo(() => {
    const map = new Map();
    for (const x of monthly) map.set(x.ym, x);
    return map;
  }, [monthly]);

  // 기준 시점: 사용자가 지정했으면 그것, 아니면 정렬상 마지막 (자동)
  // 만약 지정한 시점이 points에서 제거되면 자동 fallback
  const effectiveRef = useMemo(() => {
    if (refYm && points.includes(refYm)) return refYm;
    return sortedPoints[sortedPoints.length - 1] ?? null;
  }, [refYm, points, sortedPoints]);

  const refData = effectiveRef ? monthlyByYm.get(effectiveRef) : null;

  const addPoint = () => {
    const ym = `${pickYear}-${String(pickMonth).padStart(2, '0')}`;
    if (points.includes(ym)) return;
    setPoints([...points, ym]);
    setShowPicker(false);
  };
  const removePoint = (ym) => {
    setPoints(points.filter(p => p !== ym));
    if (refYm === ym) setRefYm(null);
  };

  // ── 차트 데이터: 실제 사고건수 + 매장·근로자·평수의 인덱스 (첫 시점=100) ──
  // 사고는 좌측 Y축(실수치), 매장·근로자·평수는 우측 Y축(인덱스)로 분리
  const chartData = useMemo(() => {
    // 인덱스 기준점: 정렬상 첫 시점에서 데이터가 있는 row
    const baseStoreRow = sortedPoints
      .map(ym => storeSnapshots?.find(s => s.ym === ym))
      .find(r => r && r.count != null);
    const baseWorkerRow = sortedPoints
      .map(ym => workerSnapshots?.find(w => w.ym === ym))
      .find(r => r && r.workers != null);

    return sortedPoints.map(ym => {
      const m = monthlyByYm.get(ym);
      const storeRow = storeSnapshots?.find(s => s.ym === ym);
      const workerRow = workerSnapshots?.find(w => w.ym === ym);
      const storeIdx = (storeRow?.count != null && baseStoreRow?.count)
        ? (storeRow.count / baseStoreRow.count) * 100 : null;
      const areaIdx = (storeRow?.avg_area != null && baseStoreRow?.avg_area)
        ? (storeRow.avg_area / baseStoreRow.avg_area) * 100 : null;
      const workerIdx = (workerRow?.workers != null && baseWorkerRow?.workers)
        ? (workerRow.workers / baseWorkerRow.workers) * 100 : null;
      return {
        ym,
        사고건수: m?.t ?? null,
        수도권: m?.s ?? null,
        지방: m?.j ?? null,
        store: storeRow?.count ?? null,
        avgArea: storeRow?.avg_area ?? null,
        worker: workerRow?.workers ?? null,
        매장수_idx: storeIdx,
        근로자수_idx: workerIdx,
        평수_idx: areaIdx,
        isRef: ym === effectiveRef,
        missing: !m,
      };
    });
  }, [sortedPoints, monthlyByYm, storeSnapshots, workerSnapshots, effectiveRef]);

  // ── 변동률 (3-칩): 기준 vs 전월·전년·전전년 ──
  const comparisons = useMemo(() => {
    if (!effectiveRef || !refData) return [];
    const [ry, rm] = effectiveRef.split('-').map(Number);
    const prevYm = (() => {
      const pm = rm === 1 ? 12 : rm - 1;
      const py = rm === 1 ? ry - 1 : ry;
      return `${py}-${String(pm).padStart(2, '0')}`;
    })();
    return [
      { label: '전월', ym: prevYm },
      { label: '전년 동월', ym: `${ry - 1}-${String(rm).padStart(2, '0')}` },
      { label: '전전년 동월', ym: `${ry - 2}-${String(rm).padStart(2, '0')}` },
    ].map(c => {
      const m = monthlyByYm.get(c.ym);
      if (!m) return { ...c, missing: true };
      const d = refData.t - m.t;
      const p = m.t === 0 ? null : (d / m.t) * 100;
      return { ...c, prev: m.t, delta: d, pct: p };
    });
  }, [effectiveRef, refData, monthlyByYm]);

  // ── 인사이트 (위계 분리: 시점 / 건수 / 변동률 / 부가) ──
  const insight = useMemo(() => {
    if (!refData || sortedPoints.length < 2) return null;
    const firstYm = sortedPoints[0];
    const first = monthlyByYm.get(firstYm);
    if (!first) return null;
    const accDelta = refData.t - first.t;
    const accPct = first.t === 0 ? 0 : (accDelta / first.t) * 100;
    const storeBase = storeSnapshots?.find(s => s.ym === firstYm);
    const storeRef = storeSnapshots?.find(s => s.ym === effectiveRef);
    let rateLine = null;
    if (storeBase && storeRef) {
      const rateBase = first.t / storeBase.count * 100;
      const rateRef = refData.t / storeRef.count * 100;
      const ratePct = ((rateRef - rateBase) / rateBase) * 100;
      rateLine = {
        from: rateBase.toFixed(2),
        to: rateRef.toFixed(2),
        pct: ratePct,
        improve: ratePct < 0,
      };
    }
    return {
      fromYm: firstYm,
      toYm: effectiveRef,
      fromVal: first.t,
      toVal: refData.t,
      delta: accDelta,
      pct: accPct,
      rate: rateLine,
    };
  }, [refData, effectiveRef, sortedPoints, monthlyByYm, storeSnapshots]);

  // ── 차트 라벨: 점 위 큰 숫자 + 세그먼트 사이 증감률 (좌측 Y축 = 사고건수) ──
  const ChartLabels = ({ xAxisMap, yAxisMap }) => {
    if (!chartData.length || !xAxisMap || !yAxisMap) return null;
    const xKey = Object.keys(xAxisMap)[0];
    // dual-axis 환경: 좌측(left) Y축을 명시적으로 선택
    const yKeys = Object.keys(yAxisMap);
    const yKey = yKeys.find(k =>
      k === 'left' || yAxisMap[k]?.orientation === 'left'
    ) ?? yKeys[0];
    const xScale = xAxisMap[xKey].scale;
    const yScale = yAxisMap[yKey].scale;

    return (
      <g>
        {/* 세그먼트 사이 변동률 (라인 위) */}
        {chartData.slice(0, -1).map((d, i) => {
          const next = chartData[i + 1];
          if (d.사고건수 == null || next.사고건수 == null) return null;
          const x1 = xScale(d.ym);
          const x2 = xScale(next.ym);
          const y1 = yScale(d.사고건수);
          const y2 = yScale(next.사고건수);
          const mx = (x1 + x2) / 2;
          const my = (y1 + y2) / 2;
          const segDelta = next.사고건수 - d.사고건수;
          const segPct = d.사고건수 === 0 ? null : (segDelta / d.사고건수) * 100;
          const segColor = deltaColor(segDelta);
          const segArrow = arrow(segDelta);
          const txt = segPct != null
            ? `${segDelta > 0 ? '+' : ''}${segDelta}건(${segArrow}${Math.abs(segPct).toFixed(1)}%)`
            : `${segDelta > 0 ? '+' : ''}${segDelta}건`;
          // 라벨이 라인 위쪽 또는 아래쪽으로 (라인 기울기에 따라 회피)
          const slopeDown = y2 > y1; // y가 커지면 아래로 (그래프상 감소)
          const labelY = slopeDown ? my + 18 : my - 12;
          return (
            <g key={`seg-${i}`}>
              <text x={mx} y={labelY + 2} textAnchor="middle"
                    fontSize={10.5} fill={segColor}>
                {txt}
              </text>
            </g>
          );
        })}
        {/* 점별 라벨: 사고건수 점 위에 큰 숫자만 (매장·근로자·평수는 라인으로 표현되므로 점 아래 라벨 제거) */}
        {chartData.map((d) => {
          if (d.사고건수 == null) return null;
          const cx = xScale(d.ym);
          const cy = yScale(d.사고건수);
          return (
            <g key={`pt-${d.ym}`}>
              <text x={cx} y={cy - 14} textAnchor="middle"
                    fontSize={d.isRef ? 16 : 14}
                    fontWeight={700}
                    fill={d.isRef ? ALERT_RED : '#1C1917'}>
                {d.사고건수}
              </text>
            </g>
          );
        })}
      </g>
    );
  };

  // 본문 상단 가로 전체폭 인사이트 스트립 (모바일 뭉개짐 방지 — flex-wrap으로 세그먼트 단위 줄바꿈)
  const insightStrip = insight ? (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-4 px-3 py-2 rounded-lg border border-stone-200 bg-stone-50/70">
      <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400">핵심 인사이트</span>
      <span className="text-xs font-semibold text-stone-500 tabular-nums">{insight.fromYm} → {insight.toYm}</span>
      <span className="h-3 w-px bg-stone-200 hidden sm:inline-block" />
      <span className="text-sm font-bold text-stone-900 tabular-nums">
        {insight.fromVal} → {insight.toVal}<span className="text-stone-400 text-xs font-medium">건</span>
        <span className="text-xs font-bold ml-1" style={{ color: deltaColor(insight.delta) }}>
          {insight.delta > 0 ? '+' : ''}{insight.delta}건 ({arrow(insight.delta)}{Math.abs(insight.pct).toFixed(1)}%)
        </span>
      </span>
      {insight.rate && (
        <>
          <span className="h-3 w-px bg-stone-200 hidden sm:inline-block" />
          <span className="text-xs text-stone-500">
            100매장당 사고율{' '}
            <span className="font-bold text-stone-700 tabular-nums">{insight.rate.from} → {insight.rate.to}</span>{' '}
            <span className="font-bold" style={{ color: insight.rate.improve ? SAFE_GREEN : ALERT_RED }}>
              ({insight.rate.improve ? '' : '+'}{insight.rate.pct.toFixed(1)}%, {insight.rate.improve ? '개선' : '악화'})
            </span>
          </span>
        </>
      )}
    </div>
  ) : null;

  return (
    <Card
      title="동기간 비교"
      titleIcon={Calendar}
      sub="원하는 년·월을 자유롭게 골라 사고건수와 매장·근로자 변화를 함께 비교합니다"
    >
      {insightStrip}

      {/* 시점 칩 + 추가 버튼 */}
      <div className="flex items-center flex-wrap gap-1.5 mb-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mr-1">시점</span>
        {sortedPoints.map(ym => {
          const isRef = ym === effectiveRef;
          const missing = !monthlyByYm.get(ym);
          return (
            <button
              key={ym}
              type="button"
              onClick={() => setRefYm(ym)}
              className="inline-flex items-center gap-1 text-xs px-3 py-1.5 min-h-[36px] border cursor-pointer transition active:scale-[0.93]"
              style={{
                background: isRef ? '#1C1917' : 'white',
                borderColor: missing ? '#FCD34D' : (isRef ? '#1C1917' : '#E7E5E4'),
                color: missing ? '#92400E' : (isRef ? 'white' : '#1C1917'),
                borderRadius: 999,
                borderWidth: 1,
                fontWeight: isRef ? 700 : 600,
              }}
              title={isRef ? '기준 시점 (클릭으로 변경 가능)' : '클릭하면 기준 시점으로 설정'}
            >
              {isRef && <span style={{ fontSize: 10 }}>★</span>}
              <span>{ym}</span>
              {points.length > 1 && (
                <span
                  onClick={(e) => { e.stopPropagation(); removePoint(ym); }}
                  className={`ml-0.5 hover:text-red-300 ${isRef ? 'text-stone-300' : 'text-stone-400 hover:text-stone-700'}`}
                  role="button" tabIndex={-1}
                  aria-label={`${ym} 제거`}
                >
                  <X size={11} />
                </span>
              )}
            </button>
          );
        })}
        <div className="relative" ref={pickerRef}>
          <button onClick={() => setShowPicker(v => !v)}
                  className="inline-flex items-center gap-1 text-xs font-semibold px-3 py-1.5 min-h-[36px] border border-dashed border-stone-300 text-stone-500 hover:border-stone-400 hover:text-stone-700 cursor-pointer transition active:scale-[0.93]"
                  style={{ borderRadius: 999 }}>
            <Plus size={11} /> 시점 추가
          </button>
          {showPicker && (
            <div className="absolute z-20 mt-1 left-0 bg-white border border-stone-200 rounded-lg shadow-lg p-3 flex items-center gap-2 whitespace-nowrap">
              <select value={pickYear}
                      onChange={e => setPickYear(parseInt(e.target.value, 10))}
                      className="text-xs border border-stone-200 rounded px-2 h-8 w-20 box-border">
                {availableYears.map(y => <option key={y} value={y}>{y}년</option>)}
              </select>
              <select value={pickMonth}
                      onChange={e => setPickMonth(parseInt(e.target.value, 10))}
                      className="text-xs border border-stone-200 rounded px-2 h-8 w-20 box-border">
                {monthsList.map(m => {
                  const ym = `${pickYear}-${String(m).padStart(2, '0')}`;
                  const disabled = points.includes(ym);
                  return <option key={m} value={m} disabled={disabled}>{m}월{disabled ? ' (선택됨)' : ''}</option>;
                })}
              </select>
              <button onClick={addPoint}
                      disabled={points.includes(`${pickYear}-${String(pickMonth).padStart(2, '0')}`)}
                      className="text-xs font-bold rounded bg-stone-900 text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer h-8 w-20 box-border whitespace-nowrap shrink-0">
                추가
              </button>
            </div>
          )}
        </div>
      </div>
      <p className="text-[10px] text-stone-400 italic mb-4">칩을 클릭하면 기준 시점이 그 시점으로 바뀝니다 (★ 표시).</p>

      {/* KPI BAN 4-카드 */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <BanCard title="매장수" unit="개" snapshot={storeSnapshots} field="count" refYm={effectiveRef} />
        <BanCard title="매장 평균 평수" unit="평" snapshot={storeSnapshots} field="avg_area" refYm={effectiveRef} decimals={1} />
        <BanCard title="근로자수" unit="명" snapshot={workerSnapshots} field="workers" refYm={effectiveRef} />
        <BanAccidentCard current={refData?.t} comparisons={comparisons} />
      </div>

      {/* 메인 사고건수 라인 차트 + 매장·근로자 라벨 */}
      <div ref={chartRef} className={`mb-3 ${chartInView ? 'dash-fade-in' : 'opacity-0'}`}>
        <div className="flex items-baseline justify-between mb-2">
          <h3 className="text-sm font-bold text-stone-800 tracking-tight">
            사고건수 추이 + 시점별 매장·근로자·평수
          </h3>
          <span className="text-[11px] text-stone-400">시점 시간순 정렬</span>
        </div>
        {sortedPoints.length >= 2 ? (
          <ResponsiveContainer width="100%" height={340} debounce={50}>
            <ComposedChart data={chartData} margin={{ top: 36, right: 12, left: 8, bottom: 12 }}>
              <CartesianGrid strokeDasharray="2 4" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="ym"
                     tick={{ fontSize: 11, fill: '#44403C', fontWeight: 600 }}
                     axisLine={{ stroke: '#D6D3D1' }}
                     tickLine={false}
                     padding={{ left: 18, right: 18 }} />
              <YAxis yAxisId="left" hide domain={[0, 'dataMax + 8']} />
              <YAxis yAxisId="right" orientation="right" hide
                     domain={[(dataMin) => Math.min(85, Math.floor(dataMin - 5)),
                              (dataMax) => Math.max(150, Math.ceil(dataMax + 15))]}
                     ticks={[85, 100, 115, 130, 145]} />
              <ReferenceLine yAxisId="right" y={100} stroke="#D6D3D1"
                             strokeDasharray="4 4" strokeWidth={1} />
              <Tooltip content={<TufteTooltip />} />
              {/* 보조 곡선 라인 (우측 Y축, 인덱스) — 색·dash·마커 모양으로 구별 */}
              <Line yAxisId="right" type="natural" dataKey="매장수_idx"
                    name="매장수"
                    stroke="#1D4ED8" strokeWidth={1.3} strokeOpacity={0.5} strokeDasharray="10 4"
                    dot={(p) => (p.value == null || !Number.isFinite(p.cy)) ? null : (
                      <rect key={p.index} x={p.cx - 4} y={p.cy - 4} width={8} height={8}
                            fill="white" stroke="#1D4ED8" strokeWidth={1.2} opacity={0.6} />
                    )}
                    activeDot={{ r: 6, fill: '#1D4ED8' }}
                    connectNulls isAnimationActive={false} />
              <Line yAxisId="right" type="natural" dataKey="근로자수_idx"
                    name="근로자수"
                    stroke="#0F766E" strokeWidth={1.3} strokeOpacity={0.5} strokeDasharray="4 2 1 2"
                    dot={(p) => (p.value == null || !Number.isFinite(p.cy)) ? null : (
                      <polygon key={p.index}
                               points={`${p.cx},${p.cy - 5} ${p.cx + 4.5},${p.cy + 3} ${p.cx - 4.5},${p.cy + 3}`}
                               fill="white" stroke="#0F766E" strokeWidth={1.2} opacity={0.6} />
                    )}
                    activeDot={{ r: 6, fill: '#0F766E' }}
                    connectNulls isAnimationActive={false} />
              <Line yAxisId="right" type="natural" dataKey="평수_idx"
                    name="매장 평균 평수"
                    stroke="#D97706" strokeWidth={1.3} strokeOpacity={0.5} strokeDasharray="2 3"
                    dot={(p) => (p.value == null || !Number.isFinite(p.cy)) ? null : (
                      <polygon key={p.index}
                               points={`${p.cx},${p.cy - 5} ${p.cx + 5},${p.cy} ${p.cx},${p.cy + 5} ${p.cx - 5},${p.cy}`}
                               fill="white" stroke="#D97706" strokeWidth={1.2} opacity={0.6} />
                    )}
                    activeDot={{ r: 6, fill: '#D97706' }}
                    connectNulls isAnimationActive={false} />
              {/* 메인 사고건수 라인 (좌측 Y축, 실수치, 굵은 실선) */}
              <Line yAxisId="left" type="monotone" dataKey="사고건수"
                    stroke={ALERT_RED} strokeWidth={3}
                    dot={(p) => {
                      if (p.value == null || !Number.isFinite(p.cy)) return null;
                      const isRef = chartData[p.index]?.isRef;
                      return (
                        <circle key={p.index} cx={p.cx} cy={p.cy} r={isRef ? 7 : 5}
                                fill={isRef ? ALERT_RED : 'white'}
                                stroke={ALERT_RED} strokeWidth={isRef ? 3 : 2.5} />
                      );
                    }}
                    activeDot={{ r: 8 }}
                    isAnimationActive={false}
                    connectNulls />
              <Customized component={ChartLabels} />
            </ComposedChart>
          </ResponsiveContainer>
        ) : (
          <div className="py-12 text-center text-stone-400 text-sm border border-dashed border-stone-200 rounded">
            시점을 2개 이상 선택해주세요.
          </div>
        )}
        {/* 범례: 색·선·마커 모양 시각 가이드 */}
        <div className="flex items-center flex-wrap gap-x-4 gap-y-1 mt-2 text-[11px] text-stone-600">
          <span className="inline-flex items-center gap-1.5">
            <svg width={32} height={12}>
              <line x1={0} y1={6} x2={32} y2={6} stroke={ALERT_RED} strokeWidth={3} />
              <circle cx={16} cy={6} r={4} fill={ALERT_RED} />
            </svg>
            <span className="font-bold" style={{ color: ALERT_RED }}>사고건수</span>
            <span className="text-stone-400 text-[10px]">(좌축, 실수)</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width={32} height={12}>
              <line x1={0} y1={6} x2={32} y2={6} stroke="#1D4ED8" strokeWidth={2} strokeDasharray="10 4" />
              <rect x={12} y={2} width={8} height={8} fill="white" stroke="#1D4ED8" strokeWidth={1.8} />
            </svg>
            <span style={{ color: '#1D4ED8' }}>매장수 ▪</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width={32} height={12}>
              <line x1={0} y1={6} x2={32} y2={6} stroke="#0F766E" strokeWidth={2} strokeDasharray="4 2 1 2" />
              <polygon points="16,1 21,10 11,10" fill="white" stroke="#0F766E" strokeWidth={1.8} />
            </svg>
            <span style={{ color: '#0F766E' }}>근로자수 ▴</span>
          </span>
          <span className="inline-flex items-center gap-1.5">
            <svg width={32} height={12}>
              <line x1={0} y1={6} x2={32} y2={6} stroke="#D97706" strokeWidth={2} strokeDasharray="2 3" />
              <polygon points="16,1 21,6 16,11 11,6" fill="white" stroke="#D97706" strokeWidth={1.8} />
            </svg>
            <span style={{ color: '#D97706' }}>매장 평균 평수 ◆</span>
          </span>
          <span className="text-stone-400 text-[10px]">(우축은 기준 시점=100 인덱스)</span>
        </div>
      </div>
    </Card>
  );
}

// ── 보조 컴포넌트 ──────────────────────────────────────────────

function BanCard({ title, unit, snapshot, field, refYm, decimals = 0 }) {
  if (!snapshot || snapshot.length === 0) {
    return (
      <div className="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 flex flex-col">
        <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{title}</div>
        <div className="text-2xl font-bold text-stone-300 tabular-nums mt-1">—</div>
        <div className="text-[10px] text-stone-400 italic mt-1">데이터 준비 중</div>
      </div>
    );
  }
  const sortedSnap = [...snapshot].sort((a, b) => a.ym.localeCompare(b.ym));
  const refRow = sortedSnap.find(s => s.ym === refYm) ?? sortedSnap[sortedSnap.length - 1];
  const refIdx = sortedSnap.findIndex(s => s.ym === refRow?.ym);
  const prev = refIdx > 0 ? sortedSnap[refIdx - 1] : null;
  const cur = refRow?.[field];
  const prevVal = prev?.[field];
  const delta = (cur != null && prevVal != null) ? cur - prevVal : null;
  const pct = (delta != null && prevVal) ? (delta / prevVal) * 100 : null;
  return (
    <div className="bg-white border border-stone-200 rounded-lg p-3 sm:p-4 flex flex-col">
      <div className="text-[11px] font-bold uppercase tracking-wider text-stone-500">{title}</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl sm:text-3xl font-bold text-stone-900 tabular-nums">
          {cur != null ? (decimals > 0 ? cur.toFixed(decimals) : fmt(cur)) : '—'}
        </span>
        <span className="text-xs text-stone-400">{unit}</span>
      </div>
      {delta != null && pct != null && (
        <div className="text-[11px] mt-1 tabular-nums" style={{ color: deltaColor(delta) }}>
          {delta > 0 ? '+' : ''}{decimals > 0 ? delta.toFixed(decimals) : fmt(delta)}{unit ? unit : ''}({arrow(delta)}{Math.abs(pct).toFixed(1)}%)
        </div>
      )}
      <div className="text-[10px] text-stone-400 italic mt-0.5">
        {refRow?.ym ?? '—'} 기준 · 직전 시점 대비
      </div>
    </div>
  );
}

function BanAccidentCard({ current, comparisons }) {
  return (
    <div className="bg-white border border-stone-100 rounded-xl p-3 sm:p-4 flex flex-col">
      <div className="text-[11px] font-bold uppercase tracking-wider" style={{ color: ALERT_RED }}>사고건수</div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span className="text-2xl sm:text-3xl font-bold tabular-nums" style={{ color: ALERT_RED }}>
          {current != null ? fmt(current) : '—'}
        </span>
        <span className="text-xs text-stone-400">건</span>
      </div>
      <div className="mt-1 space-y-0.5">
        {comparisons.map(c => (
          <div key={c.label} className="text-[10px] leading-snug">
            <span className="text-stone-500">vs {c.label}</span>{' '}
            {c.missing ? (
              <span className="text-stone-400 italic">데이터 없음</span>
            ) : (
              <span className="tabular-nums" style={{ color: deltaColor(c.delta) }}>
                {c.delta > 0 ? '+' : ''}{c.delta}건{c.pct != null ? `(${arrow(c.delta)}${Math.abs(c.pct).toFixed(1)}%)` : ''}
              </span>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function TufteTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  const p = payload[0]?.payload ?? {};
  return (
    <div className="bg-white border border-stone-200 rounded shadow-lg px-3 py-2 text-xs">
      <div className="font-bold text-stone-900 mb-1">{label}{p.isRef && <span className="ml-1 text-red-600">★ 기준</span>}</div>
      <div className="space-y-0.5">
        <div><span className="text-stone-500">사고건수:</span> <span className="font-bold tabular-nums" style={{ color: ALERT_RED }}>{p.사고건수 ?? '—'}건</span></div>
        {p.수도권 != null && <div><span className="text-stone-500">수도권:</span> <span className="font-semibold tabular-nums">{p.수도권}건</span></div>}
        {p.지방 != null && <div><span className="text-stone-500">지방:</span> <span className="font-semibold tabular-nums">{p.지방}건</span></div>}
        {p.store != null && <div><span className="text-stone-500">매장수:</span> <span className="font-semibold tabular-nums">{p.store.toLocaleString()}개</span></div>}
        {p.worker != null && <div><span className="text-stone-500">근로자수:</span> <span className="font-semibold tabular-nums">{p.worker.toLocaleString()}명</span></div>}
        {p.avgArea != null && <div><span className="text-stone-500">평균 평수:</span> <span className="font-semibold tabular-nums">{p.avgArea.toFixed(1)}평</span></div>}
      </div>
    </div>
  );
}

export default PeriodComparison;

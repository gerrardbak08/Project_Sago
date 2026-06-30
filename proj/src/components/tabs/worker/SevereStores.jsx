// 중상해 매장 (근로손실 91일 이상) — newjuna 차용 + 우리 severe91 실측 데이터.
// 중대재해처벌법 §2(2호) 사전 모니터링 대상. processAccidents.severe91 사용.
import { useState, useEffect, useRef, Fragment } from 'react';
import { Card, EmptyState } from '../../shared/Card.jsx';
import { fmt } from '../../../utils/uiHelpers.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { AlertTriangle, Stethoscope, ChevronRight } from 'lucide-react';

// 모듈 최상위에 정의 — SevereStores 내부 정의 시 매 렌더마다 컴포넌트 타입이 재생성돼 hook 상태 소실됨.
const Kpi = ({ label, value, unit, sub, accent, delay, inView }) => {
  const [ce, setCe] = useState(false);
  useEffect(() => {
    if (!inView) return;
    const t = setTimeout(() => setCe(true), delay || 0);
    return () => clearTimeout(t);
  }, [inView, delay]);
  const count = useCountUp(value, 900, ce);
  return (
    <div
      className="rounded-[16px] bg-white border border-stone-200/70 p-4 dash-slide-up"
      style={{ boxShadow: '0 6px 16px rgba(7,30,74,0.05)', animationDelay: `${delay || 0}ms` }}
    >
      <div className="text-xs text-stone-500">{label}</div>
      <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ color: accent || '#071E4A' }}>
        {count.toLocaleString()}<span className="text-xs font-normal text-stone-400 ml-1">{unit}</span>
      </div>
      {sub && <div className="text-[11px] text-stone-400 mt-1">{sub}</div>}
    </div>
  );
};

function SevereStores({ D, yearFilter }) {
  const sev = D?.severe91 || {};
  const [open, setOpen] = useState(null);
  const accidents = D?.accidents || [];
  const dateStr = (d) => { if (!d) return '-'; const s = d instanceof Date ? d.toISOString() : String(d); return s.slice(0, 10); };
  const histOf = (store) => accidents.filter(a => a.store === store && (!yr || a.year === +yr)).sort((a, b) => (b.date || 0) - (a.date || 0));
  const yr = !yearFilter || yearFilter === 'all' ? null : yearFilter;
  // severe91.stores 는 전체기간. 연도 선택 시 recentDate 연도로 근사 필터(실측 건수 기준).
  let stores = (sev.stores || []).slice();
  if (yr) stores = stores.filter(s => String(s.recentDate || '').startsWith(yr));
  stores.sort((a, b) => (b.maxDays || 0) - (a.maxDays || 0));

  const total = yr ? (sev['y' + yr] ?? 0) : (sev.total ?? 0);
  const storeCount = stores.length;
  const yCount = yr ? (n) => (D.accidents || []).filter(a => a.store === n && a.loss_days >= 91 && a.year === +yr).length : null;
  const repeat2 = stores.filter(s => (yCount ? yCount(s.store) : (s.count || 0)) >= 2).length;
  const lossSum = yr
    ? (D.accidents || []).filter(a => a.store && a.loss_days >= 91 && a.year === +yr).reduce((s, a) => s + a.loss_days, 0)
    : stores.reduce((s, x) => s + (x.lossDays || 0), 0);
  // yr 활성 시 해당연도 91일↑ 건에서 maxDays·lossDays 재계산
  const yrStoreStats = yr
    ? Object.fromEntries(stores.map(s => {
        const yrAccs = (D.accidents || []).filter(a => a.store === s.store && (a.loss_days ?? 0) >= 91 && a.year === +yr);
        return [s.store, {
          maxDays: yrAccs.reduce((m, a) => Math.max(m, a.loss_days || 0), 0),
          lossDays: yrAccs.reduce((sum, a) => sum + (a.loss_days || 0), 0),
        }];
      }))
    : null;
  // mini bar 기준: 전체 매장 중 최장 maxDays (0-division 방어)
  const maxAll = yrStoreStats
    ? Math.max(...Object.values(yrStoreStats).map(v => v.maxDays), 1)
    : stores.reduce((m, x) => Math.max(m, x.maxDays || 0), 1);

  // KPI 그리드 진입 감지 → countUp 게이팅
  const kpiRef = useRef(null);
  const kpiInView = useInView(kpiRef);

  const kpiItems = [
    { label: '91일↑ 재해',      value: total,       unit: '건', sub: '산재 승인 기준 실측',   accent: '#E60033' },
    { label: '발생 매장',        value: storeCount,  unit: '개', sub: null,                    accent: null },
    { label: '2건 이상 매장',    value: repeat2,     unit: '개', sub: '집중 모니터링 대상',    accent: repeat2 > 0 ? '#D97706' : '#071E4A' },
    { label: '중상해 근로손실',  value: lossSum,     unit: '일', sub: '91일↑ 건 합계',         accent: null },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#071E4A]">
        <AlertTriangle size={16} className="text-[#E60033]" /> 중상해 매장 — 근로손실 91일 이상
        <span className="text-[11px] font-normal text-stone-400">중대재해처벌법 §2(2호) 사전 모니터링</span>
      </div>

      {/* KPI 그리드 — stagger delay + useInView 게이팅 countUp */}
      <div ref={kpiRef} className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        {kpiItems.map((item, i) => (
          <Kpi key={i} {...item} delay={i * 70} inView={kpiInView} />
        ))}
      </div>

      <Card title="중상해 매장 목록" titleIcon={Stethoscope} sub={`${yr ? yr + '년' : '전체 기간'} · 근로손실 91일 이상 매장 (최장 손실일 순)`}>
        {storeCount === 0 ? (
          <EmptyState message="해당 기간 중상해(91일↑) 매장이 없습니다" icon={Stethoscope} />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-[13px]">
              <thead>
                <tr className="text-stone-500 border-b border-stone-200">
                  <th className="text-left font-semibold py-2 px-2">순위</th>
                  <th className="text-left font-semibold py-2 px-2">매장</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">영업부 · 팀</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">최근 재해일</th>
                  <th className="text-right font-semibold py-2 px-2">건수</th>
                  <th className="text-right font-semibold py-2 px-2">최장 손실</th>
                  <th className="text-right font-semibold py-2 px-2 hidden sm:table-cell">총 손실</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">주요 유형</th>
                </tr>
              </thead>
              <tbody>
                {stores.map((s, i) => {
                  const key = s.store + i;
                  const isOpen = open === key;
                  // 항상 계산 — expansion div가 항상 DOM에 있어 max-h transition 가능
                  const hist = histOf(s.store);
                  const effMaxDays = yrStoreStats ? (yrStoreStats[s.store]?.maxDays ?? 0) : (s.maxDays || 0);
                  const effLossDays = yrStoreStats ? (yrStoreStats[s.store]?.lossDays ?? 0) : (s.lossDays || 0);
                  const barPct = Math.round((effMaxDays / maxAll) * 100);
                  return (
                    <Fragment key={key}>
                      {/* 메인 행 */}
                      <tr
                        className="border-b border-stone-100 hover:bg-blue-50/40 cursor-pointer transition-colors active:scale-[0.97]"
                        onClick={() => setOpen(isOpen ? null : key)}
                      >
                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-stone-400 tabular-nums">{i + 1}</td>

                        {/* 매장명 셀 — 모바일에서 dept·team·recentDate 서브라인 표시 */}
                        <td className="py-3 px-3 sm:py-2 sm:px-2 font-bold text-[#071E4A]">
                          <span className="inline-flex items-start gap-1">
                            <ChevronRight
                              size={13}
                              className={`text-stone-400 flex-shrink-0 mt-0.5 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            />
                            <span>
                              {s.store}
                              <span className="block sm:hidden text-[10px] font-normal text-stone-400 leading-tight mt-0.5 break-keep">
                                {s.dept} · {s.team} · {s.recentDate || '-'}
                              </span>
                            </span>
                          </span>
                        </td>

                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-stone-600 hidden sm:table-cell">{s.dept} · {s.team}</td>
                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-stone-500 tabular-nums hidden sm:table-cell">{s.recentDate || '-'}</td>

                        {/* 건수 + count>=2 "반복" amber 칩 */}
                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-right tabular-nums">
                          <div className="flex items-center justify-end gap-1 flex-wrap">
                            <span>{(yCount ? yCount(s.store) : s.count)}건</span>
                            {(yCount ? yCount(s.store) : (s.count || 0)) >= 2 && (
                              <span className="inline-block px-1 py-0.5 rounded text-[9px] font-bold bg-amber-100 text-amber-700 leading-none">
                                반복
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 최장 손실 + mini bar */}
                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-right">
                          <span
                            className="font-bold tabular-nums"
                            style={{ color: effMaxDays >= 180 ? '#E60033' : '#071E4A' }}
                          >
                            {fmt(effMaxDays)}일
                          </span>
                          <div className="mt-0.5 h-1 rounded-full bg-stone-100 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-red-400/70 transition-[width] duration-500"
                              style={{ width: `${barPct}%` }}
                            />
                          </div>
                        </td>

                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-right tabular-nums text-stone-600 hidden sm:table-cell">{fmt(effLossDays)}일</td>
                        <td className="py-3 px-3 sm:py-2 sm:px-2 text-stone-600 hidden sm:table-cell">{s.topType || '-'}</td>
                      </tr>

                      {/* 펼침 행 — max-h CSS transition으로 부드러운 열림/닫힘 */}
                      <tr>
                        <td colSpan={8} className="p-0">
                          <div
                            className={`overflow-hidden transition-[max-height] duration-300 ease-in-out ${isOpen ? 'max-h-[900px]' : 'max-h-0'}`}
                          >
                            <div className="bg-stone-50/70 px-4 py-3">
                              <div className="text-[11px] font-bold text-stone-500 mb-1.5">
                                {s.store} · 사고 이력 {hist.length}건
                                <span className="text-stone-400 font-normal"> (91일↑ 중상해는 빨강)</span>
                              </div>
                              {hist.length === 0 ? (
                                <div className="text-[11px] text-stone-400 py-1">상세 사고 레코드가 없습니다</div>
                              ) : (
                                <div className="space-y-2">
                                  {hist.map((a, j) => {
                                    const severe = (a.loss_days || 0) >= 91;
                                    return (
                                      <div
                                        key={j}
                                        className={`text-[11px] sm:text-xs rounded-md px-2 py-1.5 ${
                                          severe
                                            ? 'border border-red-100 border-l-2 border-l-red-400 bg-red-50/30'
                                            : 'bg-white border border-stone-100'
                                        }`}
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="text-stone-400 tabular-nums w-[80px] flex-shrink-0">{dateStr(a.date)}</span>
                                          <span className="font-semibold text-[#071E4A] w-[90px] flex-shrink-0 truncate">{a.type || '기타'}</span>
                                          <span
                                            className="truncate flex-1"
                                            style={{ color: severe ? '#E60033' : '#78716C', fontWeight: severe ? 700 : 400 }}
                                          >
                                            {a.loss_days ? `근로손실 ${a.loss_days}일` : (a.site || a.kind || '')}
                                          </span>
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
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

export default SevereStores;

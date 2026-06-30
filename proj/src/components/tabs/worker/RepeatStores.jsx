// 반복사고 매장 (동일 매장 2건 이상) — newjuna 차용 + 우리 라이브 데이터(repeat_stores).
// 영업부별 분포 + 매장 리스트.
import { useState, Fragment, useRef } from 'react';
import { Card, EmptyState } from '../../shared/Card.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { Siren, MapPin, ChevronRight } from 'lucide-react';

function RepeatStores({ D, yearFilter }) {
  const rs = D?.repeat_stores || (() => {
    const map = {};
    for (const a of (D?.accidents || [])) {
      const key = a.store;
      if (!key) continue;
      if (!map[key]) map[key] = { store: key, dept: a.dept || '', team: a.team || '', count: 0, recentDate: '', _types: {} };
      map[key].count++;
      const d = String(a.date || '').slice(0, 10);
      if (d > map[key].recentDate) map[key].recentDate = d;
      if (a.type) map[key]._types[a.type] = (map[key]._types[a.type] || 0) + 1;
    }
    const list = Object.values(map)
      .filter(s => s.count >= 2)
      .map(s => {
        const top = Object.entries(s._types).sort((a, b) => b[1] - a[1])[0];
        return { store: s.store, dept: s.dept, team: s.team, count: s.count, recentDate: s.recentDate || '-', topType: top?.[0] || '-' };
      });
    const byDept = {};
    for (const s of list) byDept[s.dept || '정보 없음'] = (byDept[s.dept || '정보 없음'] || 0) + 1;
    return { list, byDept, total: list.length };
  })();
  const [open, setOpen] = useState(null);
  const accidents = D?.accidents || [];
  const dateStr = (d) => { if (!d) return '-'; const s = d instanceof Date ? d.toISOString() : String(d); return s.slice(0, 10); };
  const histOf = (store) => accidents.filter(a => a.store === store && (!yr || a.year === +yr)).sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const yr = !yearFilter || yearFilter === 'all' ? null : yearFilter;
  const yearCount = (store) => accidents.filter(a => a.store === store && a.year === +yr).length;
  const displayCount = (s) => yr ? yearCount(s.store) : (s.count || 0);
  let list = (rs.list || []).slice();
  if (yr) list = list.filter(s => yearCount(s.store) >= 2);
  list.sort((a, b) => displayCount(b) - displayCount(a));

  // 영업부별 분포 (현재 list 기준 재집계)
  const byDept = {};
  for (const s of list) byDept[s.dept || '정보 없음'] = (byDept[s.dept || '정보 없음'] || 0) + 1;
  const deptDist = Object.entries(byDept).sort((a, b) => b[1] - a[1]);

  const total = list.length;
  const cnt3 = list.filter(s => displayCount(s) >= 3).length;
  const maxDept = deptDist[0];
  const maxN = deptDist[0]?.[1] || 1;

  // KPI 카운트업 — inView 게이팅
  const kpiRef = useRef(null);
  const kpiInView = useInView(kpiRef);
  const cTotal = useCountUp(total, 900, kpiInView);
  const cCnt3 = useCountUp(cnt3, 900, kpiInView);
  const cMaxDeptN = useCountUp(maxDept ? maxDept[1] : 0, 900, kpiInView);

  const displayDate = (s) => yr
    ? ((accidents.filter(a => a.store === s.store && a.year === +yr)
        .sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')))
      [0]?.date || '').slice(0, 10) || '-')
    : (s.recentDate || '-');

  const lvl = (n) => n >= 3 ? { l: '주의', c: '#E60033', bg: '#FEF2F2' } : { l: '관찰', c: '#D97706', bg: '#FFFBEB' };

  // yr 활성 시 해당 연도 건만 집계해 주요 유형 반환, 아니면 전기간값 그대로
  const topTypeOf = (store, topType) => yr
    ? (() => {
        const t = {};
        for (const a of accidents.filter(a => a.store === store && a.year === +yr))
          t[a.type] = (t[a.type] || 0) + 1;
        return Object.entries(t).sort((a, b) => b[1] - a[1])[0]?.[0] || '-';
      })()
    : (topType || '-');

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-sm font-extrabold text-[#071E4A]">
        <Siren size={16} className="text-[#E60033]" /> 반복사고 매장 — 동일 매장 2건 이상
        <span className="text-[11px] font-normal text-stone-400">{yr ? yr + '년' : '전체 기간'} 기준</span>
      </div>

      {/* KPI 카드 — stagger dash-slide-up + countup */}
      <div ref={kpiRef} className="grid grid-cols-2 sm:grid-cols-3 gap-2 sm:gap-3">
        <div className="dash-slide-up rounded-[16px] bg-white border border-stone-200/70 p-4" style={{ boxShadow: '0 6px 16px rgba(7,30,74,0.05)', animationDelay: '0ms' }}>
          <div className="text-xs text-stone-500">반복사고 매장</div>
          <div className="text-2xl font-extrabold tabular-nums mt-1 text-[#071E4A]">{cTotal}<span className="text-xs font-normal text-stone-400 ml-1">개</span></div>
        </div>
        <div className="dash-slide-up rounded-[16px] bg-white border border-stone-200/70 p-4" style={{ boxShadow: '0 6px 16px rgba(7,30,74,0.05)', animationDelay: '80ms' }}>
          <div className="text-xs text-stone-500">3건 이상 매장</div>
          <div className="text-2xl font-extrabold tabular-nums mt-1" style={{ color: cnt3 > 0 ? '#E60033' : '#071E4A' }}>{cCnt3}<span className="text-xs font-normal text-stone-400 ml-1">개</span></div>
          <div className="text-[11px] text-stone-400 mt-1">집중 관리 대상</div>
        </div>
        <div className="dash-slide-up rounded-[16px] bg-white border border-stone-200/70 p-4 col-span-2 sm:col-span-1" style={{ boxShadow: '0 6px 16px rgba(7,30,74,0.05)', animationDelay: '160ms' }}>
          <div className="text-xs text-stone-500">최다 영업부</div>
          <div className="text-lg font-extrabold mt-1 text-[#071E4A]">{maxDept ? maxDept[0] : '-'}</div>
          <div className="text-[11px] text-stone-400 mt-0.5">{maxDept ? `반복매장 ${cMaxDeptN}개` : ''}</div>
        </div>
      </div>

      {/* 영업부별 분포 — h-1 프로그레스 바 추가 */}
      <Card title="영업부별 반복사고 분포" titleIcon={MapPin} sub="영업부별 반복사고(2건↑) 매장 수">
        {deptDist.length === 0 ? <EmptyState message="반복사고 매장이 없습니다" icon={MapPin} /> : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2">
            {deptDist.map(([dept, n]) => {
              const v = lvl(n);
              return (
                <div key={dept} className="rounded-xl border p-3" style={{ borderColor: v.c + '40', background: v.bg }}>
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-stone-700">{dept}</span>
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full text-white" style={{ background: v.c }}>{v.l}</span>
                  </div>
                  <div className="text-xl font-extrabold tabular-nums mt-1" style={{ color: v.c }}>{n}<span className="text-xs font-normal text-stone-400 ml-0.5">개 매장</span></div>
                  {/* 비율 트랙 바 */}
                  <div className="mt-2 h-1 bg-stone-200 rounded-full overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${Math.round((n / maxN) * 100)}%`, background: v.c }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      {/* 반복사고 매장 목록 */}
      <Card title="반복사고 발생 매장" titleIcon={Siren} sub={`총 ${total}개 매장 (사고 건수 순)`}>
        {total === 0 ? <EmptyState message="반복사고 매장이 없습니다" icon={Siren} /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-[13px]">
              <thead>
                <tr className="text-stone-500 border-b border-stone-200">
                  <th className="text-left font-semibold py-2 px-2 w-[36px] sm:w-auto">순위</th>
                  <th className="text-left font-semibold py-2 px-2">매장</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">영업부 · 팀</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">최근 재해일</th>
                  <th className="text-left font-semibold py-2 px-2">주요 유형</th>
                  <th className="text-right font-semibold py-2 px-2 w-[36px] sm:w-auto">건수</th>
                </tr>
              </thead>
              <tbody>
                {list.slice(0, 100).map((s, i) => {
                  const key = s.store;
                  const isOpen = open === key;
                  const hist = isOpen ? histOf(s.store) : [];
                  return (
                    <Fragment key={key}>
                      <tr
                        className="border-b border-stone-100 hover:bg-stone-50 cursor-pointer active:scale-[0.97] transition-transform"
                        onClick={() => setOpen(isOpen ? null : key)}
                      >
                        {/* 순위 */}
                        <td className="py-3 sm:py-2 px-2 text-stone-400 tabular-nums w-[36px] sm:w-auto">{i + 1}</td>
                        {/* 매장명 — 모바일에서 dept/team/recentDate 인라인 보완 */}
                        <td className="py-3 sm:py-2 px-2 font-bold text-[#071E4A]">
                          <span className="inline-flex items-center gap-1">
                            <ChevronRight
                              size={13}
                              className={`text-stone-400 flex-shrink-0 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
                            />
                            {s.store}
                          </span>
                          <div className="sm:hidden text-[10px] text-stone-400 mt-0.5 font-normal break-keep">
                            {s.dept} · {s.team} · {displayDate(s)}
                          </div>
                        </td>
                        <td className="py-3 sm:py-2 px-2 text-stone-600 hidden sm:table-cell">{s.dept} · {s.team}</td>
                        <td className="py-3 sm:py-2 px-2 text-stone-500 tabular-nums hidden sm:table-cell">{displayDate(s)}</td>
                        <td className="py-3 sm:py-2 px-2 text-stone-700">{topTypeOf(s.store, s.topType)}</td>
                        {/* 건수 */}
                        <td className="py-3 sm:py-2 px-2 text-right font-bold tabular-nums w-[36px] sm:w-auto" style={{ color: displayCount(s) >= 3 ? '#E60033' : '#071E4A' }}>{displayCount(s)}건</td>
                      </tr>

                      {/* 사고 이력 펼침 — dash-slide-down 진입 애니메이션 */}
                      {isOpen && (
                        <tr className="bg-stone-50/70">
                          <td colSpan={6} className="px-3 py-2.5">
                            <div className="dash-slide-down">
                              <div className="text-[11px] font-bold text-stone-500 mb-1.5">{s.store} · 사고 이력 {hist.length}건</div>
                              {hist.length === 0 ? (
                                <div className="text-[11px] text-stone-400 py-1">상세 사고 레코드가 없습니다 (집계 {s.count}건)</div>
                              ) : (
                                <div className="space-y-1">
                                  {hist.map((a, j) => (
                                    <div key={j} className="text-[11px] sm:text-xs bg-white border border-stone-100 rounded-md px-2 py-1.5">
                                      <div className="flex items-center gap-2 flex-wrap">
                                        {/* 날짜 — italic */}
                                        <span className="text-[10px] italic text-stone-400 tabular-nums flex-shrink-0">{dateStr(a.date)}</span>
                                        {/* 사고 유형 배지 */}
                                        <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-[#EFF6FF] text-[#1D4ED8] flex-shrink-0">{a.type || '기타'}</span>
                                        {/* 근로손실일 배지 — 14일↑ 레드 / 미만 앰버 */}
                                        {a.loss_days ? (
                                          <span
                                            className={`text-[10px] font-bold px-1.5 py-0.5 rounded flex-shrink-0 ${Number(a.loss_days) >= 14 ? 'bg-red-50 text-[#E60033]' : 'bg-amber-50 text-[#D97706]'}`}
                                          >
                                            {a.loss_days}일
                                          </span>
                                        ) : null}
                                        <span className="text-stone-500 truncate flex-1">{a.site || a.kind || ''}</span>
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
        )}
      </Card>
    </div>
  );
}

export default RepeatStores;

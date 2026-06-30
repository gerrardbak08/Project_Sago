import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingDown, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS, rankColor } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix, gradientCells } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';

const yoy = (cur, prev) => prev ? ((cur - prev) / prev * 100) : null;

function DeptTeamStore({ D, yearFilter }) {
  const [bum, setBum] = useState("수도권");
  const [selDept, setSelDept] = useState(null);
  const [storeSearch, setStoreSearch] = useState("");

  const isYearFilter = yearFilter !== "all";
  const yearKey = isYearFilter ? `y${yearFilter.slice(2)}` : "total";
  // 부서별 YoY — 선택 연도 기준 동적 (전체=2024→2025 최근 2개 완결연도)
  const yoyCurY = isYearFilter ? parseInt(yearFilter) : CURRENT_YEAR;
  const yoyPrevY = yoyCurY - 1;
  const yoyCurK = 'y' + String(yoyCurY).slice(2);
  const yoyPrevK = 'y' + String(yoyPrevY).slice(2);
  const yoyHasPrev = ['y24', 'y25', 'y26'].includes(yoyPrevK);

  // 연도 필터 시 해당 연도 값을 total로 사용 + per_store 재계산
  const transform = (rows) => rows.map(r => {
    if (!isYearFilter) return r;
    const y = r[yearKey] || 0;
    return {
      ...r,
      total: y,
      // 매장당 사고: 사고 발생 매장 수 기반인데 연도별 매장수가 없어 비례 추정
      per_store: r.stores ? Math.round(y / r.stores * 100) / 100 : r.per_store,
    };
  });

  const deptsAll = transform(D.depts);
  const teamsAll = transform(D.teams);

  const allD = [...deptsAll].sort((a, b) => b.total - a.total);
  const deptsByPerStore = [...deptsAll].sort((a, b) => b.per_store - a.per_store);
  const depts = deptsAll.filter(d => d.bum === bum).sort((a, b) => b.total - a.total);
  const teams = teamsAll.filter(t => t.bum === bum && (!selDept || t.dept === selDept)).sort((a, b) => b.total - a.total);

  // 매장별 사고는 연도 breakdown 없음 → 비례 추정 (0건 매장은 제외)
  const storeRatio = isYearFilter ? (D.kpis[`y${yearFilter}`] || 0) / (D.kpis.total || 1) : 1;
  const stores = D.stores
    .map(s => isYearFilter ? { ...s, total: Math.round((s.total || 0) * storeRatio) } : s)
    .filter(s => isYearFilter ? s.total > 0 : s.total >= 3)
    .filter(s => !storeSearch || s.store.includes(storeSearch) || s.dept.includes(storeSearch) || s.team.includes(storeSearch))
    .slice(0, 25);

  // 매장 워스트 테이블 — mini bar 기준값
  const maxStore = stores.length > 0 ? Math.max(...stores.map(s => s.total || 0), 1) : 1;

  // top-3 행 왼쪽 강조 테두리 + 배경
  const rowAccent = (i) => {
    if (i === 0) return { border: 'border-l-[3px] border-l-red-500', bg: 'bg-red-50/40' };
    if (i === 1) return { border: 'border-l-[3px] border-l-[#1D4ED8]', bg: 'bg-blue-50/30' };
    if (i === 2) return { border: 'border-l-[3px] border-l-amber-500', bg: 'bg-amber-50/30' };
    return { border: '', bg: '' };
  };
  // 순위 셀 배지 컬러
  const rankBadge = (i) => {
    if (i === 0) return 'bg-red-100 text-red-700 border border-red-200';
    if (i === 1) return 'bg-blue-100 text-[#1D4ED8] border border-blue-200';
    if (i === 2) return 'bg-amber-100 text-amber-700 border border-amber-200';
    return 'bg-stone-100 text-stone-500 border border-stone-200';
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* U3: 부문 선택 — 탭 상단 고정 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-3 flex items-center gap-2 flex-wrap border border-stone-100 shadow-sm -mx-0.5">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">부문</span>
        {["수도권", "지방"].map(b => (
          <button key={b} onClick={() => { setBum(b); setSelDept(null); }} className={`min-h-[44px] px-4 py-2 rounded-full text-sm font-semibold border transition cursor-pointer ${bum === b ? (b === "수도권" ? "bg-blue-600 text-white border-blue-600" : "bg-[#93C5FD] text-[#071E4A] border-[#93C5FD]") : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>{b}영업부문</button>
        ))}
        {selDept && <button onClick={() => setSelDept(null)} className="min-h-[44px] ml-2 px-3 py-2 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"><X size={11} className="inline -mt-0.5 mr-0.5" />{selDept} 선택 해제</button>}
      </div>

      <Card title="영업부 전체 사고 랭킹" titleIcon={Building2} delay={0} sub={`${isYearFilter ? `${yearFilter}년` : "전체 기간"} 10개 영업부 — ${bum} 부문 강조 · 막대 클릭 시 부문 전환`} right={<ExportBtn rows={allD.map(d => ({부문: d.bum, 부서: d.dept, 총: d.total, Y24: d.y24, Y25: d.y25, Y26: d.y26, 매장수: d.stores, 매장당: d.per_store}))} filename="부서별_사고현황.csv" />}>
        <ResponsiveContainer width="100%" height={360} debounce={50}>
          <BarChart key={`allD-${bum}-${yearFilter}`} data={allD} layout="vertical" margin={{ left: 0 }} onClick={(e) => { if (e?.activePayload?.length > 0) { const p = e.activePayload[0].payload; setBum(p.bum); setSelDept(p.dept); } }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={140} interval={0} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            {isYearFilter ? (
              <Bar dataKey="total" name={`${yearFilter}년`} radius={[0, 6, 6, 0]} animationDuration={700}>
                {(() => { const ranked = [...allD].sort((a, b) => (b.total || 0) - (a.total || 0)); return allD.map((d, i) => (
                  <Cell key={i} fill={rankColor(ranked.indexOf(d))} opacity={d.bum === bum ? 1 : 0.45} />
                )); })()}
                <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NV, fontWeight: 700 }} />
              </Bar>
            ) : (
              <>
                <Bar dataKey="y24" stackId="a" fill="#D6D3D1" name="2024" animationDuration={700}>
                  {allD.map((d, i) => <Cell key={i} fill="#D6D3D1" opacity={d.bum === bum ? 1 : 0.35} />)}
                </Bar>
                <Bar dataKey="y25" stackId="a" fill={BL} name="2025" animationDuration={700} animationBegin={120}>
                  {allD.map((d, i) => <Cell key={i} fill={BL} opacity={d.bum === bum ? 1 : 0.35} />)}
                </Bar>
                <Bar dataKey="y26" stackId="a" fill={OR} name="2026" radius={[0, 6, 6, 0]} animationDuration={700} animationBegin={240}>
                  {allD.map((d, i) => <Cell key={i} fill={OR} opacity={d.bum === bum ? 1 : 0.35} />)}
                  <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NV, fontWeight: 700 }} />
                </Bar>
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </Card>

      {/* Normalized metric */}
      <Card title="매장당 사고율 정규화" titleIcon={Target} delay={70} sub="절대건수는 규모 반영 — 매장당 건수로 진짜 위험도 판단">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart key={`perStore-${bum}-${yearFilter}`} data={deptsByPerStore} layout="vertical" margin={{ left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={120} interval={0} />
              <Tooltip content={<TT />} />
              <Bar dataKey="per_store" fill={BL} radius={[0, 6, 6, 0]} name="매장당 사고" animationDuration={700}>
                {deptsByPerStore.map((d, i) => (
                  <Cell key={i} fill={BL} opacity={d.bum === bum ? 1 : 0.35} />
                ))}
                <LabelList dataKey="per_store" position="right" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-sm text-stone-700 space-y-2">
            <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep">
              <div className="text-xs font-bold text-[#003B8F] mb-1">해석 방법</div>
              <div>절대 건수로는 {allD[0] ? `${allD[0].dept}(${allD[0].total}건)` : "최다 부서"}가 1위지만, 매장당 사고율로 보면 순위가 달라집니다. 매장 당 건수가 많을수록 단위 매장의 <b>상대적 위험도</b>가 높음을 의미합니다.</div>
            </div>
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs">
              현재는 사고 발생 매장 기준. 실제 부서별 총 매장 수가 확보되면 더 정확한 Incident Rate 산출 가능.
            </div>
          </div>
        </div>
      </Card>


      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`${bum} - 부서별 연도`} delay={140} sub="막대 클릭하면 팀 필터링">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart key={`depts-${bum}-${yearFilter}`} data={depts} margin={{ left: 10, top: 10 }} onClick={(e) => { if (e?.activePayload?.length > 0) setSelDept(e.activePayload[0].payload.dept); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="dept" tick={{ fontSize: 9, fill: "#57534E" }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              {isYearFilter ? (
                <Bar dataKey="total" fill={bum === "수도권" ? BL : OR} radius={[4, 4, 0, 0]} name={`${yearFilter}년`} animationDuration={700} />
              ) : (
                <>
                  <Bar dataKey="y24" fill="#D6D3D1" radius={[4, 4, 0, 0]} name="2024" animationDuration={700} />
                  <Bar dataKey="y25" fill={BL} radius={[4, 4, 0, 0]} name="2025" animationDuration={700} animationBegin={120} />
                  <Bar dataKey="y26" fill={bum === "수도권" ? "#93C5FD" : "#FED7AA"} radius={[4, 4, 0, 0]} name="2026" animationDuration={700} animationBegin={240} />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`${bum} - 부서별 YoY`} delay={210} sub={yoyHasPrev ? `${yoyPrevY}→${yoyCurY} 증감률 · 매장IR 탭에서 팀별 상세 확인` : `${yoyCurY} 기준 (전년 데이터 없음)`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {!yoyHasPrev ? (
              <div className="col-span-full text-xs text-stone-400 py-3 text-center">{yoyCurY}년은 전년({yoyPrevY}) 데이터가 없어 YoY 산출 불가</div>
            ) : [...depts].sort((a,b) => {
              const ya = a[yoyPrevK] > 0 ? (a[yoyCurK] - a[yoyPrevK]) / a[yoyPrevK] * 100 : null;
              const yb = b[yoyPrevK] > 0 ? (b[yoyCurK] - b[yoyPrevK]) / b[yoyPrevK] * 100 : null;
              return (yb ?? -999) - (ya ?? -999);
            }).map(d => {
              const yoyVal = d[yoyPrevK] > 0 ? yoy(d[yoyCurK], d[yoyPrevK]) : null;
              const isUp = yoyVal !== null && yoyVal > 0;
              const isDown = yoyVal !== null && yoyVal < 0;
              return (
                <div key={d.dept} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-stone-50 border border-stone-100">
                  <div className="text-xs font-semibold text-stone-700 truncate flex-1 min-w-0">{d.dept}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-stone-400 tabular-nums">{d[yoyPrevK]}→{d[yoyCurK]}건</span>
                    {yoyVal !== null ? (
                      <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded transition-all flex items-center gap-0.5"
                        style={{
                          color: isUp ? ALERT_RED : isDown ? SAFE_GREEN : "#78716C",
                          background: isUp ? "#FEE2E2" : isDown ? "#DCFCE7" : "#F5F5F4"
                        }}>
                        {isUp ? <TrendingUp size={10} /> : isDown ? <TrendingDown size={10} /> : <span className="text-[10px]">─</span>}
                        {Math.abs(yoyVal).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-300 px-1.5">─</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {yoyHasPrev && (
            <div className="mt-2 text-[10px] text-stone-400">※ {yoyPrevY} 사고 0건인 부서는 YoY 산출 불가 · 팀별 상세 → 매장IR 탭</div>
          )}
        </Card>
      </div>

      <Card title={`${bum} - 부서별 월간 히트맵`} delay={280} sub="색상이 진할수록 사고 다발">
        <HeatmapGrid rows={depts.map(d => ({ label: d.dept.replace("영업부", ""), total: d.total, hm: d.hm }))} yearFilter={yearFilter} />
      </Card>

      <Card title={`${selDept || bum} - 팀별 월간 히트맵`} delay={350} sub="팀 단위 월간 사고 패턴">
        <HeatmapGrid rows={teams.map(t => ({ label: t.team, total: t.total, hm: t.hm }))} yearFilter={yearFilter} />
      </Card>

      {/* 매장 드릴다운 */}
      <Card title="매장별 워스트 Top 25" titleIcon={Store} delay={420} sub={isYearFilter ? `${yearFilter}년 사고 발생 매장 (비례 추정)` : "사고 3건 이상 발생 매장 — 집중관리 대상"} right={
        <div className="flex gap-2 items-center">
          <input type="text" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} placeholder="검색..." className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 w-28 sm:w-36 outline-none focus:ring-2 focus:ring-[#1D4ED8]/40 focus:border-[#1D4ED8] transition-colors" />
          <ExportBtn rows={stores} filename="매장별_사고랭킹.csv" />
        </div>
      }>
        <div className="overflow-x-auto -mx-5 px-5 pb-2">
          <table className="w-full min-w-[560px] text-sm">
            <thead><tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">매장명</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">팀</th>
              <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">건수</th>
              <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">주 재해유형</th>
            </tr></thead>
            <tbody>{stores.map((s, i) => {
              const { border, bg } = rowAccent(i);
              const barWidth = maxStore > 0 ? Math.round((s.total || 0) / maxStore * 100) : 0;
              return (
                <tr key={s.store + i} className={`border-b border-stone-100 hover:bg-stone-50/60 ${bg}`}>
                  <td className={`py-2 px-3 whitespace-nowrap ${border}`}>
                    <span className={`text-xs font-bold tabular-nums px-1.5 py-0.5 rounded ${rankBadge(i)}`}>{i + 1}</span>
                  </td>
                  <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap">{s.store}</td>
                  <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${s.bum === "수도권" ? "bg-blue-50 text-[#003B8F] border border-stone-200" : "bg-stone-100 text-stone-700 border border-stone-200"}`}>{s.bum}</span></td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.dept}</td>
                  <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.team}</td>
                  <td className="py-2 px-3 text-right whitespace-nowrap">
                    <div className="flex items-center justify-end gap-1.5">
                      <span className="tabular-nums font-bold">{s.total}</span>
                      <div className="w-12 h-1 bg-stone-100 rounded-full overflow-hidden flex-shrink-0">
                        <div className="h-full bg-[#1D4ED8] rounded-full" style={{ width: `${barWidth}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{s.top_type}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}


// ========== TAB 3: Time Series (월별·분기·반기 통합) ==========
export default DeptTeamStore;

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

const yoy = (cur, prev) => prev ? ((cur - prev) / prev * 100) : null;

function DeptTeamStore({ D, yearFilter }) {
  const [bum, setBum] = useState("수도권");
  const [selDept, setSelDept] = useState(null);
  const [storeSearch, setStoreSearch] = useState("");
  
  const isYearFilter = yearFilter !== "all";
  const yearKey = isYearFilter ? `y${yearFilter.slice(2)}` : "total";
  
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
  const depts = deptsAll.filter(d => d.bum === bum).sort((a, b) => b.total - a.total);
  const teams = teamsAll.filter(t => t.bum === bum && (!selDept || t.dept === selDept)).sort((a, b) => b.total - a.total);
  
  // 매장별 사고는 연도 breakdown 없음 → 비례 추정 (0건 매장은 제외)
  const storeRatio = isYearFilter ? (D.kpis[`y${yearFilter}`] || 0) / (D.kpis.total || 1) : 1;
  const stores = D.stores
    .map(s => isYearFilter ? { ...s, total: Math.round((s.total || 0) * storeRatio) } : s)
    .filter(s => isYearFilter ? s.total > 0 : true)
    .filter(s => !storeSearch || s.store.includes(storeSearch) || s.dept.includes(storeSearch) || s.team.includes(storeSearch));
  
  return (
    <div className="space-y-3 sm:space-y-4">
      {/* U3: 부문 선택 — 탭 상단 고정 */}
      <div className="sticky top-0 z-10 bg-white/90 backdrop-blur-sm rounded-xl px-4 py-2.5 flex items-center gap-2 flex-wrap border border-stone-100 shadow-sm -mx-0.5">
        <span className="text-xs font-bold text-stone-500 uppercase tracking-wide">부문</span>
        {["수도권", "지방"].map(b => (
          <button key={b} onClick={() => { setBum(b); setSelDept(null); }} className={`min-h-[36px] px-4 py-1.5 rounded-full text-sm font-semibold border transition cursor-pointer ${bum === b ? (b === "수도권" ? "bg-blue-600 text-white border-blue-600" : "bg-orange-500 text-white border-orange-500") : "bg-white border-stone-200 text-stone-600 hover:bg-stone-50"}`}>{b}영업부문</button>
        ))}
        {selDept && <button onClick={() => setSelDept(null)} className="min-h-[36px] ml-2 px-3 py-1.5 rounded-full text-xs font-semibold bg-red-50 border border-red-200 text-red-600 hover:bg-red-100 cursor-pointer"><X size={11} className="inline -mt-0.5 mr-0.5" />{selDept} 선택 해제</button>}
      </div>

      <Card title="영업부 전체 사고 랭킹" titleIcon={Building2} sub={`${isYearFilter ? `${yearFilter}년` : "전체 기간"} 10개 영업부 — ${bum} 부문 강조 · 막대 클릭 시 부문 전환`} right={<ExportBtn rows={allD.map(d => ({부문: d.bum, 부서: d.dept, 총: d.total, Y24: d.y24, Y25: d.y25, Y26: d.y26, 매장수: d.stores, 매장당: d.per_store}))} filename="부서별_사고현황.csv" />}>
        <ResponsiveContainer width="100%" height={360} debounce={50}>
          <BarChart data={allD} layout="vertical" margin={{ left: 30 }} onClick={(e) => { if (e?.activePayload) { const p = e.activePayload[0].payload; setBum(p.bum); setSelDept(p.dept); } }}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
            <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
            <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={140} />
            <Tooltip content={<TT />} />
            <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
            {isYearFilter ? (
              <Bar dataKey="total" name={`${yearFilter}년`} radius={[0, 6, 6, 0]}>
                {allD.map((d, i) => {
                  const baseColor = yearFilter === "2024" ? "#D6D3D1" : yearFilter === "2025" ? BL : OR;
                  return <Cell key={i} fill={baseColor} opacity={d.bum === bum ? 1 : 0.35} />;
                })}
                <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NV, fontWeight: 700 }} />
              </Bar>
            ) : (
              <>
                <Bar dataKey="y24" stackId="a" fill="#D6D3D1" name="2024">
                  {allD.map((d, i) => <Cell key={i} fill="#D6D3D1" opacity={d.bum === bum ? 1 : 0.35} />)}
                </Bar>
                <Bar dataKey="y25" stackId="a" fill={BL} name="2025">
                  {allD.map((d, i) => <Cell key={i} fill={BL} opacity={d.bum === bum ? 1 : 0.35} />)}
                </Bar>
                <Bar dataKey="y26" stackId="a" fill={OR} name="2026" radius={[0, 6, 6, 0]}>
                  {allD.map((d, i) => <Cell key={i} fill={OR} opacity={d.bum === bum ? 1 : 0.35} />)}
                  <LabelList dataKey="total" position="right" style={{ fontSize: 12, fill: NV, fontWeight: 700 }} />
                </Bar>
              </>
            )}
          </BarChart>
        </ResponsiveContainer>
      </Card>
      
      {/* Normalized metric */}
      <Card title="매장당 사고율 정규화" titleIcon={Target} sub="절대건수는 규모 반영 — 매장당 건수로 진짜 위험도 판단">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={[...deptsAll].sort((a,b) => b.per_store - a.per_store)} layout="vertical" margin={{ left: 10 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="dept" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={120} />
              <Tooltip content={<TT />} />
              <Bar dataKey="per_store" fill={PR} radius={[0, 6, 6, 0]} name="매장당 사고">
                <LabelList dataKey="per_store" position="right" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="text-sm text-stone-700 space-y-2">
            <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep">
              <div className="text-xs font-bold text-purple-700 mb-1">해석 방법</div>
              <div>절대 건수로는 인천영업부(81건)가 1위지만, 매장당 사고율로 보면 순위가 달라집니다. 매장 당 건수가 많을수록 단위 매장의 <b>상대적 위험도</b>가 높음을 의미합니다.</div>
            </div>
            <div className="p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs">
              현재는 사고 발생 매장 기준. 실제 부서별 총 매장 수가 확보되면 더 정확한 Incident Rate 산출 가능.
            </div>
          </div>
        </div>
      </Card>
      
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title={`${bum} - 부서별 연도`} sub="막대 클릭하면 팀 필터링">
          <ResponsiveContainer width="100%" height={260} debounce={50}>
            <BarChart data={depts} margin={{ left: 10, top: 10 }} onClick={(e) => { if (e?.activePayload) setSelDept(e.activePayload[0].payload.dept); }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false} />
              <XAxis dataKey="dept" tick={{ fontSize: 9, fill: "#57534E" }} axisLine={false} tickLine={false} angle={-15} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
              <Tooltip content={<TT />} />
              <Legend wrapperStyle={{ fontSize: 11 }} iconType="circle" />
              {isYearFilter ? (
                <Bar dataKey="total" fill={bum === "수도권" ? BL : OR} radius={[4, 4, 0, 0]} name={`${yearFilter}년`} />
              ) : (
                <>
                  <Bar dataKey="y24" fill="#D6D3D1" radius={[4, 4, 0, 0]} name="2024" />
                  <Bar dataKey="y25" fill={bum === "수도권" ? BL : OR} radius={[4, 4, 0, 0]} name="2025" />
                  <Bar dataKey="y26" fill={bum === "수도권" ? "#93C5FD" : "#FED7AA"} radius={[4, 4, 0, 0]} name="2026" />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title={`${bum} - 부서별 YoY`} sub="2024→2025 증감률 · 매장IR 탭에서 팀별 상세 확인">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {[...depts].sort((a,b) => {
              const ya = a.y24 > 0 ? (a.y25 - a.y24) / a.y24 * 100 : null;
              const yb = b.y24 > 0 ? (b.y25 - b.y24) / b.y24 * 100 : null;
              return (yb ?? -999) - (ya ?? -999);
            }).map(d => {
              const yoyVal = d.y24 > 0 ? yoy(d.y25, d.y24) : null;
              const isUp = yoyVal !== null && yoyVal > 0;
              const isDown = yoyVal !== null && yoyVal < 0;
              return (
                <div key={d.dept} className="flex items-center gap-2 px-2 py-2 rounded-lg bg-stone-50 border border-stone-100">
                  <div className="text-xs font-semibold text-stone-700 truncate flex-1 min-w-0">{d.dept}</div>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <span className="text-[10px] text-stone-400 tabular-nums">{d.y24}→{d.y25}건</span>
                    {yoyVal !== null ? (
                      <span className="text-xs font-bold tabular-nums px-1.5 py-0.5 rounded"
                        style={{
                          color: isUp ? ALERT_RED : isDown ? SAFE_GREEN : "#78716C",
                          background: isUp ? "#FEE2E2" : isDown ? "#DCFCE7" : "#F5F5F4"
                        }}>
                        {isUp ? "▲" : isDown ? "▼" : "─"}{Math.abs(yoyVal).toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-stone-300 px-1.5">─</span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-2 text-[10px] text-stone-400">※ 2024 사고 0건인 부서는 YoY 산출 불가 · 팀별 상세 → 매장IR 탭</div>
        </Card>
      </div>
      
      <Card title={`${bum} - 부서별 월간 히트맵`} sub="색상이 진할수록 사고 다발">
        <HeatmapGrid rows={depts.map(d => ({ label: d.dept.replace("영업부", ""), total: d.total, hm: d.hm }))} yearFilter={yearFilter} />
      </Card>
      
      <Card title={`${selDept || bum} - 팀별 월간 히트맵`} sub="팀 단위 월간 사고 패턴">
        <HeatmapGrid rows={teams.map(t => ({ label: t.team, total: t.total, hm: t.hm }))} yearFilter={yearFilter} />
      </Card>
      
      {/* 매장 드릴다운 */}
      <Card title="매장별 워스트 Top 25" titleIcon={Store} sub={isYearFilter ? `${yearFilter}년 사고 발생 매장 (비례 추정)` : "사고 3건 이상 발생 매장 — 집중관리 대상"} right={
        <div className="flex gap-2">
          <input type="text" value={storeSearch} onChange={e => setStoreSearch(e.target.value)} placeholder="매장명/팀명 검색..." className="text-xs px-2.5 py-1 rounded-lg border border-stone-200 w-36" />
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
            <tbody>{stores.map((s, i) => (
              <tr key={s.store + i} className="border-b border-stone-100 hover:bg-stone-50/60">
                <td className="py-2 px-3 text-xs font-bold text-stone-400 whitespace-nowrap">{i + 1}</td>
                <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap">{s.store}</td>
                <td className="py-2 px-3 whitespace-nowrap"><span className={`text-xs px-2 py-0.5 rounded-full ${s.bum === "수도권" ? "bg-indigo-50 text-indigo-700 border border-stone-200" : "bg-stone-100 text-stone-700"}`}>{s.bum}</span></td>
                <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.dept}</td>
                <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{s.team}</td>
                <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{s.total}</td>
                <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{s.top_type}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </Card>

    </div>
  );
}


// ========== TAB 3: Time Series (월별·분기·반기 통합) ==========
export default DeptTeamStore;

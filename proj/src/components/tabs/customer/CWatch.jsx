import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Calendar, CheckCircle2, FileText, Info, Lightbulb, Lock, Scale, Search, ShieldCheck, Siren, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_ROSE, CUST_GRAY, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function CWatch({ D }) {
  const [search, setSearch] = useState("");
  const yrLabel = D._yr ? `${D._yr}년` : "전체";

  // year-keyed field helpers for YoY delta column
  const yk = D._yr === "2024" ? "y24" : D._yr === "2025" ? "y25" : D._yr === "2026" ? "y26" : null;
  const prevYk = D._yr === "2025" ? "y24" : D._yr === "2026" ? "y25" : null;

  // D.store_watchlist is pre-sorted by _show desc and pre-filtered (_show > 0) by cFilter upstream.
  // Only apply the search filter locally.
  const filtered = D.store_watchlist
    .filter(s => !search || s.store.includes(search) || s.dept.includes(search) || s.team.includes(search));
  const list = filtered.slice(0, 30);

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card title="매장별 고객사고 워치리스트" titleIcon={Siren} sub={`${yrLabel} 다발 매장 — 개별 관리 대상`}
        right={<ExportBtn rows={list.map(s=>({매장:s.store,부문:s.bumun,영업부:s.dept,팀:s.team,건수:s._show,보상:s._comp,주요유형:s.tp}))} filename={`고객사고_워치_${yrLabel}.csv`}/>}>
        <div className="flex items-center gap-2 mb-3">
          <div className="relative flex items-center">
            <Search size={14} className="absolute left-2.5 text-stone-400 pointer-events-none"/>
            <input type="text" placeholder="매장명 · 영업부 · 팀 검색"
              value={search} onChange={e => setSearch(e.target.value)}
              className="text-xs border border-stone-200 rounded-md pl-7 pr-6 py-1.5 bg-white w-48 outline-none focus:ring-2 focus:ring-sky-300 focus:border-sky-300 transition"/>
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-2 text-stone-400 hover:text-stone-600 transition min-h-[44px] flex items-center"
                aria-label="검색어 지우기"
              >
                <X size={12}/>
              </button>
            )}
          </div>
          <span className="text-xs text-stone-400">{filtered.length}개 매장</span>
        </div>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="py-2 px-2 text-left text-stone-400 font-medium">#</th>
                <th className="py-2 px-2 text-left text-stone-400 font-medium">매장명</th>
                <th className="py-2 px-2 text-left text-stone-400 font-medium">부문</th>
                <th className="py-2 px-2 text-left text-stone-400 font-medium">영업부</th>
                <th className="py-2 px-2 text-left text-stone-400 font-medium">팀</th>
                <th className="py-2 px-2 text-right text-stone-400 font-medium">건수</th>
                {prevYk && <th className="py-2 px-2 text-right text-stone-400 font-medium">전년比</th>}
                <th className="py-2 px-2 text-right text-stone-400 font-medium">보상</th>
                <th className="py-2 px-2 text-left text-stone-400 font-medium">주요유형</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i) => {
                const delta = prevYk != null ? (s[yk] || 0) - (s[prevYk] || 0) : null;
                return (
                  <tr key={s.store} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-2 px-2 text-stone-400">{i+1}</td>
                    <td className="py-2 px-2 font-semibold text-stone-800">{s.store}</td>
                    <td className="py-2 px-2 text-stone-500">{s.bumun}</td>
                    <td className="py-2 px-2 text-stone-500">{s.dept.replace("영업부","")}</td>
                    <td className="py-2 px-2 text-stone-500">{s.team}</td>
                    <td className="py-2 px-2 text-right font-bold" style={{color: s._show>=8 ? CUST_ROSE : s._show>=5 ? CUST_AMBER : INK}}>{s._show}건</td>
                    {prevYk && (
                      <td className="py-2 px-2 text-right tabular-nums font-medium"
                        style={{color: delta > 0 ? CUST_ROSE : delta < 0 ? SAFE_GREEN : INK}}>
                        {delta > 0 ? `+${delta}` : delta < 0 ? `${delta}` : "±0"}
                      </td>
                    )}
                    <td className="py-2 px-2 text-right tabular-nums text-stone-600">{s._comp > 0 ? (s._comp/10000).toFixed(0)+"만" : "-"}</td>
                    <td className="py-2 px-2">
                      <span className="px-1.5 py-0.5 rounded text-xs" style={{background:`${TYPE_COLOR[s.tp]||CUST_GRAY}20`,color:TYPE_COLOR[s.tp]||CUST_GRAY}}>{s.tp}</span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && <tr><td colSpan={prevYk ? 9 : 8} className="py-8 text-center text-stone-400">{yrLabel} 데이터 없음</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

// ────────── 피해자 현황 탭 ──────────
export default CWatch;

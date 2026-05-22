import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area, LabelList } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Building2, Calendar, CheckCircle2, FileText, Info, Lightbulb, Lock, Map as MapIcon, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_BLUE, CUST_TEAL, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function CDept({ D }) {
  const [selBumun, setSelBumun] = useState("전체");
  const [selDept, setSelDept] = useState(null);
  const yrLabel = D._yr ? `${D._yr}년` : "전체";
  
  const filteredDepts = (selBumun === "전체" ? D.depts : D.depts.filter(d => d.bumun === selBumun)).slice().sort((a,b) => b._show - a._show);
  const filteredTeams = (selDept ? D.teams.filter(t => t.dept === selDept)
                       : selBumun === "전체" ? D.teams : D.teams.filter(t => t.bumun === selBumun))
                       .slice().sort((a,b) => b._show - a._show);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 부문(수도권/지방) */}
      <Card title="부문별 현황" titleIcon={Building2} sub={`${yrLabel} 수도권 vs 지방 비교`}
        right={<ExportBtn rows={D.bumun.map(b=>({부문:b.bumun,건수:b._show,보상합계:b._comp,보상건수:b.comp_count}))} filename={`고객사고_부문_${yrLabel}.csv`}/>}>
        <div className="grid grid-cols-2 gap-3">
          {D.bumun.map((b,i) => {
            const ratio = D.bumun.reduce((s,x)=>s+x._show,0) > 0 ? (b._show/D.bumun.reduce((s,x)=>s+x._show,0)*100).toFixed(1) : 0;
            return (
              <div key={b.bumun} className={`p-4 rounded-xl border-2 cursor-pointer transition-colors ${selBumun===b.bumun ? "border-sky-400 bg-sky-50" : "border-stone-200 bg-white hover:bg-stone-50"}`}
                   onClick={() => setSelBumun(selBumun===b.bumun ? "전체" : b.bumun)}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-semibold text-stone-700">{b.bumun}</span>
                  <span className="text-xs text-stone-400">{ratio}%</span>
                </div>
                <div className="flex items-baseline gap-1.5">
                  <span className="text-3xl font-bold tabular-nums" style={{color: i===0 ? CUST_BLUE : CUST_AMBER}}>{b._show.toLocaleString()}</span>
                  <span className="text-xs text-stone-400">건</span>
                </div>
                <div className="text-xs text-stone-500 mt-1.5">보상 {(b._comp/100000000).toFixed(1)}억원 · {b.comp_count}건</div>
                <div className="mt-2 bg-stone-100 rounded-full h-1.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${ratio}%`,background:i===0 ? CUST_BLUE : CUST_AMBER}}/>
                </div>
              </div>
            );
          })}
        </div>
        {selBumun !== "전체" && (
          <div className="mt-3 text-xs text-stone-500 flex items-center gap-2">
            <span className="px-2 py-0.5 rounded bg-sky-100 text-sky-700 font-medium">{selBumun}</span>
            <span>선택 — 아래 영업부·팀 차트가 {selBumun} 데이터로 필터됨</span>
            <button onClick={() => setSelBumun("전체")} className="ml-auto text-stone-400 hover:text-stone-700">전체 보기</button>
          </div>
        )}
      </Card>

      {/* 영업부 */}
      <Card title={`영업부별 현황 ${selBumun!=="전체" ? `(${selBumun})` : ""}`} titleIcon={Building2} sub={`${yrLabel} 영업부 사고건수 + 보상금액`}
        right={<ExportBtn rows={filteredDepts.map(d=>({부문:d.bumun,영업부:d.dept,건수:d._show,보상:d._comp,보상건수:d._comp_count}))} filename={`고객사고_영업부_${yrLabel}.csv`}/>}>
        <ResponsiveContainer width="100%" height={Math.max(220, filteredDepts.length*30)} debounce={50}>
          <BarChart data={filteredDepts} layout="vertical" margin={{left:40}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="dept" tick={{fontSize:10,fill:"#44403C"}} axisLine={false} tickLine={false} width={140} interval={0} tickFormatter={d=>d.replace("영업부","")}/>
            <Tooltip content={<TT/>}/>
            <Bar dataKey="_show" radius={[0,4,4,0]} name="사고건수">
              {filteredDepts.map((d,i) => (
                <Cell key={d.dept} fill={d.bumun==="수도권" ? CUST_BLUE : CUST_AMBER} cursor="pointer" 
                      onClick={() => setSelDept(selDept===d.dept ? null : d.dept)}/>
              ))}
              <LabelList dataKey="_show" position="right" style={{fontSize:11,fill:INK,fontWeight:700}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="flex items-center gap-4 mt-2 text-xs text-stone-500">
          <span className="flex items-center gap-1.5"><div style={{width:10,height:10,borderRadius:2,background:CUST_BLUE}}/>수도권</span>
          <span className="flex items-center gap-1.5"><div style={{width:10,height:10,borderRadius:2,background:CUST_AMBER}}/>지방</span>
          <span className="ml-auto">막대 클릭 시 해당 영업부 팀별 차트로 필터</span>
        </div>
      </Card>

      {/* 팀 랭킹 */}
      <Card title={`팀별 사고 랭킹 ${selDept ? `(${selDept})` : selBumun!=="전체" ? `(${selBumun} 전체)` : "Top 15"}`} titleIcon={Users} sub={`${yrLabel} 기준`}
        right={<ExportBtn rows={filteredTeams.slice(0,30).map(t=>({팀:t.team,영업부:t.dept,부문:t.bumun,건수:t._show,보상:t._comp}))} filename={`고객사고_팀_${yrLabel}.csv`}/>}>
        <div className="flex gap-2 flex-wrap mb-3">
          <button onClick={() => setSelDept(null)}
            className={`text-xs px-2.5 py-1 rounded border transition-colors ${!selDept ? "bg-stone-800 text-white border-stone-800" : "border-stone-200 text-stone-600"}`}>전체</button>
          {filteredDepts.slice(0,8).map(d => (
            <button key={d.dept} onClick={() => setSelDept(selDept===d.dept ? null : d.dept)}
              className={`text-xs px-2.5 py-1 rounded border transition-colors ${selDept===d.dept ? "bg-sky-600 text-white border-sky-600" : "border-stone-200 text-stone-600 hover:bg-stone-50"}`}>
              {d.dept.replace("영업부","")}
            </button>
          ))}
        </div>
        <ResponsiveContainer width="100%" height={Math.max(280, Math.min(filteredTeams.length, 15)*22)} debounce={50}>
          <BarChart data={filteredTeams.slice(0,15)} layout="vertical" margin={{left:10}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="team" tick={{fontSize:11,fill:"#44403C"}} axisLine={false} tickLine={false} width={80} interval={0}/>
            <Tooltip content={<TT/>}/>
            <Bar dataKey="_show" fill={CUST_TEAL} radius={[0,5,5,0]} name="사고건수">
              <LabelList dataKey="_show" position="right" style={{fontSize:11,fill:INK,fontWeight:700}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </Card>
    </div>
  );
}

// ────────── 유형·장소 탭 (원인분석 통합) ──────────
export default CDept;

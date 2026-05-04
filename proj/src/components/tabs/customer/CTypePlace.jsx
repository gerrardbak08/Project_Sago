import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area, LabelList } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Building2, Calendar, CheckCircle2, FileText, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_PAL, CUST_GRAY, CUST_TEAL, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function CTypePlace({ D }) {
  const yrLabel = D._yr ? `${D._yr}년` : "전체";
  const visibleTypes = D.types.filter(t => t._show > 0);

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card title="사고유형별 상세" titleIcon={GitBranch} sub={`${yrLabel} 유형별 건수 + 보상금액`}
        right={<ExportBtn rows={visibleTypes.map(t=>({유형:t.type,건수:t._show,보상합계:t._comp}))} filename={`고객사고_유형_${yrLabel}.csv`}/>}>
        <div className="overflow-x-auto -mx-5 px-5">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-stone-200">
                <th className="py-2 px-2 text-left text-stone-400 font-medium">유형</th>
                <th className="py-2 px-2 text-right text-stone-400 font-medium">건수</th>
                <th className="py-2 px-2 text-right text-stone-400 font-medium">비율</th>
                <th className="py-2 px-2 text-right text-stone-400 font-medium">보상 합계</th>
                <th className="py-2 px-2 text-right text-stone-400 font-medium">건당 평균</th>
              </tr>
            </thead>
            <tbody>
              {visibleTypes.map(t => {
                const ratio = visibleTypes.reduce((s,x)=>s+x._show,0) > 0 ? (t._show/visibleTypes.reduce((s,x)=>s+x._show,0)*100).toFixed(1) : 0;
                const compAvg = D._yr ? (t[`comp_avg_${yearKey(D._yr)}`] || 0) : t.comp_avg;
                return (
                  <tr key={t.type} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="py-2 px-2">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{background:TYPE_COLOR[t.type]||CUST_GRAY}}/>
                        <span className="font-medium text-stone-800">{t.type}</span>
                      </div>
                    </td>
                    <td className="py-2 px-2 text-right font-bold text-stone-800">{t._show}</td>
                    <td className="py-2 px-2 text-right text-stone-500">{ratio}%</td>
                    <td className="py-2 px-2 text-right tabular-nums text-stone-700">{t._comp > 0 ? (t._comp/10000).toFixed(0)+"만원" : "-"}</td>
                    <td className="py-2 px-2 text-right tabular-nums text-stone-500">{compAvg > 0 ? (compAvg/10000).toFixed(0)+"만원" : "-"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="mt-4">
          <ResponsiveContainer width="100%" height={180} debounce={50}>
            <BarChart data={visibleTypes} layout="vertical" margin={{left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="type" tick={{fontSize:11,fill:"#44403C"}} axisLine={false} tickLine={false} width={50} interval={0}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" radius={[0,4,4,0]} name="건수">
                {visibleTypes.map(t => <Cell key={t.type} fill={TYPE_COLOR[t.type] || CUST_GRAY}/>)}
                <LabelList dataKey="_show" position="right" style={{fontSize:11,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="발생 장소" titleIcon={MapIcon} sub={`${yrLabel} 장소별 사고 분포`}
        right={<ExportBtn rows={D.places.map(p=>({장소:p.place,건수:p._show,보상:p._comp}))} filename={`고객사고_장소_${yrLabel}.csv`}/>}>
        <ResponsiveContainer width="100%" height={Math.max(220, D.places.length*30)} debounce={50}>
          <BarChart data={D.places.slice(0,10)} layout="vertical" margin={{left:30}}>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
            <XAxis type="number" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
            <YAxis type="category" dataKey="place" tick={{fontSize:11,fill:"#44403C"}} axisLine={false} tickLine={false} width={70} interval={0}/>
            <Tooltip content={<TT/>}/>
            <Bar dataKey="_show" fill={CUST_TEAL} radius={[0,4,4,0]} name="건수">
              <LabelList dataKey="_show" position="right" style={{fontSize:11,fill:INK,fontWeight:700}}/>
            </Bar>
          </BarChart>
        </ResponsiveContainer>
        <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600">
          <b>매장내부</b> 비중이 압도적. <span className="text-stone-500">※ 계단·주차장은 절대건수는 적어도 부상 중증도가 높을 가능성.</span>
        </div>
      </Card>

      {/* 원인 분석 통합 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="원인1 분포" titleIcon={AlertCircle} sub={`${yrLabel} 1차 원인`}
          right={<ExportBtn rows={D.causes1.map(c=>({원인:c.c,건수:c._show}))} filename={`고객사고_원인1_${yrLabel}.csv`}/>}>
          <ResponsiveContainer width="100%" height={Math.max(200, D.causes1.length*22)} debounce={50}>
            <BarChart data={D.causes1} layout="vertical" margin={{left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:10,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="c" tick={{fontSize:11,fill:"#44403C"}} axisLine={false} tickLine={false} width={60} interval={0}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" fill={CUST_AMBER} radius={[0,4,4,0]} name="건수">
                <LabelList dataKey="_show" position="right" style={{fontSize:10,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="원인2 세부" titleIcon={AlertCircle} sub={`${yrLabel} 2차 세부 원인`}
          right={<ExportBtn rows={D.causes2.map(c=>({원인2:c.c,건수:c._show}))} filename={`고객사고_원인2_${yrLabel}.csv`}/>}>
          <ResponsiveContainer width="100%" height={Math.max(200, D.causes2.length*22)} debounce={50}>
            <BarChart data={D.causes2} layout="vertical" margin={{left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:10,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="c" tick={{fontSize:9,fill:"#44403C"}} axisLine={false} tickLine={false} width={120} interval={0}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" radius={[0,4,4,0]} name="건수">
                {D.causes2.map((c,i) => <Cell key={c.c} fill={CUST_PAL[i%CUST_PAL.length]}/>)}
                <LabelList dataKey="_show" position="right" style={{fontSize:9,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>
    </div>
  );
}

// ────────── 보상·처리 탭 ──────────
export default CTypePlace;

import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Calendar, CheckCircle2, ClipboardList, FileText, Info, Lightbulb, Lock, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_PAL, CUST_ROSE, CUST_TEAL, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function CComp({ D }) {
  const yrLabel = D._yr ? `${D._yr}년` : "전체";
  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="처리과정 분포" titleIcon={ClipboardList} sub={`${yrLabel} 처리 유형`}>
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <BarChart data={D.process} layout="vertical" margin={{left:10}}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false}/>
              <XAxis type="number" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis type="category" dataKey="p" tick={{fontSize:10,fill:"#44403C"}} axisLine={false} tickLine={false} width={90} interval={0}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" radius={[0,4,4,0]} name="건수">
                {D.process.map((p,i) => <Cell key={p.p} fill={CUST_PAL[i%CUST_PAL.length]}/>)}
                <LabelList dataKey="_show" position="right" style={{fontSize:11,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card title="보상금액 구간 분포" titleIcon={Banknote} sub={`${yrLabel} 보상 발생 ${D.kpis.comp_count}건`}>
          <ResponsiveContainer width="100%" height={200} debounce={50}>
            <BarChart data={D.comp_bins}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false}/>
              <XAxis dataKey="range" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" fill={CUST_AMBER} radius={[5,5,0,0]} name="건수">
                <LabelList dataKey="_show" position="top" style={{fontSize:11,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <Card title="처리과정별 평균 소요일" titleIcon={Calendar} sub={`${yrLabel} 접수→종결 평균 처리기간`}>
        {D.days_by_proc.length === 0 ? (
          <div className="py-8 text-center text-stone-400 text-sm">{yrLabel} 데이터 부족</div>
        ) : (
          <div className="space-y-2 mt-1">
            {D.days_by_proc.map(d => {
              const maxAvg = D.days_by_proc[0]?._avg || 1;
              return (
                <div key={d.proc} className="flex items-center gap-3">
                  <div className="text-xs text-stone-600 w-28 truncate">{d.proc}</div>
                  <div className="flex-1 bg-stone-100 rounded-full h-2.5 overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{
                      width:`${(d._avg/maxAvg*100).toFixed(0)}%`,
                      background: d._avg > 20 ? CUST_ROSE : d._avg > 10 ? CUST_AMBER : CUST_TEAL
                    }}/>
                  </div>
                  <div className="text-xs tabular-nums font-semibold text-stone-700 w-16 text-right">평균 {d._avg}일</div>
                  <div className="text-xs text-stone-400 w-10 text-right">{d._n}건</div>
                </div>
              );
            })}
          </div>
        )}
        <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-500">
          ※ 처리기간은 접수일·종결일 기준. 연락두절 건은 최종 연락 시점 기준 추정.
        </div>
      </Card>
    </div>
  );
}

// ────────── 매장 워치 탭 ──────────
export default CComp;

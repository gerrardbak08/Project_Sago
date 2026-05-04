import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Calendar, CheckCircle2, FileText, Info, Lightbulb, Lock, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_BLUE, CUST_ROSE, CUST_TEAL, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function CVictim({ D }) {
  const yrLabel = D._yr ? `${D._yr}년` : "전체";
  const visibleAges = D.ages.filter(a => a._show > 0);
  const totalAge = visibleAges.reduce((s,a) => s + a._show, 0) || 1;
  const hourPeak = D.hours.reduce((a,b) => b._show > a._show ? b : a, {h:0,_show:0});
  const hourRange = [
    {l:"오전(9~12시)", t: D.hours.filter(h=>h.h>=9&&h.h<12).reduce((s,h)=>s+h._show,0)},
    {l:"점심(12~14시)", t: D.hours.filter(h=>h.h>=12&&h.h<14).reduce((s,h)=>s+h._show,0)},
    {l:"오후(14~18시)", t: D.hours.filter(h=>h.h>=14&&h.h<18).reduce((s,h)=>s+h._show,0)},
    {l:"저녁(18~21시)", t: D.hours.filter(h=>h.h>=18&&h.h<21).reduce((s,h)=>s+h._show,0)},
    {l:"야간(21시~)", t: D.hours.filter(h=>h.h>=21).reduce((s,h)=>s+h._show,0)},
  ];
  const maxRange = Math.max(...hourRange.map(r=>r.t),1);

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card title="연령대별 사고 현황" titleIcon={Users} sub={`${yrLabel} 연령 구간별 분포`}
        right={<ExportBtn rows={visibleAges.map(a=>({연령대:a.age,건수:a._show,보상:a._comp}))} filename={`고객사고_연령_${yrLabel}.csv`}/>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={D.ages}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false}/>
              <XAxis dataKey="age" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" fill={CUST_BLUE} radius={[4,4,0,0]} name="건수">
                <LabelList dataKey="_show" position="top" style={{fontSize:10,fill:INK,fontWeight:700}}/>
              </Bar>
            </BarChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {visibleAges.map(a => (
              <div key={a.age} className="flex items-center gap-2 text-xs">
                <div className="w-10 text-right text-stone-500">{a.age}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${(a._show/totalAge*100).toFixed(0)}%`,background:CUST_BLUE}}/>
                </div>
                <div className="w-10 text-right tabular-nums font-semibold text-stone-700">{a._show}</div>
                <div className="w-10 text-right text-stone-400">{(a._show/totalAge*100).toFixed(1)}%</div>
              </div>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="성별 분포" titleIcon={UserCircle} sub={`${yrLabel} 성별 비율`}>
          <div className="flex items-center justify-center gap-8 py-4">
            {[
              {label:"여성", n:D.kpis.female, color:CUST_ROSE},
              {label:"남성", n:D.kpis.male, color:CUST_BLUE},
            ].map(s => {
              const total = D.kpis.female + D.kpis.male;
              return (
                <div key={s.label} className="text-center">
                  <div className="w-20 h-20 rounded-full border-4 flex items-center justify-center mx-auto" style={{borderColor:s.color,background:`${s.color}15`}}>
                    <span className="text-xl font-bold" style={{color:s.color}}>{total > 0 ? (s.n/total*100).toFixed(0) : 0}%</span>
                  </div>
                  <div className="text-sm font-medium text-stone-700 mt-2">{s.label}</div>
                  <div className="text-xs text-stone-400">{s.n}명</div>
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="발생 시간대" titleIcon={Calendar} sub={`피크: ${hourPeak.h}시 (${hourPeak._show}건)`}>
          <div className="space-y-2 mt-1">
            {hourRange.map(r => (
              <div key={r.l} className="flex items-center gap-2">
                <div className="text-xs text-stone-600 w-28">{r.l}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-2.5 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${(r.t/maxRange*100).toFixed(0)}%`,background:CUST_TEAL}}/>
                </div>
                <div className="text-xs tabular-nums font-semibold text-stone-700 w-10 text-right">{r.t}건</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ────────── 메인 컴포넌트 ──────────
// ────────── 고객사고 관리자 패널 ──────────
export default CVictim;

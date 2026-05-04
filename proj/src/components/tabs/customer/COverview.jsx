import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Calendar, CheckCircle2, FileText, GitBranch, Info, Lightbulb, Lock, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { CUST_AMBER, CUST_ROSE, CUST_TEAL, CUST_BLUE, CUST_PAL, TYPE_COLOR } from '../../../constants/customerColors.js';
import { yearKey, compKey, cFilter } from '../../../utils/customerHelpers.js';
import CUSTOMER_DATA from '../../../data/customerData.js';

function COverview({ D }) {
  const k = D.kpis;
  const yrLabel = D._yr ? `${D._yr}년` : "전체";
  const monthly = D._yr ? D.monthly.filter(m => m.y === parseInt(D._yr)) : D.monthly;
  
  // 연도 비교는 항상 전체 데이터로
  const yearlyAll = CUSTOMER_DATA.yearly;
  
  const kpiCards = [
    { l:"총 사고건수", v:k.total.toLocaleString(), unit:"건",
      sub: D._yr ? `${yrLabel}` : `2024·${CUSTOMER_DATA.kpis_all.female ? CUSTOMER_DATA.yearly[0].t : 0} / 2025·${CUSTOMER_DATA.yearly[1].t} / 2026·${CUSTOMER_DATA.yearly[2].t}`, color: CUST_ROSE },
    { l:"총 보상금액", v:(k.total_comp/100000000).toFixed(1), unit:"억원", sub:`보상 ${k.comp_count}건`, color: CUST_AMBER },
    { l:"평균 보상금액", v:k.avg_comp > 0 ? (k.avg_comp/10000).toFixed(0) : "0", unit:"만원", sub:"보상 발생 건 기준", color: CUST_TEAL },
    { l:"평균 처리기간", v:k.avg_days, unit:"일", sub:"접수→종결 평균", color: CUST_BLUE },
    { l:"진행중", v:k.still_open, unit:"건", sub:"미종결 건", color:"#F97316" },
    { l:"여성 피해자", v:k.female+k.male > 0 ? Math.round(k.female/(k.female+k.male)*100) : 0, unit:"%", sub:`${k.female}명 / 전체 ${k.female+k.male}명`, color:"#E879F9" },
  ];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {kpiCards.map(c => (
          <div key={c.l} className="bg-white border border-stone-200 rounded-xl p-4">
            <div className="text-xs text-stone-400 mb-1">{c.l}</div>
            <div className="flex items-baseline gap-1">
              <span className="text-3xl font-bold tabular-nums" style={{color:c.color}}>{c.v}</span>
              <span className="text-sm text-stone-400">{c.unit}</span>
            </div>
            <div className="text-xs text-stone-500 mt-1">{c.sub}</div>
          </div>
        ))}
      </div>

      <Card title={`월별 사고 추이`} titleIcon={TrendingUp} sub={`${yrLabel} 월별 발생건수`}>
        <ResponsiveContainer width="100%" height={220} debounce={50}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="custGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={CUST_ROSE} stopOpacity={0.3}/>
                <stop offset="95%" stopColor={CUST_ROSE} stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false}/>
            <XAxis dataKey="ym" tick={{fontSize:10,fill:"#78716C"}} axisLine={false} tickLine={false} tickFormatter={v => v.slice(2).replace("-",".")} interval={1}/>
            <YAxis tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
            <Tooltip content={<TT/>}/>
            <Area dataKey="t" stroke={CUST_ROSE} strokeWidth={2} fill="url(#custGrad)" name="사고건수"/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="연도별 현황" titleIcon={Calendar} sub="2024~2026 사고건수 비교">
          <div className="grid grid-cols-3 gap-2">
            {yearlyAll.map((y,i) => {
              const isFiltered = D._yr === String(y.y);
              const prev = i > 0 ? yearlyAll[i-1].t : null;
              const isCurrentYear = y.y === 2026;
              let diff = null, diffLabel = null;
              if (prev && !isCurrentYear) {
                diff = ((y.t - prev)/prev*100).toFixed(1);
                diffLabel = `${diff > 0 ? "▲" : "▼"}${Math.abs(diff)}%`;
              } else if (isCurrentYear) {
                diffLabel = "진행중";
              }
              return (
                <div key={y.y} className={`text-center px-1 py-3 rounded-xl border-2 transition-colors ${isFiltered ? "border-sky-400 bg-sky-50" : "border-transparent bg-stone-50"}`}>
                  <div className="text-[10px] text-stone-400 mb-0.5">{y.y}년</div>
                  <div className="flex items-baseline justify-center gap-0.5">
                    <span className="text-xl sm:text-2xl font-bold tabular-nums leading-none" style={{color:CUST_PAL[i]}}>{y.t}</span>
                    <span className="text-[10px] text-stone-400">건</span>
                  </div>
                  {diffLabel && <div className={`text-[10px] mt-1 font-semibold whitespace-nowrap ${isCurrentYear ? "text-orange-500" : diff > 0 ? "text-red-500" : "text-green-600"}`}>{diffLabel}</div>}
                </div>
              );
            })}
          </div>
        </Card>

        <Card title="사고유형 분포" titleIcon={GitBranch} sub={`${yrLabel} 기준`}>
          <div className="flex items-center gap-4">
            <ResponsiveContainer width={180} height={180}>
              <PieChart>
                <Pie data={D.types.filter(t => t._show > 0)} dataKey="_show" nameKey="type" cx="50%" cy="50%" startAngle={90} endAngle={-270} innerRadius={45} outerRadius={75}>
                  {D.types.map((t,i) => <Cell key={t.type} fill={TYPE_COLOR[t.type] || CUST_PAL[i]}/>)}
                </Pie>
                <Tooltip formatter={(v,n) => [`${v}건`,n]}/>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex-1 space-y-1.5">
              {D.types.filter(t => t._show > 0).map((t,i) => (
                <div key={t.type} className="flex items-center gap-2 text-xs">
                  <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{background:TYPE_COLOR[t.type] || CUST_PAL[i]}}/>
                  <span className="text-stone-700 font-medium">{t.type}</span>
                  <span className="ml-auto tabular-nums text-stone-500">{t._show}건</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card title="발생 장소 Top 6" titleIcon={MapIcon} sub={`${yrLabel} 장소별 분포`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {D.places.slice(0,6).map((p,i) => (
              <div key={p.place} className="flex items-center gap-2">
                <div className="text-xs text-stone-400 w-4 text-right">{i+1}</div>
                <div className="text-xs font-medium text-stone-700 w-20 truncate">{p.place}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${(p._show/(D.places[0]?._show||1)*100).toFixed(0)}%`,background:CUST_BLUE}}/>
                </div>
                <div className="text-xs tabular-nums text-stone-600 w-10 text-right">{p._show}건</div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="주요 원인1 Top 6" titleIcon={AlertCircle} sub={`${yrLabel} 원인 분류`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2">
            {D.causes1.slice(0,6).map((c,i) => (
              <div key={c.c} className="flex items-center gap-2">
                <div className="text-xs text-stone-400 w-4 text-right">{i+1}</div>
                <div className="text-xs font-medium text-stone-700 w-20 truncate">{c.c}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-2 overflow-hidden">
                  <div className="h-full rounded-full" style={{width:`${(c._show/(D.causes1[0]?._show||1)*100).toFixed(0)}%`,background:CUST_AMBER}}/>
                </div>
                <div className="text-xs tabular-nums text-stone-600 w-10 text-right">{c._show}건</div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

// ────────── 부서·팀 탭 (부문별 + 영업부 + 팀) ──────────
export default COverview;

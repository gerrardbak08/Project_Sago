import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, ComposedChart, AreaChart, Area, LabelList } from 'recharts';
import { AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Building, Calendar, CheckCircle2, FileText, Info, Lightbulb, Lock, Scale, Search, ShieldCheck, Store, Tag, TrendingUp, Unlock, UserCircle, Users, X, Download, ChevronRight } from 'lucide-react';
import { CUSTOMER_BLUE, DEEP_BLUE, DAISO_RED, ALERT_RED, SAFE_GREEN, BL, OR, GR, AM, INK } from '../../../constants/colors.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card } from '../../../components/shared/Card.jsx';
import { gradientCells } from '../../../components/shared/ChartHelpers.jsx';
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

  // 성별 도넛 SVG 계산
  const genderRef = useRef(null);
  const genderInView = useInView(genderRef);
  const gTotal = (D.kpis.female + D.kpis.male) || 1;
  const femalePct = D.kpis.female / gTotal;
  const malePct   = D.kpis.male   / gTotal;
  const R_G   = 54;
  const CIRC_G = 2 * Math.PI * R_G; // ≈339.29

  // ── 성별 분포 카운트업 ─────────────────────────────────────
  const cu_gTotal    = useCountUp(D.kpis.female + D.kpis.male, 900, genderInView);
  const cu_femalePct = useCountUp(D.kpis.female + D.kpis.male > 0 ? Math.round(D.kpis.female / gTotal * 100) : 0, 900, genderInView);
  const cu_malePct   = useCountUp(D.kpis.female + D.kpis.male > 0 ? Math.round(D.kpis.male   / gTotal * 100) : 0, 900, genderInView);
  const cuGenderPct  = [cu_femalePct, cu_malePct];

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card title="연령대별 사고 현황" titleIcon={Users} sub={`${yrLabel} 연령 구간별 분포`}
        right={<ExportBtn rows={visibleAges.map(a=>({연령대:a.age,건수:a._show,보상:a._comp}))} filename={`고객사고_연령_${yrLabel}.csv`}/>}>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <ResponsiveContainer width="100%" height={220} debounce={50}>
            <BarChart data={visibleAges}>
              <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" vertical={false}/>
              <XAxis dataKey="age" tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <YAxis tick={{fontSize:11,fill:"#78716C"}} axisLine={false} tickLine={false}/>
              <Tooltip content={<TT/>}/>
              <Bar dataKey="_show" fill={CUST_BLUE} radius={[4,4,0,0]} name="건수">
                {gradientCells(visibleAges, CUST_BLUE)}
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
          <div ref={genderRef} className="flex items-center justify-center gap-6 py-3">
            {/* SVG 단일 도넛 — 여성(rose) + 남성(blue) */}
            <svg width="140" height="140" viewBox="0 0 140 140" aria-label="성별 분포 도넛 차트">
              {/* 배경 트랙 */}
              <circle cx="70" cy="70" r={R_G} fill="none" stroke="#E7E5E4" strokeWidth="14" strokeLinecap="butt"/>
              {/* 여성 호 — 12시 방향 기준 시계방향 */}
              <circle cx="70" cy="70" r={R_G} fill="none"
                stroke={CUST_ROSE} strokeWidth="14" strokeLinecap="butt"
                strokeDasharray={CIRC_G}
                strokeDashoffset={genderInView ? CIRC_G * (1 - femalePct) : CIRC_G}
                transform="rotate(-90 70 70)"
                style={{transition:'stroke-dashoffset .8s ease'}}
              />
              {/* 남성 호 — 여성 호 끝 지점 기준 시계방향 */}
              <circle cx="70" cy="70" r={R_G} fill="none"
                stroke={CUST_BLUE} strokeWidth="14" strokeLinecap="butt"
                strokeDasharray={CIRC_G}
                strokeDashoffset={genderInView ? CIRC_G * (1 - malePct) : CIRC_G}
                transform={`rotate(${-90 + femalePct * 360} 70 70)`}
                style={{transition:'stroke-dashoffset .8s ease .1s'}}
              />
              {/* 중앙 텍스트 */}
              <text x="70" y="63" textAnchor="middle" fontSize="11" fill="#78716C">총</text>
              <text x="70" y="81" textAnchor="middle" fontSize="22" fontWeight="700" fill="#1C1917">
                {cu_gTotal}
              </text>
              <text x="70" y="95" textAnchor="middle" fontSize="11" fill="#78716C">명</text>
            </svg>
            {/* 범례 */}
            <div className="space-y-4">
              {[
                {label:'여성', n:D.kpis.female, color:CUST_ROSE},
                {label:'남성', n:D.kpis.male,   color:CUST_BLUE},
              ].map((s, idx) => (
                <div key={s.label} className="flex items-center gap-2 min-h-[44px]">
                  <div className="w-3 h-3 rounded-full flex-shrink-0" style={{background:s.color}}/>
                  <span className="text-sm text-stone-600 w-8 break-keep">{s.label}</span>
                  <span className="text-base font-bold tabular-nums" style={{color:s.color}}>
                    {cuGenderPct[idx]}%
                  </span>
                  <span className="text-xs text-stone-400">({s.n}명)</span>
                </div>
              ))}
            </div>
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

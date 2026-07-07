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
import { useCountUp, useInView } from '../../../utils/motion.js';

function ParjangDashboard({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;

  // ── 훅은 조건부 return 전에 선언 (Rules of Hooks) ──
  const kpiRef   = useRef(null);
  const kpiInView = useInView(kpiRef);
  const chartRef  = useRef(null);
  const chartInView = useInView(chartRef);

  const p       = D.parjang;
  const topList = p?.top || [];

  const avgRateRaw = topList.length
    ? topList.reduce((s, x) => s + x.incidents / Math.max(x.stores, 1), 0) / topList.length
    : 0;

  const totalCount  = useCountUp(p?.total || 0, 900, kpiInView);
  const activeCount = useCountUp(p?.active || 0, 900, kpiInView);
  const maxCount    = useCountUp(topList[0]?.incidents || 0, 900, kpiInView);
  const avgCount    = useCountUp(Math.round(avgRateRaw * 100), 900, kpiInView);

  if (!p) return null;

  // 부문별 고위험 파트장 집계
  const bumDist = topList.reduce((acc, pj) => {
    acc[pj.bum] = (acc[pj.bum] || 0) + 1;
    return acc;
  }, {});
  const bumPieData = Object.entries(bumDist).map(([name, value]) => ({ name, value }));

  // 재해유형 분포
  const typeDist = topList.reduce((acc, pj) => {
    if (pj.top_type) acc[pj.top_type] = (acc[pj.top_type] || 0) + 1;
    return acc;
  }, {});
  const typeData = Object.entries(typeDist).sort((a, b) => b[1] - a[1]).map(([name, value]) => ({ name, value }));

  // 랭킹 상위 3위 강조색
  const rankBorderColors = ['border-red-400',  'border-blue-400',  'border-amber-400'];
  const rankBgColors     = ['bg-red-50/50',    'bg-blue-50/30',    'bg-amber-50/30'];

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex items-center gap-2 text-xs text-stone-500 -mb-1">
        <Calendar size={11} />
        <span>분석 기간: <b className="text-stone-700">{yrLabel}</b></span>
        {yearFilter && yearFilter !== "all" && (
          <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[10px] font-bold">필터 적용 중</span>
        )}
      </div>
      <EstimateBadge D={D} />

      {/* KPI 카드 그리드 — dash-fade-in stagger + useCountUp */}
      <div ref={kpiRef} className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            label: '전체 파트장',
            value: (
              <>
                <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{totalCount}</span>
                <span className="text-base font-medium text-stone-400 ml-1.5">명</span>
              </>
            ),
            border: 'border-blue-100',
            delay: 0,
          },
          {
            label: '3건+ 고위험 파트장',
            value: (
              <>
                <span className="text-2xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{activeCount}</span>
                <span className="text-base font-medium text-stone-400 ml-1.5">명</span>
              </>
            ),
            sub: `${pct(p.active, p.total)}% · 중점관리`,
            border: 'border-[#FCE0E3]',
            delay: 80,
          },
          {
            label: '사고 최다',
            value: (
              <>
                <span className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">{maxCount}</span>
                <span className="text-sm text-stone-500 font-normal ml-1">건</span>
              </>
            ),
            sub: topList[0]?.parjang,
            border: 'border-stone-200',
            delay: 160,
          },
          {
            label: '매장당 사고율 (평균)',
            value: (
              <span className="text-3xl sm:text-4xl font-bold text-stone-900 tracking-tight tabular-nums">
                {(avgCount / 100).toFixed(2)}
              </span>
            ),
            sub: '파트장/매장당',
            border: 'border-stone-200',
            delay: 240,
          },
        ].map((card) => (
          <div
            key={card.label}
            className={`rounded-lg p-5 bg-white border ${card.border} relative overflow-hidden dash-fade-in`}
            style={{ animationDelay: `${card.delay}ms` }}
          >
            <div className="text-xs text-stone-500 font-medium uppercase tracking-wide">{card.label}</div>
            <div className="flex items-baseline gap-1 mt-1">{card.value}</div>
            {card.sub && <div className="text-xs text-stone-500 opacity-80 mt-1">{card.sub}</div>}
          </div>
        ))}
      </div>

      {/* 데이터 없음 보호 */}
      {!topList.length ? (
        <EmptyState message="고위험 파트장 데이터 없음" icon={ShieldCheck} />
      ) : (
        <>
          {/* 차트 2개: 사고건수 TOP 바차트 + 재해유형 분포 */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card title="파트장별 사고 건수 TOP" titleIcon={ShieldCheck} sub="고위험 파트장 시각화 — 막대 높이 = 관할 매장 사고 집중도" className="lg:col-span-2">
              <div ref={chartRef}>
                <ResponsiveContainer width="100%" height={Math.max(220, Math.min(topList.length, 12) * 36)} debounce={50}>
                  <BarChart key={chartInView ? 1 : 0} data={[...topList].slice(0, 12)} layout="vertical" margin={{ left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
                    <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="parjang" interval={0} tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={88} />
                    <Tooltip content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0].payload;
                      return (
                        <div className="bg-white border border-stone-200 rounded-lg shadow px-3 py-2 text-xs">
                          <div className="font-bold">{d.parjang}</div>
                          <div className="text-stone-500">{d.dept} · {d.bum}</div>
                          <div>사고 <b>{d.incidents}건</b> · 관할 <b>{d.stores}매장</b></div>
                          <div>매장당 <b style={{ color: RD }}>{(d.incidents / Math.max(d.stores, 1)).toFixed(2)}건</b> · 주유형 {d.top_type}</div>
                        </div>
                      );
                    }} />
                    <Bar dataKey="incidents" radius={[0, 5, 5, 0]} name="사고 건수" isAnimationActive={chartInView} animationDuration={700} animationBegin={0}>
                      {[...topList].slice(0, 12).map((pj, i) => {
                        const r = pj.incidents / Math.max(pj.stores, 1);
                        return <Cell key={i} fill={r >= 2 ? RD : r >= 1.5 ? OR : r >= 1 ? AM : GN} />;
                      })}
                      <LabelList dataKey="incidents" position="right" style={{ fontSize: 11, fill: NV, fontWeight: 700 }} formatter={v => `${v}건`} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="mt-2 flex gap-3 flex-wrap text-[10px]">
                {[{ c: RD, l: "2건+ (즉시 대응)" }, { c: OR, l: "1.5~2건" }, { c: AM, l: "1~1.5건" }, { c: GN, l: "1건 미만" }].map(({ c, l }) => (
                  <span key={l} className="flex items-center gap-1">
                    <span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: c }} />
                    <span className="text-stone-500">{l}</span>
                  </span>
                ))}
                <span className="text-stone-400 ml-1">※ 색상 = 매장당 사고율</span>
              </div>
            </Card>

            <Card title="부문 · 유형 분포" titleIcon={Target} sub="고위험 파트장 부문별 집중도 + 주 재해유형">
              {/* 부문별 (수도권 vs 지방) */}
              <div className="mb-4">
                <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-2">부문별 고위험 파트장</div>
                <div className="flex gap-2">
                  {bumPieData.map((b, i) => (
                    <div key={b.name} className="flex-1 rounded-lg p-3 text-center border border-stone-100 bg-stone-50">
                      <div className="text-xl font-extrabold tabular-nums" style={{ color: b.name === "수도권" ? BL : OR }}>{b.value}명</div>
                      <div className="text-xs text-stone-500 mt-0.5">{b.name}</div>
                      <div className="text-[10px] text-stone-400">{pct(b.value, topList.length)}%</div>
                    </div>
                  ))}
                </div>
              </div>
              {/* 재해유형 분포 — % 너비 미니바 + transition */}
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-2">주 재해유형</div>
              <div className="space-y-1">
                {typeData.map((t, i) => (
                  <div key={t.name} className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: PAL[i % PAL.length] }} />
                    <span className="text-xs text-stone-700 flex-1">{t.name}</span>
                    <div className="flex items-center gap-1.5">
                      <div className="w-20 bg-stone-100 rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-1.5 rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.round(t.value / typeData[0].value * 100)}%`,
                            background: PAL[i % PAL.length],
                          }}
                        />
                      </div>
                      <span className="text-xs font-bold tabular-nums text-stone-800 w-6 text-right">{t.value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </div>

          {/* 랭킹 테이블 */}
          <Card title="사고 다발 파트장 랭킹 (3건 이상)" titleIcon={ShieldCheck} sub="관할 매장 수 대비 사고빈도 — 개별 관리 역량 평가 지표" right={<ExportBtn rows={topList} filename="파트장별_사고.csv" />}>
            <div className="relative">
              <div className="overflow-x-auto -mx-5 px-5 pb-2">
                <table className="w-full min-w-[560px] text-sm">
                  <thead>
                    <tr className="border-b-2 border-stone-200 text-xs text-stone-500 uppercase">
                      <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">#</th>
                      <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">파트장</th>
                      <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부서</th>
                      <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">부문</th>
                      <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">사고</th>
                      <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">관할 매장</th>
                      <th className="text-right py-2 px-3 font-semibold whitespace-nowrap">매장당</th>
                      <th className="text-left py-2 px-3 font-semibold whitespace-nowrap">주 재해유형</th>
                    </tr>
                  </thead>
                  <tbody>
                    {topList.map((pj, i) => {
                      const perStore = pj.incidents / Math.max(pj.stores, 1);
                      const hotColor = perStore >= 2 ? "bg-red-500" : perStore >= 1.5 ? "bg-orange-500" : perStore >= 1 ? "bg-amber-500" : "bg-green-500";
                      const rankCls  = i < 3 ? `border-l-[3px] ${rankBorderColors[i]} ${rankBgColors[i]}` : '';
                      return (
                        <tr key={pj.parjang + i} className={`border-b border-stone-100 hover:bg-stone-50/60 transition-colors ${rankCls}`}>
                          <td className="py-2 px-3 text-xs font-extrabold text-stone-400 whitespace-nowrap">{i + 1}</td>
                          <td className="py-2 px-3 font-semibold text-stone-900 whitespace-nowrap">
                            <span className={`inline-block w-2 h-2 rounded-full mr-2 ${hotColor}`} />
                            {pj.parjang}
                          </td>
                          <td className="py-2 px-3 text-xs text-stone-600 whitespace-nowrap">{pj.dept}</td>
                          <td className="py-2 px-3 whitespace-nowrap">
                            <span className={`text-xs px-2 py-0.5 rounded-full ${pj.bum === "수도권" ? "bg-blue-50 text-[#003B8F] border border-stone-200" : "bg-stone-100 text-stone-700"}`}>
                              {pj.bum}
                            </span>
                          </td>
                          <td className="py-2 px-3 text-right tabular-nums font-bold whitespace-nowrap">{pj.incidents}</td>
                          <td className="py-2 px-3 text-right tabular-nums text-stone-600 whitespace-nowrap">{pj.stores}</td>
                          <td className="py-2 px-3 text-right tabular-nums font-semibold whitespace-nowrap" style={{ color: perStore >= 2 ? RD : perStore >= 1.5 ? OR : NV }}>
                            {perStore.toFixed(2)}
                          </td>
                          <td className="py-2 px-3 text-xs text-stone-700 whitespace-nowrap">{pj.top_type}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {/* 우측 fade — 가로스크롤 힌트 */}
              <div className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-white to-transparent" />
            </div>
          </Card>

          {/* 관리 활용 방안 — 의미색 배경 + Lucide 아이콘 */}
          <Card title="파트장 관리 활용 방안" titleIcon={Lightbulb}>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="rounded-lg border border-red-200 bg-red-50/50 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-red-700 mb-1">
                  <AlertTriangle size={12} />
                  <span>매장당 2건+ 파트장</span>
                </div>
                <div className="text-sm">즉시 면담 → 관리 부담·역량 점검. 필요시 매장 조정</div>
              </div>
              <div className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-700 mb-1">
                  <Bell size={12} />
                  <span>중점 모니터링</span>
                </div>
                <div className="text-sm">정기 안전교육 이수 확인 + 분기별 추세 관찰</div>
              </div>
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700 mb-1">
                  <Trophy size={12} />
                  <span>우수 파트장 발굴</span>
                </div>
                <div className="text-sm">사고율 낮은 파트장 사례 공유 + 인센티브 연계</div>
              </div>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}



// ========== NEW: 시군구 & 매장 세부 분석 ==========
export default ParjangDashboard;

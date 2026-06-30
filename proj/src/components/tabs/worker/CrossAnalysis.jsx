import { useState, useEffect, useMemo, useRef, useCallback, Fragment } from 'react';
import { BarChart, Bar, LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LabelList, ComposedChart, ScatterChart, Scatter, ZAxis, ReferenceLine } from 'recharts';
import { Activity, AlertCircle, MapPin, AlertTriangle, Banknote, BarChart3, Bell, Bone, Briefcase, Building, Building2, Calendar, CheckCircle2, Circle, ClipboardList, FileText, Flame, Folder, GitBranch, Info, Lightbulb, Lock, Map as MapIcon, Package, Pin, RefreshCw, Rocket, Ruler, Scale, Search, ShieldCheck, Siren, Smartphone, Store, Tag, Target, TrendingUp, Trophy, Unlock, UserCircle, Users, X, LayoutDashboard, Stethoscope, Download, ChevronRight, ChevronDown, Clock, Sparkles } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN, CUSTOMER_BLUE, DEEP_BLUE, BL, OR, NV, GR, RD, GN, PR, AM, PAL, CANVAS, rankColor } from '../../../constants/colors.js';
import { MIN_WAGE_DAY, CURRENT_YEAR, INDIRECT_COST_MULTIPLIER, OPERATING_MARGIN } from '../../../constants/metrics.js';
import { pct, fmt, fmtKrw, TT, EmptyState } from '../../../utils/uiHelpers.jsx';
import { useCountUp, useInView } from '../../../utils/motion.js';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { Card, EstimateBadge } from '../../../components/shared/Card.jsx';
import { CalcTip, HeatmapGrid, BarRank, Matrix } from '../../../components/shared/ChartHelpers.jsx';
import { RISK_COLORS } from '../../../constants/riskColors.js';

function CrossAnalysis({ D, yearFilter }) {
  const yrLabel = !yearFilter || yearFilter === "all" ? "전체 기간" : `${yearFilter}년`;

  // 교차분석 동적 조회 헬퍼 (yearFilter 반영 — D.cross·D.keywords 는 이미 필터 적용)
  const crossCell = (type, cause) => {
    const row = (D.cross || []).find(r => r.type === type);
    return row != null ? (row[cause] ?? null) : null;
  };
  const fmtCell = (v) => v !== null ? `${v}건` : '—';
  const kwCount = (word) => { const k = (D.keywords || []).find(k => k.word === word); return k != null ? k.count : null; };
  const fmtKw = (v) => v !== null ? String(v) : '—';

  const injuryRef = useRef(null);
  const injuryInView = useInView(injuryRef);
  const causeRef = useRef(null);
  const causeInView = useInView(causeRef);
  const genderRef = useRef(null);
  const genderInView = useInView(genderRef);
  const [kwExpanded, setKwExpanded] = useState(false);
  useEffect(() => { setKwExpanded(false); }, [yearFilter]);

  // ── 기인물 도넛 총건수 카운트업 ───────────────────────────
  const causeTotalRaw = Object.values(D.cause || {}).reduce((s, v) => s + v, 0);
  const cu_causeTotal = useCountUp(causeTotalRaw, 900, causeInView);

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

      {/* 단변량 분포 — 재해유형 빈도(막대) + 기인물 빈도(도넛). 아래 교차 매트릭스의 주변분포 */}
      {(() => {
        const injuryArr = Object.entries(D.injury || {}).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
        const causeAll = Object.entries(D.cause || {}).map(([name, value]) => ({ name, value })).filter(d => d.value > 0).sort((a, b) => b.value - a.value);
        const causeTop = causeAll.slice(0, 8);
        const causeEtc = causeAll.slice(8).reduce((s, c) => s + c.value, 0);
        const causeArr = causeEtc > 0 ? [...causeTop, { name: '기타', value: causeEtc }] : causeTop;
        const causeTotal = causeArr.reduce((s, c) => s + c.value, 0);
        return (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card title="재해유형 분포" titleIcon={Tag} sub="건수 기준 (전체 재해유형) — 1위 레드·2위 네이비·나머지 그레이" right={<ExportBtn rows={injuryArr.map(d => ({ 재해유형: d.name, 건수: d.value }))} filename="재해유형_분포.csv" />}>
              {injuryArr.length === 0 ? <EmptyState message="재해유형 데이터가 없습니다" icon="📊" /> : (
                <div key={injuryArr.length > 0 ? "c" : "e"} ref={injuryRef}>
                  <ResponsiveContainer width="100%" height={Math.max(200, injuryArr.length * 28)} debounce={50}>
                    <BarChart key={injuryInView ? `1-${yearFilter||"all"}` : 0} data={injuryArr} layout="vertical" margin={{ left: 0, right: 36 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#44403C" }} axisLine={false} tickLine={false} width={88} interval={0} />
                      <Tooltip content={<TT />} />
                      <Bar dataKey="value" radius={[0, 5, 5, 0]} name="건수" isAnimationActive={injuryInView} animationDuration={700} animationBegin={0}>
                        {injuryArr.map((e, i) => <Cell key={i} fill={rankColor(i)} />)}
                        <LabelList dataKey="value" position="right" style={{ fontSize: 10, fill: NV, fontWeight: 700 }} />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </Card>
            <Card title="재해 기인물 분포" titleIcon={Package} sub="건수 기준 · 상위 8 + 기타" right={<ExportBtn rows={causeArr.map(d => ({ 기인물: d.name, 건수: d.value }))} filename="기인물_분포.csv" />}>
              {causeArr.length === 0 ? <EmptyState message="기인물 데이터가 없습니다" icon="🍩" /> : (
                <div key={causeArr.length > 0 ? "c" : "e"} className="flex flex-col sm:flex-row items-center gap-3" ref={causeRef}>
                  <div className="relative w-full sm:w-[52%] h-[180px] sm:h-[240px]">
                    <ResponsiveContainer width="100%" height="100%" debounce={50}>
                      <PieChart key={causeInView ? `1-${yearFilter||"all"}` : 0}>
                        <Pie data={causeArr} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={88} paddingAngle={2} startAngle={90} endAngle={-270} stroke="none" isAnimationActive={causeInView} animationDuration={700}>
                          {causeArr.map((e, i) => <Cell key={i} fill={PAL[i % PAL.length]} />)}
                        </Pie>
                        <Tooltip content={<TT />} />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                      <div className="text-center leading-none">
                        <div className="text-xl font-extrabold text-[#071E4A]">{cu_causeTotal}</div>
                        <div className="text-[10px] text-stone-500 font-medium mt-0.5">건</div>
                      </div>
                    </div>
                  </div>
                  <div className="flex-1 w-full min-w-0 space-y-1">
                    {causeArr.map((c, i) => (
                      <div key={c.name} className="flex items-center gap-1.5 text-[11px]">
                        <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: PAL[i % PAL.length] }} />
                        <span className="truncate text-stone-600 flex-1">{c.name}</span>
                        <span className="font-bold tabular-nums text-stone-800">{c.value}</span>
                        <span className="text-stone-400 tabular-nums w-9 text-right">{causeTotal ? (c.value / causeTotal * 100).toFixed(0) : 0}%</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </Card>
          </div>
        );
      })()}

      <Card title="재해유형 × 기인물 매트릭스" titleIcon={GitBranch} sub="'어떤 기인물이 어떤 재해를 일으키는가' — 안전관리 개입점 도출" right={<ExportBtn rows={D.cross || []} filename="재해유형_기인물_매트릭스.csv" />}>
        {D.cross && D.crossCauses ? <Matrix data={D.cross} rowKey="type" cols={D.crossCauses} /> : <EmptyState message="매트릭스 데이터 없음" />}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs font-bold text-stone-700">상위 셀 관찰</div><div>넘어짐×계단({fmtCell(crossCell('넘어짐', '계단'))}) · 무리한 동작×반복작업({fmtCell(crossCell('무리한 동작', '반복작업'))}) · 베임×칼({fmtCell(crossCell('베임', '칼'))}). <span className="text-stone-500">큰 셀 = 빈도 높은 조합. 단, 작업 빈도(노출량) 보정 전이므로 절대 위험도 비교는 주의.</span></div></div>
          <div className="p-3 rounded-lg bg-stone-50 border border-stone-200"><div className="text-xs font-bold text-blue-700">읽는 법</div><div>행(재해유형) 기준 기인물 비중 확인 → 넘어짐의 원인 분포 파악 가능</div></div>
          <div className="p-3 rounded-lg bg-white border border-stone-200 break-keep"><div className="text-xs font-bold text-amber-700">활용 가이드</div><div>큰 셀 = 빈도 높은 조합 → 현장 RCA 우선순위 후보. <span className="text-stone-500">실제 개입 효과는 노출량·예방 비용 등 추가 분석 필요.</span></div></div>
        </div>
      </Card>
      
      <Card title="사고 내용 키워드 빈도분석" titleIcon={Search} sub="사고 서술문에서 추출한 핵심 키워드 — 숨은 위험 패턴 도출">
        {(() => {
          const maxC = Math.max(...(D.keywords || []).map(k => k.count), 1);
          const MOBILE_LIMIT = 15;
          const fullList = (D.keywords || []).slice(0, 20);
          const visibleKw = kwExpanded ? fullList : fullList.slice(0, MOBILE_LIMIT);
          return (
            <>
              <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                {visibleKw.map((kw) => {
                  const size = 12 + Math.round((kw.count / maxC) * 10);
                  const opacity = 0.4 + (kw.count / maxC) * 0.6;
                  return (
                    <div key={kw.word} className="flex flex-col items-center justify-center p-3 rounded-lg bg-stone-50 border border-stone-200 hover:border-stone-300 transition min-h-[44px] active:scale-[0.97]">
                      <span className="font-bold text-stone-900" style={{ fontSize: `${size}px`, opacity }}>{kw.word}</span>
                      <span className="text-xs text-stone-500 tabular-nums mt-1">{kw.count}회</span>
                    </div>
                  );
                })}
              </div>
              {fullList.length > MOBILE_LIMIT && (
                <button
                  onClick={() => setKwExpanded(v => !v)}
                  className="mt-2 w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-stone-200 text-xs text-stone-500 hover:bg-stone-50 active:scale-[0.97] transition min-h-[44px]"
                >
                  <ChevronDown size={14} className={kwExpanded ? "rotate-180 transition-transform duration-200" : "transition-transform duration-200"} />
                  {kwExpanded ? "접기" : `${fullList.length - MOBILE_LIMIT}개 더 보기`}
                </button>
              )}
            </>
          );
        })()}
        <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-sm text-stone-700 break-keep">
          <b>키워드 빈도 관찰</b>: 사고 서술문에서 "넘어짐({fmtKw(kwCount('넘어짐'))})" "박스를({fmtKw(kwCount('박스를'))})" "계단을({fmtKw(kwCount('계단을'))})" "헛디뎌({fmtKw(kwCount('헛디뎌'))})" 등이 자주 등장. <span className="text-stone-500">※ 키워드 빈도는 사고 발생 패턴의 단서일 뿐, 인과 관계는 별도 검증 필요. 예: "계단" 키워드가 많다고 계단 자체가 원인인지, 작업 동선이 원인인지는 현장 RCA(Root Cause Analysis) 필요.</span>
        </div>
      </Card>
      
      <Card title="부서 × 재해유형 매트릭스" titleIcon={Building2} sub="부서별 재해유형 분포 비교">
        {D.deptType && D.crossTypes ? <Matrix data={D.deptType} rowKey="dept" cols={D.crossTypes} /> : <EmptyState message="매트릭스 데이터 없음" />}
      </Card>
      
      <Card title="성별 × 재해유형" titleIcon={UserCircle} sub={(() => {
        const total = (D.genderType || []).reduce((s, r) => s + (r.여 || 0) + (r.남 || 0), 0);
        return `성별 특성별 재해 패턴 (기록된 ${total}건 기준)${D._isEstimated ? " · 추정" : ""}`;
      })()}>
        {(D.genderType || []).length === 0 ? (
          <EmptyState message="성별 데이터가 없습니다" icon={Users} />
        ) : (
          <div key="c" ref={genderRef}>
            <ResponsiveContainer width="100%" height={220} debounce={50}>
              <BarChart key={genderInView ? `1-${yearFilter||"all"}` : 0} data={D.genderType} layout="vertical" margin={{ left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E7E5E4" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 10, fill: "#78716C" }} axisLine={false} tickLine={false} />
                <YAxis type="category" dataKey="type" tick={{ fontSize: 10, fill: "#44403C" }} axisLine={false} tickLine={false} width={90} />
                <Tooltip content={<TT />} />
                <Legend wrapperStyle={{ fontSize: 12 }} iconType="circle" />
                <Bar dataKey="여" fill={DAISO_RED} radius={[0,3,3,0]} isAnimationActive={genderInView} animationDuration={600} animationBegin={0} />
                <Bar dataKey="남" fill={BL} radius={[0,3,3,0]} isAnimationActive={genderInView} animationDuration={600} animationBegin={100} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      {/* ── F1 추가: 시간대별 사고 집중도 ── */}
      <Card title="시간대별 사고 집중도" titleIcon={Calendar} sub="발생 시각 데이터 연동 예정">
        <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50 flex flex-col items-center justify-center py-12 gap-2">
          <Clock size={20} className="text-stone-300" />
          <span className="text-stone-400 text-sm font-medium">시간대별 사고 데이터 수집 중</span>
          <span className="text-stone-300 text-xs">데이터 연동 후 자동 표시됩니다</span>
        </div>
      </Card>

      {/* ── F1 추가: 부서 × 기인물 상위 매트릭스 ── */}
      {(() => {
        // D.deptCause: [{ dept, [cause]: count, ... }] 형식 기대
        // 없으면 D.cross 기반으로 추정
        const deptCauseData = D.deptCause || [];
        const topCauses = D.crossCauses?.slice(0, 6) || ["계단", "반복작업", "칼·커터", "바닥", "물체", "기타"];
        if (deptCauseData.length === 0) return null;
        return (
          <Card title="부서 × 기인물 매트릭스" titleIcon={Building2}
            sub="부서별 주요 기인물 집중도 — 설비·환경 개선 우선순위 도출"
            right={<ExportBtn rows={deptCauseData} filename="부서별_기인물.csv" />}>
            <Matrix data={deptCauseData} rowKey="dept" cols={topCauses} />
          </Card>
        );
      })()}
      

    </div>
  );
}


// ========== TAB 5: Human Factors (Age/Tenure/Gender/Employment) ==========
export default CrossAnalysis;

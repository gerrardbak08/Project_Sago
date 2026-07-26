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
        // 오버플로 버킷은 '그 외'로 명명 — 기인물 '기타'가 상위8에 포함될 때 라벨 충돌(중복 key)·이중표기 방지
        const causeArr = causeEtc > 0 ? [...causeTop, { name: '그 외', value: causeEtc }] : causeTop;
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

      {/* 재해유형별 세부원인 — causeTaxonomy 규칙기반 분류 (사고경위 서술 근거). 예방수칙 단위 분할. */}
      {D.subCauseByType && Object.keys(D.subCauseByType).length > 0 && (() => {
        const yk = yearFilter && yearFilter !== 'all' ? (yearFilter === '2024' ? 'y24' : yearFilter === '2025' ? 'y25' : 'y26') : null;
        const typePanels = Object.entries(D.subCauseByType)
          .map(([type, subs]) => {
            const items = subs.map(s => ({ name: s.label, value: yk ? (s[yk] || 0) : s.n })).filter(x => x.value > 0).sort((a, b) => b.value - a.value);
            return { type, total: items.reduce((s, x) => s + x.value, 0), items };
          })
          .filter(t => t.total > 0)
          .sort((a, b) => b.total - a.total);
        const exportRows = typePanels.flatMap(t => t.items.map(it => ({ 재해유형: t.type, 세부원인: it.name, 건수: it.value })));
        // 무리한 동작 동작×부위 — 컴포넌트 실집계(연도 반응). D.accidents는 필터 무관 원본이라 실카운트.
        const motionAccs = (D.accidents || []).filter(a => a.typeCanon === '무리한 동작' && (a.bum === '수도권' || a.bum === '지방') && (!yk || String(a.year) === yearFilter));
        const PARTS = ['허리', '손목', '어깨', '무릎', '손·손가락', '목', '갈비·늑골', '다리·종아리'];
        const motionRows = [...new Set(motionAccs.map(a => a.subCauseLabel))].map(act => {
          const row = { act };
          for (const p of PARTS) row[p] = motionAccs.filter(a => a.subCauseLabel === act && a.bodyPart === p).length;
          return row;
        }).filter(r => PARTS.some(p => r[p] > 0));
        const motionCols = PARTS.filter(p => motionRows.some(r => r[p] > 0));
        return (
          <Card title="재해유형별 세부원인" titleIcon={ClipboardList}
            sub="사고경위 서술 기반 규칙분류 — '왜 그 유형이 발생했나' (예방수칙 단위 세부원인)"
            right={<ExportBtn rows={exportRows} filename="재해유형별_세부원인.csv" />}>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-x-6 gap-y-4">
              {typePanels.map(t => {
                const mx = t.items[0]?.value || 1;
                return (
                  <div key={t.type} className="min-w-0">
                    <div className="flex items-baseline justify-between mb-1.5 pb-1.5 border-b border-stone-100">
                      <span className="text-sm font-bold text-stone-800">{t.type}</span>
                      <span className="text-xs text-stone-400 tabular-nums">{t.total}건</span>
                    </div>
                    <div className="space-y-1">
                      {t.items.map((it, i) => (
                        <div key={it.name} className="flex items-center gap-2 py-0.5">
                          <span className="text-[11px] text-stone-600 w-24 flex-shrink-0 break-keep leading-tight">{it.name}</span>
                          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all" style={{ width: `${(it.value / mx) * 100}%`, background: rankColor(i) }} />
                          </div>
                          <span className="text-[11px] font-bold tabular-nums text-stone-700 w-14 text-right">{it.value}<span className="text-stone-400 font-normal ml-0.5">{t.total ? Math.round(it.value / t.total * 100) : 0}%</span></span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
            {motionRows.length > 0 && (
              <div className="mt-5 pt-4 border-t border-stone-200">
                <div className="text-sm font-bold text-stone-700 mb-1">무리한 동작 · 동작 × 부상부위</div>
                <div className="text-xs text-stone-500 mb-2">어떤 동작이 어느 부위 부담으로 이어지는가 — 근골격계 개입점</div>
                <Matrix data={motionRows} rowKey="act" cols={motionCols} />
              </div>
            )}
            <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600 break-keep">
              세부원인은 사고경위 서술문의 규칙기반 분류입니다(예: 넘어짐 → 헛디딤·장애물 걸림·미끄러짐). <span className="text-stone-500">예방수칙이 다른 축으로 분할했으며, 저신호 서술은 '기타'로 남겨둡니다. 이 세부원인이 향후 매장별 예방 카드의 기반이 됩니다.</span>
            </div>
          </Card>
        );
      })()}

      {/* 발생 장소 — locationTaxonomy 규칙기반 추출 (사고경위 서술 근거). 세부원인(왜)과 직교하는 '어디서' 축. */}
      {(() => {
        const accs = (D.accidents || []).filter(a => a.loc && (a.bum === '수도권' || a.bum === '지방')
          && (!yearFilter || yearFilter === 'all' || String(a.year) === yearFilter));
        if (accs.length === 0) return null;
        const matched = accs.filter(a => a.locMatched);
        const locMap = {};
        for (const a of accs) {
          const rec = locMap[a.locLabel] || (locMap[a.locLabel] = { label: a.locLabel, n: 0, loss: 0, lossN: 0, types: {} });
          rec.n++;
          if (a.loss_days > 0) { rec.loss += a.loss_days; rec.lossN++; }
          rec.types[a.typeCanon] = (rec.types[a.typeCanon] || 0) + 1;
        }
        const dist = Object.values(locMap).sort((a, b) => b.n - a.n);
        const distMax = dist[0]?.n || 1;
        // 3대 핫스팟 = 매장 안팎의 물리 장소만 (장소불명·출퇴근 도로 제외)
        const hotspots = dist.filter(d => d.label !== '장소불명' && !d.label.startsWith('도로')).slice(0, 3);
        // 유형 × 장소 매트릭스 (실집계 — 연도필터 반영)
        const locCols = dist.filter(d => d.label !== '장소불명').slice(0, 8).map(d => d.label);
        const typeTotals = {};
        for (const a of accs) typeTotals[a.typeCanon] = (typeTotals[a.typeCanon] || 0) + 1;
        const locRows = Object.keys(typeTotals).sort((a, b) => typeTotals[b] - typeTotals[a]).map(t => {
          const row = { type: t };
          for (const l of locCols) row[l] = accs.filter(a => a.typeCanon === t && a.locLabel === l).length;
          return row;
        }).filter(r => locCols.some(l => r[l] > 0));
        const avgLoss = (d) => d.lossN ? Math.round(d.loss / d.lossN) : null;
        const topTypeOf = (d) => Object.entries(d.types).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';
        const isAllPeriod = !yearFilter || yearFilter === 'all';
        const severity = isAllPeriod ? (D.location?.severity || []) : [];
        const exportRows = dist.map(d => ({ 장소: d.label, 건수: d.n, 점유율: `${Math.round(d.n / accs.length * 100)}%`, 평균휴업일: avgLoss(d) ?? '', 주유형: topTypeOf(d) }));
        return (
          <Card title="발생 장소 분석" titleIcon={MapPin}
            sub={`사고경위 서술 기반 규칙추출 — '어디서 일어났는가' (장소 확인 ${matched.length}건 기준 · 전체 ${accs.length}건)`}
            right={<ExportBtn rows={exportRows} filename="발생장소_분석.csv" />}>
            {/* 3대 물리 핫스팟 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-4">
              {hotspots.map((h, i) => (
                <div key={h.label} className="rounded-xl border border-stone-200 bg-stone-50 p-3">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded text-white" style={{ background: rankColor(i) }}>{i + 1}위</span>
                    <span className="text-sm font-bold text-stone-800 break-keep">{h.label}</span>
                  </div>
                  <div className="mt-1.5 flex items-baseline gap-1.5">
                    <span className="text-xl font-extrabold tabular-nums text-[#071E4A]">{h.n}</span>
                    <span className="text-xs text-stone-500">건 · {Math.round(h.n / accs.length * 100)}%</span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5">평균 휴업 <b className="text-stone-700">{avgLoss(h) ?? '—'}</b>일 · 주 유형 <b className="text-stone-700">{topTypeOf(h)}</b></div>
                </div>
              ))}
            </div>
            {/* 장소 분포 랭크바 */}
            <div className="space-y-1 mb-4">
              {dist.map((d, i) => (
                <div key={d.label} className="flex items-center gap-2 py-0.5">
                  <span className={`text-[11px] w-24 flex-shrink-0 break-keep leading-tight ${d.label === '장소불명' ? 'text-stone-400' : 'text-stone-600'}`}>{d.label}</span>
                  <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all" style={{ width: `${(d.n / distMax) * 100}%`, background: d.label === '장소불명' ? '#D6D3D1' : rankColor(i) }} />
                  </div>
                  <span className="text-[11px] font-bold tabular-nums text-stone-700 w-20 text-right">{d.n}<span className="text-stone-400 font-normal ml-0.5">{Math.round(d.n / accs.length * 100)}%</span><span className="text-stone-400 font-normal ml-1">{avgLoss(d) != null ? `${avgLoss(d)}일` : ''}</span></span>
                </div>
              ))}
            </div>
            {/* 유형 × 장소 매트릭스 */}
            <div className="text-sm font-bold text-stone-700 mb-1">재해유형 × 장소</div>
            <div className="text-xs text-stone-500 mb-2">유형별 집중 장소 확인 — 장소불명 제외 상위 {locCols.length}개 장소</div>
            {locRows.length > 0 ? <Matrix data={locRows} rowKey="type" cols={locCols} /> : <EmptyState message="매트릭스 데이터 없음" />}
            {/* 고위험 조합 — 표본 5건 이상, 전체 기간 기준 */}
            {severity.length > 0 && (
              <div className="mt-4 pt-3 border-t border-stone-200">
                <div className="text-sm font-bold text-stone-700 mb-1">고위험 조합 <span className="text-xs font-normal text-stone-400">(유형×장소 · 평균 휴업일수 순 · 표본 5건 이상 · 전체 기간)</span></div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 mt-2">
                  {severity.slice(0, 8).map((c, i) => (
                    <div key={`${c.type}|${c.loc}`} className="flex items-center gap-2 text-[12px] py-0.5">
                      <span className={`font-extrabold tabular-nums w-12 text-right ${i < 2 ? 'text-red-600' : 'text-stone-800'}`}>{c.loss_days_avg}일</span>
                      <span className="text-stone-700 break-keep flex-1">{c.type} <span className="text-stone-400">@</span> {c.locLabel}</span>
                      <span className="text-stone-400 tabular-nums">{c.n}건</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <div className="mt-3 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-600 break-keep">
              장소는 사고경위 서술문의 규칙기반 추출입니다(원본DB에 장소 필드 없음). <span className="text-stone-500">서술에 행동만 있고 장소가 없는 건은 '장소불명'으로 남겨둡니다. 계단·후방(상하차·창고)·매대가 3대 물리 핫스팟이며, 사다리 위는 건수는 적지만 평균 휴업일수가 가장 깁니다 — TBM·점검 동선의 우선순위 근거로 활용하세요.</span>
            </div>
          </Card>
        );
      })()}

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

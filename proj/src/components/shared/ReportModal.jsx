// 월간 산업재해 현황 요약 리포트 — 안전보건팀 배포용 1장 인포그래픽.
// 부문(전체통합/수도권/지방) + 월 선택 → 라이브 데이터(D.accidents) 자동 집계.
// 인쇄(@media print, body.printing #report-doc) · 이미지(html2canvas) 내보내기.
import { useEffect, useState, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Printer, X, Image as ImageIcon, Plus, BarChart3 } from 'lucide-react';
import { BarChart, Bar, ComposedChart, Line, XAxis, YAxis, Cell, PieChart, Pie, ResponsiveContainer, LabelList } from 'recharts';
import { exportElementPng } from '../../utils/exportUtils.jsx';
import DAISO_LOGO from '../../data/logo.js';

const NAVY = '#0E2A6E', NAVY2 = '#1B3B7A', RED = '#E2231A', GRAY = '#C7CDD6', INK = '#1C2A45';
const DONUT_PAL = [NAVY2, RED, '#5B7BC0', '#A9BCE0', GRAY];
const RANK = [NAVY2, RED, GRAY];

const BUMS = [
  { key: 'all',    label: '전체통합',       sub: '전체 통합(수도권+지방)', word: '통합 ', match: r => r.bum === '수도권' || r.bum === '지방' },
  { key: '수도권', label: '수도권영업부문', sub: '수도권영업부문',         word: '',      match: r => r.bum === '수도권' },
  { key: '지방',   label: '지방영업부문',   sub: '지방영업부문',           word: '',      match: r => r.bum === '지방' },
];
const MONTH_LABELS = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function ReportModal({ D, onClose }) {
  const recs = (D && D.accidents) || [];
  const docRef = useRef(null);
  const [busy, setBusy] = useState(false);

  const ymList = useMemo(() => {
    const set = new Set();
    recs.forEach(r => { if (r.year && r.month) set.add(`${r.year}-${String(r.month).padStart(2, '0')}`); });
    return [...set].sort().reverse();
  }, [recs]);

  const [ym, setYm] = useState(ymList[0] || '2026-05');
  const [bumKey, setBumKey] = useState('all');

  useEffect(() => { document.body.classList.add('printing'); return () => document.body.classList.remove('printing'); }, []);

  const [year, month] = ym.split('-').map(Number);
  const bum = BUMS.find(b => b.key === bumKey) || BUMS[0];
  const bumRecs = useMemo(() => recs.filter(bum.match), [recs, bumKey]);

  const R = useMemo(() => {
    const inMonth = (y, m) => bumRecs.filter(r => r.year === y && r.month === m).length;
    const total = inMonth(year, month);
    const prevY = month === 1 ? year - 1 : year, prevM = month === 1 ? 12 : month - 1;
    const prevCount = inMonth(prevY, prevM);
    const mom = total - prevCount;
    const ytd = bumRecs.filter(r => r.year === year && r.month <= month).length;
    const ytdPrev = bumRecs.filter(r => r.year === year - 1 && r.month <= month).length;
    const yoyPct = ytdPrev ? ((ytd - ytdPrev) / ytdPrev * 100) : null;

    const trend = MONTH_LABELS.map((lbl, i) => {
      const mm = i + 1;
      const isPast = mm <= month;
      const actual = inMonth(year, mm);
      const past = inMonth(year - 1, mm);
      return { m: lbl, 실적: isPast ? actual : null, 과거: isPast ? null : past, line: isPast ? actual : null };
    });

    const monthRecs = bumRecs.filter(r => r.year === year && r.month === month);
    const tc = {}; monthRecs.forEach(r => { const t = r.type || '기타'; tc[t] = (tc[t] || 0) + 1; });
    const typeArr = Object.entries(tc).sort((a, b) => b[1] - a[1]);
    const top4 = typeArr.slice(0, 4), etc = typeArr.slice(4).reduce((s, [, n]) => s + n, 0);
    const donut = [...top4.map(([name, value]) => ({ name, value })), ...(etc > 0 ? [{ name: '기타', value: etc }] : [])];
    const typeTop3 = typeArr.slice(0, 3);

    const dc = {}; monthRecs.forEach(r => { const d = r.dept || '기타'; dc[d] = (dc[d] || 0) + 1; });
    const deptTop3 = Object.entries(dc).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([d, n]) => [d.replace(/영업부$/, ''), n]);

    return { total, prevCount, mom, ytd, ytdPrev, yoyPct, trend, donut, typeTop3, deptTop3 };
  }, [bumRecs, year, month]);

  const lastDay = new Date(year, month, 0).getDate();
  const mm = String(month).padStart(2, '0');
  const period = `${year}.${mm}.01 ~ ${year}.${mm}.${String(lastDay).padStart(2, '0')}`;
  const donutTotal = R.donut.reduce((s, d) => s + d.value, 0);

  const bullets = bumKey === 'all'
    ? [
        ['최다 유형', `${R.typeTop3[0]?.[0] || '-'} 사고 중심 TBM·작업 전 주의 강화`],
        ['집중 영업부', `${R.deptTop3[0]?.[0] || '-'} 중심 현장점검 우선 실시`],
        ['반복', `반복사고 매장 개선조치 이행 여부 확인`],
      ]
    : [
        ['전월', `전월 대비 재해 ${Math.abs(R.mom)}건 ${R.mom > 0 ? '증가' : R.mom < 0 ? '감소' : '동일'}`],
        ['유형', `최다 재해유형은 ${R.typeTop3[0]?.[0] || '-'}`],
        ['집중', `집중관리 영업부 ${R.deptTop3[0]?.[0] || '-'}`],
      ];

  const exportPng = async () => {
    setBusy(true);
    try { await exportElementPng(docRef.current, `산업재해_현황_요약_${year}년_${month}월_${bum.label}.png`); }
    catch (e) { console.warn('이미지 캡처 실패', e); }
    finally { setBusy(false); }
  };

  const TopBar = () => (
    <div className="no-print flex flex-wrap items-center gap-2 mb-3">
      <div className="flex rounded-lg bg-white/15 p-0.5">
        {BUMS.map(b => (
          <button key={b.key} onClick={() => setBumKey(b.key)}
            className={`px-3 h-8 rounded-md text-xs font-semibold transition cursor-pointer ${bumKey === b.key ? 'bg-white text-[#0E2A6E]' : 'text-white/80 hover:text-white'}`}>
            {b.label}
          </button>
        ))}
      </div>
      <select value={ym} onChange={e => setYm(e.target.value)}
        className="h-8 px-2.5 rounded-md bg-white/15 text-white text-xs font-semibold cursor-pointer border-0 outline-none">
        {ymList.map(v => { const [y, m] = v.split('-'); return <option key={v} value={v} className="text-stone-900">{y}년 {Number(m)}월</option>; })}
      </select>
      <div className="flex-1" />
      <button onClick={exportPng} disabled={busy}
        className="h-8 px-3 rounded-md bg-white/15 text-white text-xs font-semibold flex items-center gap-1.5 cursor-pointer hover:bg-white/25 disabled:opacity-50">
        <ImageIcon size={13} /> {busy ? '생성중…' : '이미지'}
      </button>
      <button onClick={() => window.print()}
        className="h-8 px-3 rounded-md bg-white text-[#0E2A6E] text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:bg-stone-100">
        <Printer size={13} /> 인쇄
      </button>
      <button onClick={onClose}
        className="h-8 w-8 rounded-md bg-white/15 text-white hover:bg-white/25 flex items-center justify-center cursor-pointer"><X size={16} /></button>
    </div>
  );

  const Panel = ({ title, children, className = '' }) => (
    <div className={`bg-white rounded-xl border border-stone-200/80 p-3.5 ${className}`} style={{ boxShadow: '0 2px 10px rgba(14,42,110,0.05)' }}>
      <div className="text-[13px] font-extrabold mb-2.5" style={{ color: NAVY }}>{title}</div>
      {children}
    </div>
  );

  return createPortal((
    <div id="report-portal" className="fixed inset-0 z-[60] bg-black/50 flex items-start justify-center overflow-auto p-3 sm:p-6" onClick={onClose}>
      <div className="w-full max-w-[1040px] my-2" onClick={e => e.stopPropagation()}>
        <TopBar />
        {/* ─── 리포트 문서 (인쇄/캡처 대상) ─── */}
        <div id="report-doc" ref={docRef} className="rounded-2xl px-7 py-6" style={{ background: '#F4F7FC' }}>
          {/* 헤더 */}
          <div className="relative flex items-center justify-center mb-4">
            <div className="text-center">
              <h1 className="text-[26px] font-black tracking-tight" style={{ color: NAVY }}>
                {year}년 {month}월 산업재해 {bum.word}현황
              </h1>
              <div className="text-[12px] mt-0.5" style={{ color: '#6B7794' }}>
                {bum.sub} <span className="mx-1 text-stone-300">/</span> 기준: {period}
              </div>
            </div>
            <img src={DAISO_LOGO} alt="ASUNG DAISO" className="absolute right-0 top-1/2 -translate-y-1/2" style={{ height: 30, width: 'auto', objectFit: 'contain' }} />
          </div>

          {/* 상단 스탯 스트립 */}
          <div className="bg-white rounded-xl border border-stone-200/80 grid grid-cols-2 mb-4" style={{ boxShadow: '0 2px 10px rgba(14,42,110,0.05)' }}>
            {/* 총 재해 */}
            <div className="flex items-center gap-4 p-4 border-r border-stone-100">
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 44, height: 44, background: '#FDEBEA' }}>
                <Plus size={22} strokeWidth={3} color={RED} />
              </div>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: '#6B7794' }}>총 재해</div>
                <div className="flex items-baseline gap-1"><span className="text-[34px] font-black leading-none tabular-nums" style={{ color: NAVY }}>{R.total}</span><span className="text-[15px] font-bold text-stone-400">건</span></div>
              </div>
              <div className="ml-auto text-right pr-1">
                <div className="text-[11px]" style={{ color: '#8A94A8' }}>전월 {R.prevCount}건 대비</div>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-md text-[13px] font-extrabold tabular-nums"
                  style={{ background: R.mom > 0 ? '#FDEBEA' : '#EAF0FB', color: R.mom > 0 ? RED : NAVY2 }}>
                  {R.mom === 0 ? '—' : (R.mom > 0 ? '▲' : '▼')}{Math.abs(R.mom)}건
                </div>
              </div>
            </div>
            {/* 연간 누적 */}
            <div className="flex items-center gap-4 p-4">
              <div className="flex items-center justify-center rounded-full flex-shrink-0" style={{ width: 44, height: 44, background: '#EAF0FB' }}>
                <BarChart3 size={22} strokeWidth={2.5} color={NAVY2} />
              </div>
              <div>
                <div className="text-[12px] font-semibold" style={{ color: '#6B7794' }}>연간 누적</div>
                <div className="flex items-baseline gap-1"><span className="text-[34px] font-black leading-none tabular-nums" style={{ color: NAVY }}>{R.ytd}</span><span className="text-[15px] font-bold text-stone-400">건</span></div>
              </div>
              <div className="ml-auto text-right pr-1">
                <div className="text-[11px]" style={{ color: '#8A94A8' }}>전년 동기 {R.ytdPrev}건 대비</div>
                <div className="inline-flex items-center gap-1 mt-1 px-2 py-1 rounded-md text-[13px] font-extrabold tabular-nums"
                  style={{ background: (R.yoyPct ?? 0) > 0 ? '#FDEBEA' : '#EAF0FB', color: (R.yoyPct ?? 0) > 0 ? RED : NAVY2 }}>
                  {R.yoyPct == null ? '-' : `${R.yoyPct > 0 ? '▲' : '▼'}${Math.abs(R.yoyPct).toFixed(1)}% ${R.yoyPct > 0 ? '증가' : '감소'}`}
                </div>
              </div>
            </div>
          </div>

          {/* 중단: 월별 추이 + 재해유형 비중 */}
          <div className="grid grid-cols-[1.55fr_1fr] gap-4 mb-4">
            <Panel title={`${year} 월별 재해 발생 추이`}>
              <ResponsiveContainer width="100%" height={188}>
                <ComposedChart data={R.trend} margin={{ top: 16, right: 6, left: -18, bottom: 0 }}>
                  <XAxis dataKey="m" tick={{ fontSize: 10, fill: '#6B7794' }} axisLine={false} tickLine={false} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#9AA3B5' }} axisLine={false} tickLine={false} />
                  <Bar dataKey="과거" fill={GRAY} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                    <LabelList dataKey="과거" position="top" style={{ fontSize: 9, fill: '#A6AEBD', fontWeight: 600 }} />
                  </Bar>
                  <Bar dataKey="실적" fill={NAVY2} radius={[3, 3, 0, 0]} maxBarSize={26} isAnimationActive={false}>
                    <LabelList dataKey="실적" position="top" style={{ fontSize: 10, fill: NAVY, fontWeight: 800 }} />
                  </Bar>
                  <Line dataKey="line" stroke={RED} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3, fill: RED, strokeWidth: 0 }} isAnimationActive={false} connectNulls={false} />
                </ComposedChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 justify-center mt-1 text-[10px]" style={{ color: '#6B7794' }}>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: NAVY2 }} />실적</span>
                <span className="flex items-center gap-1"><span className="inline-block w-3 h-0 border-t-2 border-dashed" style={{ borderColor: RED }} />추세선</span>
                <span className="flex items-center gap-1"><span className="inline-block w-2.5 h-2.5 rounded-sm" style={{ background: GRAY }} />과거건수</span>
              </div>
            </Panel>

            <Panel title={`${month}월 재해유형 비중`}>
              <div className="flex items-center gap-2">
                <div className="relative flex-shrink-0" style={{ width: 130, height: 130 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={R.donut.length ? R.donut : [{ name: '없음', value: 1 }]} dataKey="value" nameKey="name"
                        cx="50%" cy="50%" innerRadius={40} outerRadius={62} paddingAngle={1.5} stroke="none" isAnimationActive={false}>
                        {(R.donut.length ? R.donut : [{ name: '없음', value: 1 }]).map((e, i) => <Cell key={i} fill={R.donut.length ? DONUT_PAL[i % DONUT_PAL.length] : '#E5E9F0'} />)}
                      </Pie>
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <div className="text-[10px] text-stone-400 font-semibold">주요</div>
                    <div className="text-[12px] font-extrabold" style={{ color: NAVY }}>유형</div>
                  </div>
                </div>
                <div className="flex-1 min-w-0 space-y-1">
                  {R.donut.map((d, i) => (
                    <div key={d.name} className="flex items-center gap-1.5 text-[11px]">
                      <span className="inline-block w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: DONUT_PAL[i % DONUT_PAL.length] }} />
                      <span className="truncate text-stone-600 flex-1">{d.name}</span>
                      <span className="font-bold tabular-nums" style={{ color: NAVY }}>{donutTotal ? (d.value / donutTotal * 100).toFixed(1) : '0.0'}%</span>
                    </div>
                  ))}
                  {!R.donut.length && <div className="text-[11px] text-stone-400">데이터 없음</div>}
                </div>
              </div>
            </Panel>
          </div>

          {/* 하단: TOP3 ×2 + 포인트 */}
          <div className="grid grid-cols-3 gap-4">
            <Panel title="재해유형 TOP 3">
              <RankList rows={R.typeTop3} />
            </Panel>
            <Panel title="영업부별 재해 TOP 3">
              <RankList rows={R.deptTop3} />
            </Panel>
            <Panel title={bumKey === 'all' ? '다음달 중점관리 포인트' : '핵심 포인트'}>
              <ul className="space-y-2">
                {bullets.map((b, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12px] leading-snug" style={{ color: INK }}>
                    <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: RED }} />
                    <span style={{ wordBreak: 'keep-all' }}>{b[1]}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          </div>

          <div className="text-[9px] mt-3 text-right" style={{ color: '#9AA3B5' }}>※ 사고 원본 시트(라이브) 자동 집계 · 개인정보 마스킹 · ㈜아성다이소 안전보건팀</div>
        </div>
      </div>
    </div>
  ), document.body);
}

function RankList({ rows }) {
  const max = Math.max(1, ...rows.map(r => r[1]));
  return (
    <div className="space-y-2.5">
      {rows.map((r, i) => (
        <div key={r[0]} className="flex items-center gap-2.5">
          <span className="flex items-center justify-center rounded-full text-white text-[11px] font-extrabold flex-shrink-0" style={{ width: 22, height: 22, background: RANK[i] }}>{i + 1}</span>
          <span className="text-[12px] font-semibold text-stone-700 w-[104px] truncate flex-shrink-0">{r[0]}</span>
          <div className="flex-1 h-2.5 rounded-full bg-stone-100 overflow-hidden">
            <div className="h-full rounded-full" style={{ width: `${(r[1] / max) * 100}%`, background: RANK[i] }} />
          </div>
          <span className="text-[12px] font-extrabold tabular-nums flex-shrink-0" style={{ color: NAVY }}>{r[1]}건</span>
        </div>
      ))}
      {!rows.length && <div className="text-[11px] text-stone-400">데이터 없음</div>}
    </div>
  );
}

export { ReportModal };

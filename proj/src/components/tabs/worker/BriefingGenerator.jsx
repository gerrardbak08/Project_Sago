import { useMemo, useState } from 'react';
import { FileText, Users, UserCog, Store as StoreIcon, Bell, Building2, Calendar, ArrowUp, ArrowDown, Minus, Copy } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Card } from '../../shared/Card.jsx';
import { Odometer, SegmentedToggle } from '../../shared/MotionBits.jsx';
import CUSTOMER_DATA from '../../../data/customerData.js';
import PARJANG_BY_STORE from '../../../data/parjangByStore.js';
import { toast } from '../../../utils/uifx.js';

// 역할별(부서장/팀장/파트장) 월간 브리핑 — 관할 매장/지역의 근로자·고객 사고 + 알람 발송 요약.
// 근로자 사고 = 월별·스코프 실데이터(D.accidents). 고객 = 스코프 집계(customerData). 알람 = 샘플(백엔드 연결 시 실데이터).
const ROLES = [
  { id: 'dept', label: '부서장', key: 'dept', Icon: Building2, unit: '부서' },
  { id: 'team', label: '팀장', key: 'team', Icon: Users, unit: '팀' },
  { id: 'parjang', label: '파트장', key: 'parjang', Icon: UserCog, unit: '파트장' },
];
const ALARM_TYPES = ['고위험 사고예방', '기상 악화 경보', '반복사고 주의', '고객안전 주의', '중처법 리스크'];
const fnv = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };
const prevYm = (y, m) => (m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 });
const topN = (arr, keyFn, n = 5) => {
  const c = new Map();
  for (const x of arr) { const k = keyFn(x); if (!k) continue; c.set(k, (c.get(k) || 0) + 1); }
  return [...c.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);
};

export default function BriefingGenerator({ D }) {
  const accidents = D?.accidents || [];
  const stores = D?.stores || [];

  // 관할 대상 목록
  const options = useMemo(() => ({
    dept: [...new Set(accidents.map((a) => a.dept).filter(Boolean))].sort(),
    team: [...new Set(accidents.map((a) => a.team).filter(Boolean))].sort(),
    parjang: [...new Set(Object.values(PARJANG_BY_STORE).filter(Boolean))].sort(),
  }), [accidents]);

  const months = useMemo(() => {
    const set = new Set(accidents.map((a) => `${a.year}-${a.month}`));
    return [...set].map((s) => { const [y, m] = s.split('-').map(Number); return { y, m }; })
      .sort((a, b) => b.y - a.y || b.m - a.m);
  }, [accidents]);

  const [role, setRole] = useState('dept');
  const [target, setTarget] = useState('');
  const [monthKey, setMonthKey] = useState(months[0] ? `${months[0].y}-${months[0].m}` : '');

  const roleDef = ROLES.find((r) => r.id === role);
  const targetList = options[role] || [];
  const tgt = target || targetList[0] || '';
  const [selY, selM] = (monthKey || '').split('-').map(Number);
  const prev = selY ? prevYm(selY, selM) : null;

  // 스코프 매칭 함수
  const inScope = (a) => role === 'dept' ? a.dept === tgt : role === 'team' ? a.team === tgt : a.parjang === tgt;
  const storeInScope = (s) => role === 'dept' ? s.dept === tgt : role === 'team' ? s.team === tgt : PARJANG_BY_STORE[s.store] === tgt;

  // ── 근로자 사고 (월별·스코프 실데이터) ──
  const worker = useMemo(() => {
    const scoped = accidents.filter(inScope);
    const cur = scoped.filter((a) => a.year === selY && a.month === selM);
    const pre = prev ? scoped.filter((a) => a.year === prev.y && a.month === prev.m) : [];
    const severe = cur.filter((a) => (a.loss_days || 0) >= 91).length;
    return {
      cur, pre, delta: cur.length - pre.length,
      topStores: topN(cur, (a) => a.store),
      topTypes: topN(cur, (a) => a.type, 4),
      topCauses: topN(cur, (a) => a.cause, 4),
      topLocs: topN(cur.filter((a) => a.locMatched), (a) => a.locLabel, 4),
      severe, ytd: scoped.filter((a) => a.year === selY).length,
    };
  }, [accidents, role, tgt, monthKey]);

  // ── 고객 사고 (스코프 집계) ──
  const customer = useMemo(() => {
    const wl = CUSTOMER_DATA?.store_watchlist || [];
    const scoped = wl.filter((r) => role === 'dept' ? r.dept === tgt : role === 'team' ? r.team === tgt : PARJANG_BY_STORE[r.store] === tgt);
    const total = scoped.reduce((s, r) => s + (r.total || 0), 0);
    return { total, topStores: [...scoped].sort((a, b) => b.total - a.total).slice(0, 5) };
  }, [role, tgt]);

  // ── 알람 발송 (샘플) ──
  const alarms = useMemo(() => {
    const scoped = stores.filter(storeInScope);
    const rows = scoped.map((s) => {
      const h = fnv(s.store + '|alarm|' + monthKey);
      const n = h % 5; // 0~4건
      const types = {};
      for (let i = 0; i < n; i++) types[ALARM_TYPES[(h >> (i * 3)) % ALARM_TYPES.length]] = (types[ALARM_TYPES[(h >> (i * 3)) % ALARM_TYPES.length]] || 0) + 1;
      return { store: s.store, n, types };
    }).filter((r) => r.n > 0).sort((a, b) => b.n - a.n);
    const total = rows.reduce((s, r) => s + r.n, 0);
    const byType = {};
    for (const r of rows) for (const [t, c] of Object.entries(r.types)) byType[t] = (byType[t] || 0) + c;
    return { rows, total, byType: Object.entries(byType).sort((a, b) => b[1] - a[1]) };
  }, [stores, role, tgt, monthKey]);

  const deltaEl = (d) => d === 0
    ? <span className="text-stone-400 inline-flex items-center gap-0.5"><Minus size={12} />동일</span>
    : d > 0 ? <span className="text-[#D70011] inline-flex items-center gap-0.5"><ArrowUp size={12} />{d}건</span>
      : <span className="text-emerald-700 inline-flex items-center gap-0.5"><ArrowDown size={12} />{Math.abs(d)}건</span>;

  // 서술 요약(규칙 기반)
  const narrative = useMemo(() => {
    if (!tgt || !selY) return '';
    const period = `${selY}년 ${selM}월`;
    const w = worker;
    const trend = w.delta > 0 ? `전월 대비 ${w.delta}건 증가` : w.delta < 0 ? `전월 대비 ${Math.abs(w.delta)}건 감소` : '전월과 동일';
    const topStore = w.topStores[0] ? `${w.topStores[0][0]}(${w.topStores[0][1]}건)` : '없음';
    const topType = w.topTypes[0] ? w.topTypes[0][0] : '없음';
    const topLoc = w.topLocs?.[0] ? `${w.topLocs[0][0]}(${w.topLocs[0][1]}건)` : null;
    return `${period} 기준 ${roleDef.label} 관할 ‘${tgt}’의 근로자 산업재해는 ${w.cur.length}건으로 ${trend}했습니다. `
      + (w.cur.length ? `가장 많은 매장은 ${topStore}, 주요 재해유형은 ${topType}입니다. ` : '')
      + (topLoc ? `발생 장소는 ${topLoc} 중심입니다 — 점검 동선에 반영하세요. ` : '')
      + (w.severe ? `이 중 중상(근로손실 91일+) ${w.severe}건이 포함됩니다. ` : '')
      + `고객 안전사고는 관할 누적 ${customer.total}건, 발송된 안전 알람은 ${alarms.total}건입니다.`;
  }, [worker, customer, alarms, tgt, monthKey]);

  const copyBrief = () => { try { navigator.clipboard?.writeText(narrative); toast('브리핑 요약 복사됨', 'ok'); } catch { toast('복사 실패', 'err'); } };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#071E4A' }}>
          <FileText size={18} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div className="text-lg font-black text-[#071E4A] tracking-tight">월간 브리핑</div>
          <div className="text-xs text-stone-500 mt-0.5">역할·관할별 근로자·고객 사고 + 안전 알람 월간 요약 (발송 전 미리보기)</div>
        </div>
      </div>

      {/* 컨트롤 */}
      <Card className="!p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">역할</div>
            <SegmentedToggle size="sm" value={role} onChange={(v) => { setRole(v); setTarget(''); }} accent="#071E4A"
              options={ROLES.map((r) => ({ value: r.id, label: r.label }))} />
          </div>
          <div className="min-w-[180px]">
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">관할 {roleDef.unit}</div>
            <select value={tgt} onChange={(e) => setTarget(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-[13px] bg-white cursor-pointer outline-none focus:border-[#1D4ED8]">
              {targetList.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="min-w-[120px]">
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">기간</div>
            <select value={monthKey} onChange={(e) => setMonthKey(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-[13px] bg-white cursor-pointer outline-none focus:border-[#1D4ED8]">
              {months.map((m) => <option key={`${m.y}-${m.m}`} value={`${m.y}-${m.m}`}>{m.y}년 {m.m}월</option>)}
            </select>
          </div>
          <button onClick={copyBrief} className="h-9 px-3 rounded-lg border border-stone-200 text-stone-600 text-[13px] font-semibold hover:bg-stone-50 cursor-pointer flex items-center gap-1.5 ml-auto">
            <Copy size={14} /> 요약 복사
          </button>
        </div>
      </Card>

      {/* 브리핑 서술 */}
      <div className="rounded-2xl border border-[#071E4A]/12 bg-[#F7F9FC] px-5 py-4">
        <div className="text-[11px] font-bold tracking-wide text-[#003B8F] mb-1.5">{roleDef.label} · {tgt} · {selY}년 {selM}월</div>
        <p className="text-[14px] text-stone-700 leading-relaxed" style={{ wordBreak: 'keep-all' }}>{narrative}</p>
      </div>

      {/* 근로자 사고 */}
      <Card title="근로자 산업재해" titleIcon={UserCog} sub={`${tgt} · ${selY}년 ${selM}월 (실데이터)`}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Kpi l="이번 달 사고" v={worker.cur.length} unit="건" color="#071E4A" sub={<span>전월 대비 {deltaEl(worker.delta)}</span>} />
          <Kpi l="연간 누계" v={worker.ytd} unit="건" color="#1D4ED8" />
          <Kpi l="중상(91일+)" v={worker.severe} unit="건" color="#D70011" />
          <Kpi l="사고 매장" v={worker.topStores.length} unit="개" color="#B45309" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
          <MiniList title="상위 발생 매장" rows={worker.topStores} unit="건" />
          <MiniList title="주요 재해유형" rows={worker.topTypes} unit="건" />
          <MiniList title="주요 원인" rows={worker.topCauses} unit="건" />
          <MiniList title="주요 발생 장소" rows={worker.topLocs} unit="건" />
        </div>
        {worker.cur.length > 0 && (
          <div className="mt-3 pt-3 border-t border-stone-100">
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">이번 달 상세</div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
              {worker.cur.slice(0, 20).map((a, i) => (
                <div key={i} className="flex items-center gap-2 text-[12px] text-stone-600 py-1 border-b border-stone-50">
                  <span className="text-stone-400 tabular-nums w-12">{a.year}.{String(a.month).padStart(2, '0')}</span>
                  <span className="font-semibold text-stone-800 truncate flex-1">{a.store}</span>
                  <span className="text-stone-500">{a.type}</span>
                  {(a.loss_days || 0) >= 91 && <span className="text-[10px] font-bold text-[#D70011] bg-red-50 px-1.5 py-0.5 rounded">중상</span>}
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>

      {/* 고객 사고 */}
      <Card title="고객 안전사고" titleIcon={Users} sub={`${tgt} · 관할 누적`} right={<span className="text-[10px] text-stone-400">월별 스코프 세분은 원자료 연동 시</span>}>
        <div className="flex items-baseline gap-1 mb-3">
          <span className="text-[26px] font-black tabular-nums" style={{ color: '#0891B2' }}><Odometer value={customer.total} /></span>
          <span className="text-xs font-semibold text-stone-400">건 (누적)</span>
        </div>
        {customer.topStores.length > 0
          ? <MiniList title="상위 발생 매장" rows={customer.topStores.map((r) => [r.store, r.total])} unit="건" />
          : <div className="text-sm text-stone-400 py-3">관할 내 고객 사고 집계 없음.</div>}
      </Card>

      {/* 알람 발송 */}
      <Card title="안전 알람 발송" titleIcon={Bell} sub={`${tgt} · ${selY}년 ${selM}월`}
        right={<span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 text-amber-700">샘플 · 백엔드 연결 예정</span>}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Kpi l="총 발송" v={alarms.total} unit="건" color="#071E4A" />
          <Kpi l="수신 매장" v={alarms.rows.length} unit="개" color="#1D4ED8" />
          {alarms.byType.slice(0, 2).map(([t, c]) => <Kpi key={t} l={t} v={c} unit="건" color="#B45309" />)}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">매장별 발송</div>
            <div className="space-y-1 max-h-[200px] overflow-y-auto pr-1">
              {alarms.rows.slice(0, 15).map((r) => (
                <div key={r.store} className="flex items-center gap-2 text-[12px] py-1 border-b border-stone-50">
                  <span className="font-semibold text-stone-800 truncate flex-1">{r.store}</span>
                  <span className="text-stone-500 truncate max-w-[45%]">{Object.keys(r.types).join(', ')}</span>
                  <span className="font-bold tabular-nums text-[#071E4A] w-8 text-right">{r.n}</span>
                </div>
              ))}
              {alarms.rows.length === 0 && <div className="text-sm text-stone-400 py-3">발송 알람 없음.</div>}
            </div>
          </div>
          <div>
            <div className="text-[11px] font-bold text-stone-500 mb-1.5">유형 분포</div>
            <div style={{ height: 180 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={alarms.byType.map(([name, v]) => ({ name, v }))} layout="vertical" margin={{ left: 10, right: 16 }}>
                  <XAxis type="number" hide /><YAxis type="category" dataKey="name" width={90} tick={{ fontSize: 10, fill: '#78716C' }} />
                  <Tooltip />
                  <Bar dataKey="v" radius={[0, 4, 4, 0]}>
                    {alarms.byType.map((_, i) => <Cell key={i} fill={['#071E4A', '#1D4ED8', '#B45309', '#D70011', '#0891B2'][i % 5]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}

function Kpi({ l, v, unit, color, sub }) {
  return (
    <div className="rounded-xl border border-stone-100 bg-white p-3">
      <div className="text-[10.5px] text-stone-500 font-medium truncate">{l}</div>
      <div className="mt-1 flex items-baseline gap-1">
        <span className="text-[22px] font-black tabular-nums leading-none" style={{ color }}><Odometer value={v} /></span>
        <span className="text-[11px] font-semibold text-stone-400">{unit}</span>
      </div>
      {sub && <div className="text-[10.5px] text-stone-400 mt-1">{sub}</div>}
    </div>
  );
}

function MiniList({ title, rows, unit }) {
  const max = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div>
      <div className="text-[11px] font-bold text-stone-500 mb-1.5">{title}</div>
      {rows.length === 0 ? <div className="text-xs text-stone-400 py-2">없음</div> : (
        <div className="space-y-1.5">
          {rows.map(([name, n]) => (
            <div key={name} className="flex items-center gap-2">
              <span className="text-[12px] text-stone-700 truncate flex-1">{name}</span>
              <div className="w-16 h-1.5 rounded-full bg-stone-100 overflow-hidden"><div className="h-full rounded-full bg-[#003B8F]" style={{ width: `${(n / max) * 100}%` }} /></div>
              <span className="text-[12px] font-bold tabular-nums text-stone-800 w-7 text-right">{n}{unit}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

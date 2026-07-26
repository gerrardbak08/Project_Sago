import { useMemo, useState, useEffect } from 'react';
import { ClipboardList, Siren, ScanSearch, ChevronRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { Card } from '../../shared/Card.jsx';
import { Odometer } from '../../shared/MotionBits.jsx';
import { PROGRAMS, STATUS_META, STATUS_ORDER } from '../../../constants/compliancePrograms.js';
import { listRecords, fetchRecords, latestFrom, COMPLIANCE_EVENT } from '../../../utils/complianceSource.js';
import { buildStoreRows, aggregate, rollupBy, rateColor } from '../../../utils/complianceRollup.js';

// 안전보건 활동 종합 — 위험성평가·비상대응훈련·TBM 실시현황을 한 화면에서. 문제 지점으로 바로 드릴.
const ORDER = ['risk', 'drill', 'tbm'];
const ICONS = { risk: ScanSearch, drill: Siren, tbm: ClipboardList };
const TAB_OF = { risk: 'riskassess', drill: 'drill', tbm: 'tbm' };

export default function ComplianceOverview({ stores = [], setTab }) {
  const [recs, setRecs] = useState(() => ({ risk: listRecords('risk'), drill: listRecords('drill'), tbm: listRecords('tbm') }));

  useEffect(() => {
    let alive = true;
    const load = () => Promise.all(ORDER.map((p) => fetchRecords(p).then((r) => [p, r]).catch(() => [p, []])))
      .then((pairs) => { if (alive) setRecs(Object.fromEntries(pairs)); });
    load();
    window.addEventListener(COMPLIANCE_EVENT, load);
    window.addEventListener('storage', load);
    return () => { alive = false; window.removeEventListener(COMPLIANCE_EVENT, load); window.removeEventListener('storage', load); };
  }, []);

  const byProgram = useMemo(() => ORDER.map((p) => {
    const prog = PROGRAMS[p];
    const rows = buildStoreRows(p, stores, latestFrom(recs[p]), prog.cadenceDays);
    return { p, prog, rows, agg: aggregate(rows), Icon: ICONS[p] };
  }), [stores, recs]);

  const totalStores = byProgram[0]?.rows.length || 0;
  const avgRate = Math.round(byProgram.reduce((a, b) => a + b.agg.rate, 0) / (byProgram.length || 1));
  const totalAttention = byProgram.reduce((a, b) => a + b.agg.attention, 0);

  // 부문 × 프로그램 실시율 매트릭스
  const bums = useMemo(() => [...new Set((byProgram[0]?.rows || []).map((r) => r.bum))], [byProgram]);
  const bumMatrix = useMemo(() => bums.map((bum) => ({
    bum,
    stores: (byProgram[0]?.rows || []).filter((r) => r.bum === bum).length,
    cells: byProgram.map((bp) => {
      const g = rollupBy(bp.rows.filter((r) => r.bum === bum), 'bum')[0];
      return g ? g.rate : 0;
    }),
  })), [bums, byProgram]);

  // 긴급 매장 — 여러 활동에서 미실시/기한초과인 매장 우선
  const urgent = useMemo(() => {
    const byStore = new Map();
    for (const bp of byProgram) for (const r of bp.rows) {
      if (r.status !== 'overdue' && r.status !== 'never') continue;
      if (!byStore.has(r.store)) byStore.set(r.store, { store: r.store, bum: r.bum, dept: r.dept, team: r.team, progs: [] });
      byStore.get(r.store).progs.push(bp.prog.short);
    }
    return [...byStore.values()].sort((a, b) => b.progs.length - a.progs.length);
  }, [byProgram]);

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="flex items-center gap-2.5">
        <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: '#071E4A' }}>
          <ShieldCheck size={18} color="#fff" strokeWidth={2} />
        </div>
        <div>
          <div className="text-lg font-black text-[#071E4A] tracking-tight">안전보건 활동 종합</div>
          <div className="text-xs text-stone-500 mt-0.5">위험성평가 · 비상대응훈련 · TBM 매장별 실시현황 한눈에</div>
        </div>
      </div>

      {/* 긴급 알림 스트립 */}
      {urgent.length > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 flex items-center gap-2">
          <AlertTriangle size={15} className="flex-shrink-0 text-[#D70011]" />
          <span className="flex-1 text-[12px] text-[#B91C1C]"><b>조치 필요 {urgent.length}개 매장</b> — 하나 이상의 활동에서 기한초과·미실시입니다. 아래 목록에서 확인하세요.</span>
        </div>
      )}

      {/* 상단 요약 */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { l: '대상 매장', v: totalStores, unit: '개', color: '#071E4A' },
          { l: '평균 실시율', v: avgRate, unit: '%', color: rateColor(avgRate) },
          { l: '주의 필요(누계)', v: totalAttention, unit: '건', color: '#D70011' },
        ].map((k, i) => (
          <Card key={k.l} delay={i * 60} className="!p-4">
            <div className="text-[11px] text-stone-500 font-medium truncate">{k.l}</div>
            <div className="mt-1.5 flex items-baseline gap-1">
              <span className="text-[26px] font-black tabular-nums leading-none" style={{ color: k.color }}><Odometer value={k.v} /></span>
              <span className="text-xs font-semibold text-stone-400">{k.unit}</span>
            </div>
          </Card>
        ))}
      </div>

      {/* 프로그램별 카드 (클릭 → 해당 모듈) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        {byProgram.map(({ p, prog, agg, Icon }, i) => (
          <Card key={p} delay={i * 70} className="!p-4">
            <button onClick={() => setTab?.(TAB_OF[p])} className="w-full text-left cursor-pointer group">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: prog.accent }}><Icon size={14} color="#fff" /></div>
                  <span className="text-[14px] font-bold text-[#071E4A]">{prog.label}</span>
                </div>
                <span className="text-[11px] text-stone-400 group-hover:text-[#003B8F] flex items-center gap-0.5">자세히 <ChevronRight size={12} /></span>
              </div>
              <div className="mt-3 flex items-end justify-between">
                <div>
                  <div className="text-[10px] text-stone-400 font-medium">{prog.kpi.rate}</div>
                  <div className="text-[30px] font-black tabular-nums leading-none" style={{ color: rateColor(agg.rate) }}>{agg.rate}<span className="text-sm">%</span></div>
                </div>
                <div className="text-right text-[11px]">
                  <div className="text-stone-500">정상 <b className="tabular-nums text-emerald-700">{agg.ok}</b></div>
                  <div className="text-stone-500">주의 <b className="tabular-nums text-[#D70011]">{agg.attention}</b></div>
                </div>
              </div>
              <div className="flex h-2 rounded-full overflow-hidden mt-2.5 bg-stone-100">
                {STATUS_ORDER.map((k) => agg[k] > 0 && <div key={k} style={{ width: `${(agg[k] / (agg.total || 1)) * 100}%`, background: STATUS_META[k].color }} />)}
              </div>
            </button>
          </Card>
        ))}
      </div>

      {/* 부문 × 활동 매트릭스 */}
      <Card title="부문별 종합 실시율" titleIcon={ShieldCheck} sub="부문마다 어느 활동이 취약한지">
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead>
              <tr className="text-stone-400 text-[11px]">
                <th className="text-left font-semibold pb-2 pr-3">부문</th>
                {byProgram.map((bp) => <th key={bp.p} className="text-center font-semibold pb-2 px-2 whitespace-nowrap">{bp.prog.short}</th>)}
              </tr>
            </thead>
            <tbody>
              {bumMatrix.map((row) => (
                <tr key={row.bum} className="border-t border-stone-100">
                  <td className="py-2.5 pr-3">
                    <div className="font-bold text-stone-800">{row.bum}</div>
                    <div className="text-[10px] text-stone-400">매장 {row.stores}</div>
                  </td>
                  {row.cells.map((rate, i) => (
                    <td key={i} className="py-2.5 px-2 text-center">
                      <span className="inline-block min-w-[46px] px-2 py-1 rounded-md font-black tabular-nums" style={{ background: `${rateColor(rate)}14`, color: rateColor(rate) }}>{rate}%</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* 긴급 매장 */}
      <Card title="긴급 조치 필요 매장" titleIcon={AlertTriangle} sub="미실시·기한초과가 많은 매장 우선">
        {urgent.length === 0 ? (
          <div className="text-center text-sm text-stone-400 py-6">긴급 조치가 필요한 매장이 없습니다.</div>
        ) : (
          <div className="space-y-1.5">
            {urgent.slice(0, 12).map((u) => (
              <div key={u.store} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white" style={{ borderColor: '#F0EEEC' }}>
                <div className="flex-1 min-w-0">
                  <div className="text-[13px] font-bold text-stone-800 truncate">{u.store}</div>
                  <div className="text-[11px] text-stone-400 truncate">{u.bum} · {u.dept} · {u.team}</div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  {u.progs.map((pl) => <span key={pl} className="text-[10px] font-bold px-2 py-1 rounded-full" style={{ background: '#FEF2F2', color: '#D70011' }}>{pl}</span>)}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

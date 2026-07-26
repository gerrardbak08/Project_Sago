import { useMemo, useState, useEffect } from 'react';
import { ClipboardList, Siren, ScanSearch, Info, Check, Plus, ChevronRight, ChevronLeft, Building2, Store as StoreIcon, Clock, X, AlertTriangle } from 'lucide-react';
import { Card } from '../../shared/Card.jsx';
import { Odometer, SegmentedToggle } from '../../shared/MotionBits.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { PROGRAMS, STATUS_META, STATUS_ORDER } from '../../../constants/compliancePrograms.js';
import { listRecords, fetchRecords, latestFrom, COMPLIANCE_EVENT } from '../../../utils/complianceSource.js';
import { buildStoreRows, aggregate, rollupBy, rateColor } from '../../../utils/complianceRollup.js';
import PARJANG_BY_STORE from '../../../data/parjangByStore.js';
import { ripple } from '../../../utils/uifx.js';
import ComplianceInputForm from './ComplianceInputForm.jsx';

// 공통 안전보건 활동 현황 모니터 — 부문 → 부서 → 팀 → 매장 계층 드릴다운.
// program(risk|drill|tbm)별 설정만 다르고, "매장별 실시현황을 조직 계층으로 집계·드릴다운"이 핵심.
// 지금은 샘플(미연동). records prop을 주면 실기록으로 롤업(TBM 실데이터 연동 지점).
const ICONS = { risk: ScanSearch, drill: Siren, tbm: ClipboardList };
const LEVELS = ['bum', 'dept', 'team'];           // 드릴 순서. 3단계 넘어가면 매장(store) 목록.
const LEVEL_LABEL = { bum: '부문', dept: '부서', team: '팀', store: '매장' };

function fmtDate(daysAgo) {
  const d = new Date(); d.setDate(d.getDate() - daysAgo);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
}

export default function ComplianceMonitor({ program = 'tbm', stores = [] }) {
  const prog = PROGRAMS[program] || PROGRAMS.tbm;
  const Icon = ICONS[program] || ClipboardList;
  const [path, setPath] = useState([]); // [] | [bum] | [bum,dept] | [bum,dept,team]
  const [records, setRecords] = useState(() => listRecords(program));
  const [showInput, setShowInput] = useState(false);
  const [showLog, setShowLog] = useState(false);
  const [view, setView] = useState('tree');   // 'tree'(계층) | 'attention'(주의 매장만)

  // 실시 기록 로드 + 입력 이벤트/다른 탭 시 재읽기 (local 즉시 · apps-script 서버 GET)
  useEffect(() => {
    let alive = true;
    const load = () => fetchRecords(program).then((r) => { if (alive) setRecords(r); }).catch(() => {});
    load();
    window.addEventListener(COMPLIANCE_EVENT, load);
    window.addEventListener('storage', load);
    return () => { alive = false; window.removeEventListener(COMPLIANCE_EVENT, load); window.removeEventListener('storage', load); };
  }, [program]);

  const real = useMemo(() => latestFrom(records), [records]);
  const realCount = real.size;

  // ── 매장별 실시현황 — 실입력 기록이 있으면 실데이터, 없으면 샘플(공용 헬퍼) ──
  const rows = useMemo(() => buildStoreRows(program, stores, real, prog.cadenceDays), [stores, program, prog.cadenceDays, real]);

  // 전체 KPI (공용 집계 — 종합 뷰와 동일 수치)
  const agg = aggregate(rows);
  const total = agg.total || 1;
  const okN = agg.ok;
  const attentionN = agg.attention;
  const rate = agg.rate;

  // 현재 경로로 필터 → 다음 레벨로 집계 (또는 매장 목록)
  const depth = path.length;
  const atStore = depth >= LEVELS.length;
  const filtered = rows.filter((r) =>
    (depth < 1 || r.bum === path[0]) && (depth < 2 || r.dept === path[1]) && (depth < 3 || r.team === path[2]));

  const levelKey = atStore ? 'store' : LEVELS[depth];
  const groups = useMemo(() => {
    if (atStore) return null;
    return rollupBy(filtered, levelKey)
      .sort((a, b) => a.rate - b.rate || b.attention - a.attention); // 실시율 낮은(문제) 곳 먼저
  }, [filtered, levelKey, atStore]);

  const storeRows = atStore
    ? [...filtered].sort((a, b) => (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9))
    : [];

  const crumbs = ['전체', ...path];
  const nextLabel = LEVEL_LABEL[levelKey];

  // 주의 매장(기한초과·미실시) 플랫 목록
  const attentionRows = filtered.filter((r) => r.status === 'overdue' || r.status === 'never')
    .sort((a, b) => (b.daysSince ?? 1e9) - (a.daysSince ?? 1e9));

  // CSV 내보내기 — 현재 보기(계층=스코프 전체, 주의=조치대상만) 반영
  const exportRows = (view === 'attention' ? attentionRows : filtered).map((r) => ({
    부문: r.bum, 부서: r.dept, 팀: r.team, 매장: r.store,
    파트장: PARJANG_BY_STORE[r.store] || '',
    상태: STATUS_META[r.status].label,
    최근실시일: r.daysSince == null ? '기록없음' : fmtDate(r.daysSince),
    경과일: r.daysSince ?? '',
    구분: r.real ? '실입력' : '샘플',
  }));

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0" style={{ background: prog.accent }}>
            <Icon size={18} color="#fff" strokeWidth={2} />
          </div>
          <div>
            <div className="text-lg font-black text-[#071E4A] tracking-tight flex items-center gap-2">
              {prog.label}
              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: '#EEF2FF', color: prog.accent }}>{prog.period}</span>
            </div>
            <div className="text-xs text-stone-500 mt-0.5">{prog.desc}</div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <button onClick={() => setShowLog(true)}
            className="h-9 px-3 rounded-xl border border-stone-200 text-stone-600 text-[13px] font-semibold hover:bg-stone-50 cursor-pointer flex items-center gap-1.5 transition">
            <Clock size={14} /> 입력 이력{records.length > 0 && <span className="tabular-nums text-stone-400">{records.length}</span>}
          </button>
          <ExportBtn rows={exportRows} filename={`${prog.label}_${view === 'attention' ? '주의매장' : '실시현황'}.csv`} />
          <button onClick={() => setShowInput(true)} onMouseDown={ripple}
            className="relative overflow-hidden h-9 px-3.5 rounded-xl text-white text-[13px] font-bold cursor-pointer flex items-center gap-1.5 transition active:opacity-80"
            style={{ background: prog.accent }}>
            <Plus size={15} strokeWidth={2.5} /> 실시 기록 입력
          </button>
        </div>
      </div>

      {/* 데이터 상태 배너 */}
      {realCount > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3.5 py-2.5 text-[12px] text-emerald-800 flex items-start gap-2" style={{ wordBreak: 'keep-all' }}>
          <Check size={14} className="flex-shrink-0 mt-0.5" />
          <span><b>실입력 {realCount}개 매장 반영 중</b> — 입력된 매장은 실제 기록, 나머지는 샘플입니다. (localStorage · 브라우저 저장)</span>
        </div>
      ) : (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-[12px] text-amber-800 flex items-start gap-2" style={{ wordBreak: 'keep-all' }}>
          <Info size={14} className="flex-shrink-0 mt-0.5" />
          <span><b>샘플 데이터</b> — 우측 <b>실시 기록 입력</b>으로 매장 현황을 넣으면 계층 모니터에 즉시 반영됩니다.</span>
        </div>
      )}

      {/* 전체 KPI */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { l: '전체 매장', v: total, unit: '개', color: '#071E4A' },
          { l: prog.kpi.rate, v: rate, unit: '%', color: rateColor(rate) },
          { l: '정상', v: okN, unit: '개', color: '#047857' },
          { l: prog.kpi.overdue, v: attentionN, unit: '개', color: '#D70011' },
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

      {/* 조치 필요 알림 — 기한초과·미실시 매장이 있으면 주의 뷰로 바로 점프 */}
      {attentionN > 0 && view !== 'attention' && (
        <button onClick={() => { setView('attention'); setPath([]); }}
          className="w-full rounded-xl border border-red-200 bg-red-50 px-3.5 py-2.5 flex items-center gap-2 hover:bg-red-100 transition cursor-pointer text-left">
          <AlertTriangle size={15} className="flex-shrink-0 text-[#D70011]" />
          <span className="flex-1 text-[12px] text-[#B91C1C]"><b>조치 필요 {attentionN}개 매장</b> — 기한초과·미실시. 눌러서 해당 매장만 보기.</span>
          <ChevronRight size={15} className="text-[#D70011] flex-shrink-0" />
        </button>
      )}

      {/* 계층 드릴다운 */}
      <Card title="조직별 실시현황" titleIcon={depth === 0 ? Building2 : Icon}
        sub={view === 'attention' ? `주의 매장 ${attentionRows.length}개 (오래된 순)` : atStore ? `${path.join(' · ')} — 매장 ${storeRows.length}개` : `${nextLabel}별 집계 (실시율 낮은 순)`}
        right={<SegmentedToggle size="xs" value={view} onChange={setView} accent={prog.accent}
          options={[{ value: 'tree', label: '계층' }, { value: 'attention', label: `주의 ${attentionRows.length}` }]} />}>
        {/* 브레드크럼 */}
        <div className="flex items-center flex-wrap gap-1 mb-3 text-[12px]">
          {crumbs.map((c, i) => (
            <span key={i} className="flex items-center gap-1">
              {i > 0 && <ChevronRight size={12} className="text-stone-300" />}
              <button
                onClick={() => setPath(path.slice(0, i))}
                className={`px-2 py-0.5 rounded-md font-semibold transition ${i === crumbs.length - 1 ? 'text-[#071E4A] bg-stone-100' : 'text-stone-500 hover:text-[#003B8F] hover:bg-stone-50 cursor-pointer'}`}
              >{c}</button>
            </span>
          ))}
          {depth > 0 && (
            <button onClick={() => setPath(path.slice(0, -1))} className="ml-1 inline-flex items-center gap-0.5 text-[11px] text-stone-400 hover:text-stone-600 cursor-pointer">
              <ChevronLeft size={12} /> 상위
            </button>
          )}
        </div>

        {/* 상태 범례 */}
        <div className="flex flex-wrap gap-x-3 gap-y-1 mb-3">
          {STATUS_ORDER.map((k) => (
            <span key={k} className="inline-flex items-center gap-1 text-[10.5px] text-stone-500">
              <span className="w-2 h-2 rounded-full" style={{ background: STATUS_META[k].color }} />
              {STATUS_META[k].label} <b className="text-stone-700 tabular-nums">{rows.filter(r => r.status === k && (depth < 1 || r.bum === path[0]) && (depth < 2 || r.dept === path[1]) && (depth < 3 || r.team === path[2])).length}</b>
            </span>
          ))}
        </div>

        {/* 주의 매장만 — 스코프 내 기한초과·미실시 플랫 목록 */}
        {view === 'attention' && (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {attentionRows.map((r) => {
              const m = STATUS_META[r.status];
              return (
                <div key={r.store} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white transition hover:shadow-sm"
                  style={{ borderColor: '#F0EEEC' }}>
                  <StoreIcon size={14} className="text-stone-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-stone-800 truncate">{r.store}</div>
                    <div className="text-[11px] text-stone-400 truncate">{r.dept} · {r.team}{PARJANG_BY_STORE[r.store] ? ` · 파트장 ${PARJANG_BY_STORE[r.store]}` : ''}</div>
                  </div>
                  <div className="text-[11px] text-stone-500 tabular-nums flex-shrink-0">{r.daysSince == null ? '기록 없음' : `${r.daysSince}일 경과`}</div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: m.soft, color: m.color }}>{m.label}</span>
                </div>
              );
            })}
            {attentionRows.length === 0 && <div className="text-center text-sm text-stone-400 py-8">주의 매장이 없습니다. 👍</div>}
          </div>
        )}

        {/* 집계 레벨 (부문/부서/팀) — 클릭해 드릴다운 */}
        {view === 'tree' && !atStore && (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {groups.map((g) => (
              <button key={g.key} onClick={() => setPath([...path, g.key])}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white text-left transition hover:shadow-sm hover:border-stone-300 cursor-pointer"
                style={{ borderColor: '#F0EEEC' }}>
                <div className="w-28 sm:w-40 min-w-0 flex-shrink-0">
                  <div className="text-[13px] font-bold text-stone-800 truncate">{g.key}</div>
                  <div className="text-[10.5px] text-stone-400">매장 {g.total}개{g.attention > 0 && <span className="text-[#D70011] font-semibold"> · 주의 {g.attention}</span>}</div>
                </div>
                {/* 실시율 바 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="flex-1 h-2 rounded-full bg-stone-100 overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${g.rate}%`, background: rateColor(g.rate) }} />
                    </div>
                    <span className="text-[12px] font-black tabular-nums w-9 text-right" style={{ color: rateColor(g.rate) }}>{g.rate}%</span>
                  </div>
                  {/* 상태 분포 미니바 */}
                  <div className="flex h-1.5 rounded-full overflow-hidden mt-1 bg-stone-100">
                    {STATUS_ORDER.map((k) => g[k] > 0 && <div key={k} style={{ width: `${(g[k] / g.total) * 100}%`, background: STATUS_META[k].color }} />)}
                  </div>
                </div>
                <ChevronRight size={16} className="text-stone-300 flex-shrink-0" />
              </button>
            ))}
          </div>
        )}

        {/* 매장 레벨 */}
        {view === 'tree' && atStore && (
          <div className="space-y-1.5 max-h-[520px] overflow-y-auto pr-1">
            {storeRows.map((r) => {
              const m = STATUS_META[r.status];
              return (
                <div key={r.store} className="flex items-center gap-3 px-3 py-2.5 rounded-xl border bg-white transition hover:shadow-sm"
                  style={{ borderColor: '#F0EEEC' }}>
                  <StoreIcon size={14} className="text-stone-300 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-bold text-stone-800 truncate">{r.store}</div>
                    <div className="text-[11px] text-stone-400 truncate">{r.team}{PARJANG_BY_STORE[r.store] ? ` · 파트장 ${PARJANG_BY_STORE[r.store]}` : ''}</div>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <div className="text-[11px] text-stone-500 tabular-nums">{r.daysSince == null ? '기록 없음' : fmtDate(r.daysSince)}</div>
                    <div className="text-[10px] text-stone-400">
                      {program === 'tbm' ? (r.daysSince == null ? '—' : `주 ${r.count}회 · ${r.attend}명`) : (r.daysSince == null ? '—' : `${r.daysSince}일 경과`)}
                    </div>
                  </div>
                  <span className="text-[10px] font-bold px-2 py-1 rounded-full flex-shrink-0" style={{ background: m.soft, color: m.color }}>{m.label}</span>
                </div>
              );
            })}
            {storeRows.length === 0 && <div className="text-center text-sm text-stone-400 py-8">매장이 없습니다.</div>}
          </div>
        )}
      </Card>

      {showInput && <ComplianceInputForm program={program} stores={stores} onClose={() => setShowInput(false)} />}

      {/* 입력 이력 */}
      {showLog && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(7,30,74,0.32)' }} onClick={() => setShowLog(false)}>
          <div className="w-full max-w-[460px] max-h-[80vh] bg-white rounded-[22px] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()} style={{ boxShadow: '0 24px 60px rgba(7,30,74,0.22)' }}>
            <div className="flex items-center gap-2.5 px-5 py-4" style={{ background: prog.accent }}>
              <Clock size={16} color="#fff" />
              <div className="flex-1 text-[15px] font-black text-white">{prog.label} 입력 이력</div>
              <button onClick={() => setShowLog(false)} className="text-white/80 hover:text-white cursor-pointer"><X size={18} /></button>
            </div>
            <div className="p-4 overflow-y-auto space-y-2">
              {records.length === 0 && <div className="text-center text-sm text-stone-400 py-8">입력된 기록이 없습니다. (샘플은 이력에 표시되지 않습니다)</div>}
              {records.map((r) => (
                <div key={r.id} className="rounded-xl border border-stone-100 px-3 py-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold text-stone-800">{r.store}</span>
                    <span className="text-[11px] text-stone-400 tabular-nums">{r.date}</span>
                  </div>
                  <div className="text-[11px] text-stone-500 mt-0.5 flex flex-wrap gap-x-2">
                    {prog.fields?.map((f) => r[f.key] != null && r[f.key] !== '' && <span key={f.key}>{f.label}: <b className="text-stone-700">{r[f.key]}{f.unit || ''}</b></span>)}
                    {r.manager && <span>담당: <b className="text-stone-700">{r.manager}</b></span>}
                  </div>
                  {r.note && <div className="text-[11px] text-stone-400 mt-0.5">비고: {r.note}</div>}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

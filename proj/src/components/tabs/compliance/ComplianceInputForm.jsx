import { useMemo, useState, useId } from 'react';
import { X, Check, ClipboardList, Siren, ScanSearch } from 'lucide-react';
import { PROGRAMS } from '../../../constants/compliancePrograms.js';
import { submitRecord } from '../../../utils/complianceSource.js';
import { toast, ripple } from '../../../utils/uifx.js';

// 3모듈 공통 실시 기록 입력. program.fields 설정으로 프로그램 고유 필드 자동 렌더.
// 매장 선택 시 부문/부서/팀이 자동 매핑되어 계층 모니터에 그대로 반영된다.
// - modal 모드(기본): 대시보드 안에서 오버레이. onClose 필요.
// - standalone 모드: 파트장 모바일 링크(#compliance-input) — 로그인 없이 풀페이지.
const ICONS = { risk: ScanSearch, drill: Siren, tbm: ClipboardList };

function todayStr() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function ComplianceInputForm({ program = 'tbm', stores = [], onClose, standalone = false, initialStore = '' }) {
  const prog = PROGRAMS[program] || PROGRAMS.tbm;
  const Icon = ICONS[program] || ClipboardList;
  const listId = useId();

  const storeIndex = useMemo(() => {
    const m = new Map();
    for (const s of stores || []) if (s && s.store) m.set(s.store, s);
    return m;
  }, [stores]);

  const [storeName, setStoreName] = useState(initialStore);
  const [date, setDate] = useState(todayStr());
  const [extra, setExtra] = useState({});
  const [manager, setManager] = useState('');
  const [note, setNote] = useState('');
  const [err, setErr] = useState('');
  const [done, setDone] = useState(null);
  const [saving, setSaving] = useState(false);

  const matched = storeIndex.get(storeName.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (!matched) { setErr('목록에 있는 매장을 선택하세요.'); return; }
    if (!date) { setErr('실시일자를 입력하세요.'); return; }
    setSaving(true);
    const rec = {
      store: matched.store, dept: matched.dept || '미분류', team: matched.team || '미분류', bum: matched.bum || '기타',
      date, manager: manager.trim() || null, note: note.trim() || null, ...extra,
    };
    try { await submitRecord(program, rec); setDone(matched.store); toast(`${matched.store} · ${prog.label} 기록 저장`, 'ok'); }
    catch (e2) { setErr('저장 실패: ' + (e2?.message || '네트워크')); toast('저장 실패', 'err'); }
    finally { setSaving(false); }
  };

  const reset = () => { setStoreName(standalone ? '' : ''); setDate(todayStr()); setExtra({}); setManager(''); setNote(''); setErr(''); setDone(null); };

  const card = (
    <div className={`w-full ${standalone ? 'max-w-[460px]' : 'max-w-[420px]'} bg-white rounded-[22px] overflow-hidden`} style={{ boxShadow: standalone ? '0 24px 60px rgba(7,30,74,0.14)' : '0 24px 60px rgba(7,30,74,0.22)' }} onClick={(e) => e.stopPropagation()}>
      {/* 헤더 */}
      <div className="flex items-center gap-2.5 px-5 py-4" style={{ background: prog.accent }}>
        <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center"><Icon size={16} color="#fff" /></div>
        <div className="flex-1">
          <div className="text-[15px] font-black text-white leading-tight">{prog.label} 실시 기록</div>
          <div className="text-[11px] text-white/80">{standalone ? '현장에서 실시 후 바로 기록하세요' : '현장 입력 → 계층 모니터에 즉시 반영'}</div>
        </div>
        {!standalone && <button onClick={onClose} className="text-white/80 hover:text-white cursor-pointer"><X size={18} /></button>}
      </div>

      {done ? (
        <div className="px-6 py-9 text-center">
          <div className="w-14 h-14 rounded-full mx-auto flex items-center justify-center" style={{ background: '#ECFDF5' }}>
            <Check size={26} color="#047857" strokeWidth={3} />
          </div>
          <div className="mt-3 text-[15px] font-bold text-stone-800"><b>{done}</b> 기록 완료</div>
          <div className="text-xs text-stone-500 mt-1">{standalone ? '수고하셨습니다.' : '모니터에 반영되었습니다.'}</div>
          <div className="flex gap-2 mt-5">
            <button onClick={reset} className="flex-1 h-11 rounded-xl border border-stone-200 text-sm font-semibold text-stone-700 hover:bg-stone-50 cursor-pointer">또 입력</button>
            {standalone
              ? <button onClick={() => setDone(null)} className="flex-1 h-11 rounded-xl text-white text-sm font-bold cursor-pointer" style={{ background: prog.accent }}>완료</button>
              : <button onClick={onClose} className="flex-1 h-11 rounded-xl text-white text-sm font-bold cursor-pointer" style={{ background: prog.accent }}>현황 보기</button>}
          </div>
        </div>
      ) : (
        <form onSubmit={submit} className="px-5 py-5 space-y-3.5">
          <Field label="매장">
            <input list={listId} value={storeName} onChange={(e) => { setStoreName(e.target.value); setErr(''); }}
              placeholder="매장명 검색·선택" autoFocus={!initialStore}
              className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] transition" />
            <datalist id={listId}>{(stores || []).slice(0, 400).map((s) => <option key={s.store} value={s.store} />)}</datalist>
            {matched && <div className="text-[11px] text-stone-400 mt-1">{matched.bum} · {matched.dept} · {matched.team}</div>}
          </Field>

          <Field label="실시일자">
            <input type="date" value={date} max={todayStr()} onChange={(e) => setDate(e.target.value)}
              className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] transition" />
          </Field>

          {prog.fields?.map((f) => (
            <Field key={f.key} label={f.label} unit={f.unit}>
              {f.type === 'select' ? (
                <select value={extra[f.key] ?? ''} onChange={(e) => setExtra((x) => ({ ...x, [f.key]: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] bg-white cursor-pointer transition">
                  <option value="">선택</option>
                  {f.options.map((o) => <option key={o} value={o}>{o}</option>)}
                </select>
              ) : (
                <input type={f.type === 'number' ? 'number' : 'text'} min={f.type === 'number' ? 0 : undefined}
                  value={extra[f.key] ?? ''} placeholder={f.placeholder || ''}
                  onChange={(e) => setExtra((x) => ({ ...x, [f.key]: e.target.value }))}
                  className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] transition" />
              )}
            </Field>
          ))}

          <div className="grid grid-cols-2 gap-2.5">
            <Field label="담당자"><input value={manager} onChange={(e) => setManager(e.target.value)} placeholder="선택" className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] transition" /></Field>
            <Field label="비고"><input value={note} onChange={(e) => setNote(e.target.value)} placeholder="선택" className="w-full h-11 px-3 rounded-xl border border-stone-200 text-[14px] outline-none focus:border-[#1D4ED8] transition" /></Field>
          </div>

          {err && <div className="text-[12px] text-[#D70011] font-semibold">{err}</div>}

          <button type="submit" disabled={saving} onMouseDown={ripple} className="relative overflow-hidden w-full h-12 rounded-xl text-white text-[15px] font-bold cursor-pointer transition active:opacity-80 mt-1 disabled:opacity-60" style={{ background: prog.accent }}>
            {saving ? '저장 중…' : '실시 기록 저장'}
          </button>
        </form>
      )}
    </div>
  );

  if (standalone) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-5" style={{ background: 'linear-gradient(135deg,#FBF3F2 0%,#F6F3F8 45%,#F3F6F4 100%)' }}>
        <div className="mb-4 text-center">
          <div className="text-[13px] font-extrabold tracking-[0.14em]" style={{ color: prog.accent }}>ASUNG DAISO · SAFETY</div>
          <div className="text-[11px] text-stone-400 mt-0.5">안전보건 활동 실시 기록</div>
        </div>
        {card}
        <div className="mt-4 text-[11px] text-stone-400">기록은 안전보건팀 모니터에 집계됩니다.</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" style={{ background: 'rgba(7,30,74,0.32)' }} onClick={onClose}>
      {card}
    </div>
  );
}

function Field({ label, unit, children }) {
  return (
    <label className="block">
      <div className="text-[12px] font-bold text-[#071E4A] mb-1.5">{label}{unit && <span className="text-stone-400 font-medium"> ({unit})</span>}</div>
      {children}
    </label>
  );
}

// 데이터 조회 (newjuna 차용) — 연도→월→영업부→유형→매장명으로 사고 기록 검색.
// ⚠️ 마스킹된 D.accidents(성명=김**·사번=해시)만 사용 — 평문 PII 미노출.
import { useState, useMemo } from 'react';
import { Search, X } from 'lucide-react';

function DataSearchModal({ D, onClose }) {
  const rows = (D && D.accidents) || [];
  // 사고유형 정규화 — raw DB의 인접·중복 유형을 canonical로 병합(교집합 합치기). 더 합치려면 이 맵만 확장.
  const TYPE_MERGE = { '깔림': '끼임·깔림', '끼임': '끼임·깔림' };
  const normType = (t) => TYPE_MERGE[t] || t;
  const years = useMemo(() => [...new Set(rows.map(r => r.year).filter(Boolean))].sort((a, b) => b - a), [rows]);
  const depts = useMemo(() => [...new Set(rows.map(r => r.dept).filter(Boolean))].sort(), [rows]);
  const types = useMemo(() => [...new Set(rows.map(r => normType(r.type)).filter(Boolean))].sort(), [rows]);

  const [year, setYear] = useState('');
  const [month, setMonth] = useState('');
  const [dept, setDept] = useState('');
  const [type, setType] = useState('');
  const [store, setStore] = useState('');

  const result = useMemo(() => rows.filter(r =>
    (!year || String(r.year) === year) &&
    (!month || String(r.month) === month) &&
    (!dept || r.dept === dept) &&
    (!type || normType(r.type) === type) &&
    (!store || (r.store || '').includes(store.trim()))
  ).sort((a, b) => String(b.date || '').localeCompare(String(a.date || ''))), [rows, year, month, dept, type, store]);

  const reset = () => { setYear(''); setMonth(''); setDept(''); setType(''); setStore(''); };
  const dstr = (d) => d ? String(d).slice(0, 10) : '-';

  const Sel = ({ value, onChange, children }) => (
    <select value={value} onChange={e => onChange(e.target.value)} className="h-8 px-2 rounded-md border border-stone-200 text-xs text-stone-700 bg-white cursor-pointer">{children}</select>
  );

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-start justify-center overflow-auto p-3 sm:p-6" onClick={onClose}>
      <div onClick={e => e.stopPropagation()} className="bg-white w-full max-w-[920px] rounded-[20px] shadow-xl my-2 overflow-hidden">
        <div className="flex items-center justify-between px-5 sm:px-7 py-4 border-b-2 border-[#071E4A]" style={{ background: 'linear-gradient(135deg,#071E4A,#002B6D)' }}>
          <div className="flex items-center gap-2 text-white"><Search size={16} /><span className="font-extrabold">데이터 조회</span><span className="text-[11px] text-white/55">연도·월·영업부·유형·매장으로 검색 (개인정보 마스킹)</span></div>
          <button onClick={onClose} className="h-8 w-8 rounded-md text-white/70 hover:bg-white/10 flex items-center justify-center cursor-pointer"><X size={16} /></button>
        </div>

        <div className="px-5 sm:px-7 py-3 border-b border-stone-200 flex flex-wrap items-center gap-2 bg-stone-50">
          <Sel value={year} onChange={setYear}><option value="">연도 전체</option>{years.map(y => <option key={y} value={y}>{y}년</option>)}</Sel>
          <Sel value={month} onChange={setMonth}><option value="">월 전체</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={m}>{m}월</option>)}</Sel>
          <Sel value={dept} onChange={setDept}><option value="">영업부 전체</option>{depts.map(d => <option key={d} value={d}>{d}</option>)}</Sel>
          <Sel value={type} onChange={setType}><option value="">유형 전체</option>{types.map(t => <option key={t} value={t}>{t}</option>)}</Sel>
          <input value={store} onChange={e => setStore(e.target.value)} placeholder="매장명 검색" className="h-8 px-2.5 rounded-md border border-stone-200 text-xs w-32" />
          <button onClick={reset} className="h-8 px-3 rounded-md border border-stone-200 text-xs text-stone-600 bg-white hover:bg-stone-100 cursor-pointer">초기화</button>
          <div className="flex-1" />
          <span className="text-xs text-stone-500">총 <b className="text-[#002B6D] tabular-nums">{result.length.toLocaleString()}</b>건</span>
        </div>

        <div className="max-h-[60vh] overflow-auto px-5 sm:px-7 py-3">
          {result.length === 0 ? (
            <div className="py-10 text-center text-stone-400 text-sm">조회된 사고가 없습니다.</div>
          ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-white">
                <tr className="text-stone-500 border-b border-stone-200">
                  <th className="text-left font-semibold py-2 px-2">재해일</th>
                  <th className="text-left font-semibold py-2 px-2">매장</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">영업부·팀</th>
                  <th className="text-left font-semibold py-2 px-2">유형</th>
                  <th className="text-left font-semibold py-2 px-2 hidden sm:table-cell">기인물</th>
                  <th className="text-left font-semibold py-2 px-2 hidden md:table-cell">사고 내용</th>
                </tr>
              </thead>
              <tbody>
                {result.slice(0, 300).map((r, i) => (
                  <tr key={i} className="border-b border-stone-100 hover:bg-stone-50 align-top">
                    <td className="py-2 px-2 tabular-nums text-stone-500 whitespace-nowrap">{dstr(r.date)}</td>
                    <td className="py-2 px-2 font-semibold text-[#071E4A]">{r.store}</td>
                    <td className="py-2 px-2 text-stone-600 hidden sm:table-cell whitespace-nowrap">{r.dept} · {r.team}</td>
                    <td className="py-2 px-2 text-stone-700 whitespace-nowrap">{normType(r.type)}</td>
                    <td className="py-2 px-2 text-stone-600 hidden sm:table-cell">{r.cause || '-'}</td>
                    <td className="py-2 px-2 text-stone-500 hidden md:table-cell">{(r.content || '').slice(0, 60)}{(r.content || '').length > 60 ? '…' : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {result.length > 300 && <div className="text-center text-[11px] text-stone-400 py-2">상위 300건 표시 · 필터로 좁혀주세요</div>}
        </div>
      </div>
    </div>
  );
}

export { DataSearchModal };

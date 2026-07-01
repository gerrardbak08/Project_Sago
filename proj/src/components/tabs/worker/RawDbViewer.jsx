// 사고원본DB 뷰어 — 마스킹된 라이브 스냅샷 2시트(사고경위DB·산재승인DB) 인페이지 표
// 대시보드 디자인 언어(Card 래퍼·SegmentedToggle·컴팩트 테이블)와 통일.
import { useState, useMemo } from 'react';
import { Shield, ExternalLink, Database } from 'lucide-react';
import { SegmentedToggle } from '../../shared/MotionBits.jsx';
import { Card } from '../../shared/Card.jsx';
import { ExportBtn } from '../../../utils/exportUtils.jsx';
import { EmptyState } from '../../../utils/uiHelpers.jsx';

const COLS = [
  { key: 'year',            label: '년',           cls: 'tabular-nums text-stone-500' },
  { key: 'month',           label: '월',           cls: 'tabular-nums text-stone-500' },
  { key: 'stdDept',         label: '영업부',        cls: 'text-stone-700' },
  { key: 'stdTeam',         label: '팀',            cls: 'text-stone-600' },
  { key: 'store',           label: '매장',          cls: 'font-semibold text-[#071E4A]' },
  { key: 'victimName',      label: '재해자',         cls: 'text-stone-600' },
  { key: 'accidentDate',    label: '재해일자',       cls: 'tabular-nums text-stone-500' },
  { key: 'accidentType',    label: '재해유형',       cls: 'text-stone-700' },
  { key: 'causeObject',     label: '기인물',         cls: 'text-stone-600' },
  { key: 'lostDays',        label: '손실일',         cls: 'tabular-nums text-right text-stone-600' },
  { key: 'approvalYn',      label: '승인',           cls: 'text-center' },
  { key: 'accidentContent', label: '사고내용',       cls: 'text-stone-500', wide: true },
];

const RENDER_LIMIT = 300;

function normalizeRow(r) {
  return {
    ...r,
    accidentDate: r.accidentDate ? String(r.accidentDate).slice(0, 10) : '-',
    approvalYn:   r.approvalYn === 'Y' ? 'Y' : '-',
    lostDays:     r.lostDays != null ? r.lostDays : '-',
  };
}

function toExportRow(r, i) {
  return {
    '순번': i + 1,
    '년': r.year, '월': r.month, '영업부': r.stdDept, '팀': r.stdTeam, '매장': r.store,
    '재해자': r.victimName,
    '재해일자': r.accidentDate ? String(r.accidentDate).slice(0, 10) : '',
    '재해유형': r.accidentType, '기인물': r.causeObject,
    '근로손실일수': r.lostDays ?? '',
    '승인': r.approvalYn === 'Y' ? 'Y' : '-',
    '사고내용': r.accidentContent,
  };
}

// 대시보드 통일 셀렉트
function Sel({ value, onChange, children, w = 'w-auto' }) {
  return (
    <select value={value} onChange={e => onChange(e.target.value)}
      className={`h-8 px-2.5 rounded-md border border-stone-200 text-xs bg-white text-stone-700 cursor-pointer outline-none focus:ring-2 focus:ring-[#071E4A]/30 focus:border-[#071E4A] transition-colors ${w}`}>
      {children}
    </select>
  );
}

export default function RawDbViewer({ rows = [], approvalRows = [], sheetUrl }) {
  const [sheet, setSheet] = useState('incident');
  const [year, setYear]   = useState('');
  const [month, setMonth] = useState('');
  const [dept, setDept]   = useState('');
  const [team, setTeam]   = useState('');
  const [query, setQuery] = useState('');

  const activeRows = sheet === 'incident' ? rows : approvalRows;

  // 드롭다운 옵션 (현재 시트 기준) — 팀은 선택 영업부로 캐스케이드
  const years = useMemo(() => [...new Set(activeRows.map(r => r.year).filter(v => v != null))].sort((a, b) => b - a), [activeRows]);
  const depts = useMemo(() => [...new Set(activeRows.map(r => r.stdDept).filter(Boolean))].sort(), [activeRows]);
  const teams = useMemo(() => [...new Set(activeRows.filter(r => !dept || r.stdDept === dept).map(r => r.stdTeam).filter(Boolean))].sort(), [activeRows, dept]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return [...activeRows]
      .filter(r =>
        (!year  || String(r.year)  === year) &&
        (!month || String(r.month) === month) &&
        (!dept  || r.stdDept === dept) &&
        (!team  || r.stdTeam === team) &&
        (!q ||
          (r.store           || '').toLowerCase().includes(q) ||
          (r.stdDept         || '').toLowerCase().includes(q) ||
          (r.stdTeam         || '').toLowerCase().includes(q) ||
          (r.accidentType    || '').toLowerCase().includes(q) ||
          (r.accidentContent || '').toLowerCase().includes(q))
      )
      .sort((a, b) => String(b.accidentDate || '').localeCompare(String(a.accidentDate || '')));
  }, [activeRows, year, month, dept, team, query]);

  const displayed  = filtered.slice(0, RENDER_LIMIT);
  const exportRows = filtered.map(toExportRow);

  const changeSheet = (v) => { setSheet(v); setYear(''); setMonth(''); setDept(''); setTeam(''); setQuery(''); };
  const changeDept  = (v) => { setDept(v); setTeam(''); };
  const reset = () => { setYear(''); setMonth(''); setDept(''); setTeam(''); setQuery(''); };
  const hasFilter = year || month || dept || team || query;

  const sheetOptions = [
    { value: 'incident', label: `사고경위DB ${rows.length}` },
    { value: 'approval', label: `산재승인DB ${approvalRows.length}` },
  ];

  if (!rows.length && !approvalRows.length) {
    return <EmptyState message="스냅샷 데이터가 없습니다." />;
  }

  const linkBtn = sheetUrl ? (
    <a href={sheetUrl} target="_blank" rel="noopener noreferrer"
      className="h-7 px-2.5 rounded-md border border-stone-200 text-xs font-medium text-stone-600 bg-white hover:bg-stone-50 cursor-pointer flex items-center gap-1 transition">
      <ExternalLink size={12} strokeWidth={2} /> 원본 시트<span className="text-stone-400">↗</span>
    </a>
  ) : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      <Card
        title="사고원본DB"
        titleIcon={Database}
        sub="라이브 시트 스냅샷 — 사고경위DB / 산재승인DB (성명·사번 마스킹)"
        delay={0}
        right={linkBtn}
      >
        {/* 시트 토글 + CSV */}
        <div className="flex flex-wrap items-center gap-2 mb-2.5">
          <SegmentedToggle value={sheet} onChange={changeSheet} accent="#071E4A" size="sm" options={sheetOptions} />
          <div className="flex-1" />
          <ExportBtn rows={exportRows} filename={`사고원본DB_${sheet === 'incident' ? '사고경위' : '산재승인'}.csv`} />
        </div>

        {/* 필터 행: 연도·월·영업부·팀 드롭다운 + 검색 + 건수 */}
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <Sel value={year} onChange={setYear}><option value="">연도 전체</option>{years.map(y => <option key={y} value={String(y)}>{y}년</option>)}</Sel>
          <Sel value={month} onChange={setMonth}><option value="">월 전체</option>{Array.from({ length: 12 }, (_, i) => i + 1).map(m => <option key={m} value={String(m)}>{m}월</option>)}</Sel>
          <Sel value={dept} onChange={changeDept}><option value="">영업부 전체</option>{depts.map(d => <option key={d} value={d}>{d}</option>)}</Sel>
          <Sel value={team} onChange={setTeam}><option value="">팀 전체</option>{teams.map(t => <option key={t} value={t}>{t}</option>)}</Sel>
          <div className="relative">
            <input type="text" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="매장·내용 검색"
              className="h-8 pl-3 pr-7 rounded-md border border-stone-200 text-xs w-44 outline-none focus:ring-2 focus:ring-[#071E4A]/30 focus:border-[#071E4A] transition-colors" />
            {query && (
              <button onClick={() => setQuery('')} aria-label="검색 초기화"
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-stone-300 hover:text-stone-500 cursor-pointer text-sm leading-none">×</button>
            )}
          </div>
          {hasFilter && (
            <button onClick={reset} className="h-8 px-2.5 rounded-md text-xs text-stone-500 hover:bg-stone-100 cursor-pointer">필터 초기화</button>
          )}
          <span className="text-xs text-stone-500 ml-auto">총 <b className="text-stone-900 tabular-nums">{filtered.length.toLocaleString()}</b>건</span>
        </div>

        {/* PII 안내 */}
        <div className="flex items-center gap-1.5 mb-3 text-[11px] text-stone-500">
          <Shield size={12} strokeWidth={2} className="text-stone-400 flex-shrink-0" />
          개인정보 보호를 위해 성명은 <b className="text-stone-600">홍**</b>, 사번은 <b className="text-stone-600">AD-***</b> 로 마스킹 표시됩니다.
        </div>

        {/* 표 — 고정높이 내부 스크롤(Card 레이어 비대화 방지), 컴팩트 행, 헤더 sticky */}
        <div className="overflow-auto max-h-[560px] -mx-5 px-5 pb-1 rounded-b-sm">
          {displayed.length === 0 ? (
            <div className="py-12 text-center text-stone-400 text-sm">조회된 데이터가 없습니다.</div>
          ) : (
            <table className="w-full text-xs min-w-[960px]">
              <thead className="sticky top-0 z-10 bg-white">
                <tr className="border-b-2 border-stone-200 text-[10px] text-stone-400 uppercase tracking-wide">
                  <th className="py-2 px-2.5 font-semibold text-right whitespace-nowrap">#</th>
                  {COLS.map(c => (
                    <th key={c.key} className={`py-2 px-2.5 font-semibold whitespace-nowrap ${c.key === 'lostDays' ? 'text-right' : c.key === 'approvalYn' ? 'text-center' : 'text-left'}`}>{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {displayed.map((raw, i) => {
                  const r = normalizeRow(raw);
                  return (
                    <tr key={r.recordId || i} className="border-b border-stone-100 hover:bg-stone-50/60 transition-colors">
                      <td className="py-2 px-2.5 text-right tabular-nums text-stone-400 whitespace-nowrap">{i + 1}</td>
                      {COLS.map(c => {
                        if (c.wide) {
                          const full = r.accidentContent || '';
                          return (
                            <td key={c.key} className="py-2 px-2.5 text-stone-500 max-w-[320px] truncate" title={full || undefined}>
                              {full || '-'}
                            </td>
                          );
                        }
                        if (c.key === 'approvalYn') {
                          const ok = r.approvalYn === 'Y';
                          return (
                            <td key={c.key} className="py-2 px-2.5 text-center whitespace-nowrap">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${ok ? 'bg-emerald-50 text-emerald-700' : 'text-stone-300'}`}>{ok ? 'Y' : '-'}</span>
                            </td>
                          );
                        }
                        return (
                          <td key={c.key} className={`py-2 px-2.5 whitespace-nowrap ${c.cls}`}>{r[c.key] ?? '-'}</td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {filtered.length > RENDER_LIMIT && (
          <div className="text-center text-[11px] text-stone-400 pt-2">처음 {RENDER_LIMIT}건 표시 (전체 {filtered.length.toLocaleString()}건) · 필터·검색으로 좁혀주세요</div>
        )}
      </Card>
    </div>
  );
}

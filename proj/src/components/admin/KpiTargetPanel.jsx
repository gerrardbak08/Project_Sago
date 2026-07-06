import { useState } from 'react';
import { Download, Lock, RefreshCw, Save, X } from 'lucide-react';
import { loadTargets, saveTargets } from '../../utils/kpiStore.js';
import { STATUS_COLOR, STATUS_LABEL } from '../../utils/kpiProgress.js';

// 절감률 텍스트 (소수점 1자리)
function reductionPct(baseline, target) {
  if (!baseline || baseline === 0) return '—';
  return ((1 - target / baseline) * 100).toFixed(1) + '%';
}

// 상태 배지 소형 (테이블 내 미리보기)
function MiniStatusBadge({ baseline, target }) {
  if (!baseline || baseline === 0 || target == null) return null;
  // 간단 평가: 연간 기준으로 상태만 미리 보여줌
  const pct = (1 - target / baseline) * 100;
  let color, label;
  if (pct >= 10)      { color = STATUS_COLOR.exceed; label = '초과목표'; }
  else if (pct >= 5)  { color = STATUS_COLOR.met;    label = '목표권'; }
  else if (pct >= 0)  { color = STATUS_COLOR.near;   label = '낮음'; }
  else                { color = STATUS_COLOR.miss;    label = '증가'; }
  return (
    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full ml-1.5 whitespace-nowrap"
      style={{ background: color + '20', color }}>
      {label}
    </span>
  );
}

function KpiTargetPanel({ onClose }) {
  const [localTargets, setLocalTargets] = useState(() => loadTargets());
  const [activeLevel, setActiveLevel] = useState('dept');
  const [savedFlash, setSavedFlash] = useState(false);

  const factor = localTargets.factor ?? 0.1;
  const levels = localTargets.levels || {};

  // 편집 핸들러
  const handleEdit = (level, key, rawValue) => {
    const num = parseInt(rawValue, 10);
    if (isNaN(num) || num < 0) return;
    const baseline = levels[level]?.[key]?.baseline_incidents ?? 0;
    const autoTarget = Math.round(baseline * (1 - factor));
    setLocalTargets(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [level]: {
          ...prev.levels[level],
          [key]: {
            ...prev.levels[level][key],
            target_incidents: num,
            edited: num !== autoTarget,
          },
        },
      },
    }));
  };

  // 저장
  const handleSave = () => {
    saveTargets(localTargets);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
  };

  // JSON 내보내기 (커밋·S3 업로드용)
  const handleExport = () => {
    const blob = new Blob(
      [JSON.stringify({ ...localTargets, updatedAt: new Date().toISOString() }, null, 2)],
      { type: 'application/json' }
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `kpi_targets_${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 현재 탭만 자동값 리셋
  const handleReset = () => {
    setLocalTargets(prev => ({
      ...prev,
      levels: {
        ...prev.levels,
        [activeLevel]: Object.fromEntries(
          Object.entries(prev.levels[activeLevel] || {}).map(([k, v]) => [
            k,
            {
              ...v,
              target_incidents: Math.round((v.baseline_incidents ?? 0) * (1 - factor)),
              edited: false,
            },
          ])
        ),
      },
    }));
  };

  const levelMeta = [
    { id: 'bumun', label: '부문', count: Object.keys(levels.bumun || {}).length },
    { id: 'dept',  label: '부서', count: Object.keys(levels.dept  || {}).length },
    { id: 'team',  label: '팀',   count: Object.keys(levels.team  || {}).length },
  ];

  const rows = Object.entries(levels[activeLevel] || {});
  // baseline 있는 항목 우선, 그 안에서 내림차순
  const sorted = [...rows].sort((a, b) => (b[1].baseline_incidents ?? 0) - (a[1].baseline_incidents ?? 0));
  const editedCount = rows.filter(([, v]) => v.edited).length;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto"
      style={{ background: 'rgba(7,30,74,0.55)', backdropFilter: 'blur(3px)' }}
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl w-full max-w-3xl my-6 mx-4 shadow-[0_24px_80px_rgba(7,30,74,0.28)] flex flex-col"
        onClick={e => e.stopPropagation()}
      >
        {/* ── 헤더 ── */}
        <div className="bg-stone-900 text-white rounded-t-2xl px-6 py-5 flex items-center justify-between flex-wrap gap-3">
          <div>
            <div className="text-[11px] opacity-70 font-semibold flex items-center gap-1 mb-1">
              <Lock size={11} strokeWidth={2} /> 관리자 모드
            </div>
            <div className="text-lg font-extrabold tracking-tight">사고절감 KPI 목표 설정</div>
            <div className="text-xs opacity-60 mt-0.5">
              목표건수 수정 → 저장 → 대시보드 배지 즉시 반영 · 2026년 절감 {Math.round(factor * 100)}% 자동 프리필
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white cursor-pointer transition flex-shrink-0">
            <X size={20} />
          </button>
        </div>

        {/* ── 레벨 탭 ── */}
        <div className="flex gap-0 border-b border-stone-200 px-5 bg-white">
          {levelMeta.map(lv => (
            <button
              key={lv.id}
              onClick={() => setActiveLevel(lv.id)}
              className={`px-5 py-3 text-xs font-semibold border-b-2 transition cursor-pointer -mb-px ${
                activeLevel === lv.id
                  ? 'border-[#071E4A] text-[#071E4A]'
                  : 'border-transparent text-stone-500 hover:text-stone-700 hover:border-stone-300'
              }`}
            >
              {lv.label}
              <span className="ml-1.5 text-[10px] font-normal opacity-70">({lv.count})</span>
            </button>
          ))}
          {editedCount > 0 && (
            <span className="ml-auto self-center mr-1 text-[10px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
              {editedCount}개 수정됨
            </span>
          )}
        </div>

        {/* ── 테이블 ── */}
        <div className="overflow-x-auto flex-1" style={{ maxHeight: 'calc(70vh - 60px)' }}>
          <table className="w-full min-w-[580px] text-sm">
            <thead className="sticky top-0">
              <tr className="border-b border-stone-200 text-[11px] text-stone-500 uppercase bg-stone-50">
                <th className="text-left py-2.5 px-4 font-semibold">조직명</th>
                <th className="text-right py-2.5 px-4 font-semibold">기준('25)</th>
                <th className="text-right py-2.5 px-4 font-semibold">자동목표</th>
                <th className="text-right py-2.5 px-4 font-semibold" style={{ width: 120 }}>편집목표</th>
                <th className="text-right py-2.5 px-4 font-semibold">절감률</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map(([key, val]) => {
                const baseline = val.baseline_incidents ?? 0;
                const autoTarget = Math.round(baseline * (1 - factor));
                const currentTarget = val.target_incidents ?? autoTarget;
                const red = reductionPct(baseline, currentTarget);
                const redNum = baseline > 0 ? (1 - currentTarget / baseline) * 100 : null;

                return (
                  <tr
                    key={key}
                    className={`border-b border-stone-100 hover:bg-stone-50/50 transition-colors ${
                      val.edited ? 'bg-amber-50/40' : ''
                    }`}
                  >
                    <td className="py-2.5 px-4 font-medium text-stone-800 whitespace-nowrap">
                      <span>{key}</span>
                      {val.edited && (
                        <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 font-semibold border border-amber-200">
                          수정됨
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-stone-600 whitespace-nowrap">
                      {baseline}건
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums text-stone-400 whitespace-nowrap">
                      {autoTarget}건
                    </td>
                    <td className="py-2.5 px-4 text-right whitespace-nowrap">
                      <input
                        type="number"
                        value={currentTarget}
                        min={0}
                        max={baseline + 100}
                        onChange={e => handleEdit(activeLevel, key, e.target.value)}
                        className="w-20 text-right px-2.5 py-1.5 border border-stone-300 rounded-lg text-xs font-bold tabular-nums focus:outline-none focus:border-[#071E4A] focus:ring-1 focus:ring-[#071E4A]/30 transition"
                      />
                      <MiniStatusBadge baseline={baseline} target={currentTarget} />
                    </td>
                    <td className="py-2.5 px-4 text-right tabular-nums whitespace-nowrap">
                      {redNum != null ? (
                        <span
                          className="text-xs font-bold"
                          style={{ color: redNum > 0 ? '#047857' : redNum < 0 ? '#B91C1C' : '#78716C' }}
                        >
                          {red}
                        </span>
                      ) : (
                        <span className="text-stone-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* ── 액션 바 ── */}
        <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-stone-100 bg-stone-50/60 rounded-b-2xl">
          <button
            onClick={handleSave}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-white cursor-pointer transition active:opacity-80"
            style={{ background: '#071E4A' }}
          >
            <Save size={14} strokeWidth={2} />
            저장
            {savedFlash && (
              <span className="text-[11px] font-bold text-emerald-300 ml-0.5">저장됨</span>
            )}
          </button>
          <button
            onClick={handleExport}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-stone-700 border border-stone-300 bg-white hover:bg-stone-50 cursor-pointer transition"
          >
            <Download size={14} strokeWidth={2} />
            kpi_targets.json 내보내기
          </button>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-semibold text-amber-700 border border-amber-300 bg-white hover:bg-amber-50 cursor-pointer transition"
          >
            <RefreshCw size={14} strokeWidth={2} />
            자동값 리셋 ({Math.round(factor * 100)}%절감)
          </button>
          <div className="flex-1" />
          <div className="text-[11px] text-stone-400 hidden sm:block">
            저장 = localStorage 즉시 반영 · JSON 내보내기 = 커밋 후 S3 업로드
          </div>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-stone-200 text-sm font-semibold text-stone-500 hover:bg-stone-100 cursor-pointer transition"
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}

export default KpiTargetPanel;

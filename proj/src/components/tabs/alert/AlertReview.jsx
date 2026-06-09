import { useState, useEffect } from 'react';
import { TrendingUp, Cloud, Activity, RefreshCw, Send } from 'lucide-react';

const API_URL = import.meta.env.VITE_ALERTS_API_URL || '';

function RiskBar({ value, color }) {
  const pct = Math.round((value || 0) * 100);
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex-1 h-1.5 rounded-full bg-slate-100 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: pct + '%' }} />
      </div>
      <span className="text-xs text-slate-500 w-7 text-right">{pct}%</span>
    </div>
  );
}

function RiskBadge({ score }) {
  if (score >= 0.7) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-red-100 text-red-700">고위험</span>;
  if (score >= 0.4) return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-amber-100 text-amber-700">중위험</span>;
  return <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-green-100 text-green-700">저위험</span>;
}

export default function AlertReview({ onSendRequest }) {
  const [date, setDate] = useState(() => {
    const d = new window.Date();
    return d.toISOString().slice(0, 10);
  });
  const [data, setData] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const load = async (d) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_URL}?type=daily&date=${d}`);
      if (!res.ok) throw new Error(`조회 실패 (${res.status})`);
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.items || json.results || []);
      items.sort((a, b) => (b.risk_score || 0) - (a.risk_score || 0));
      setData(items);
      setLastUpdated(new window.Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }));
    } catch (e) {
      setError(e.message);
      setData([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(date); }, [date]);

  return (
    <div className="p-4 max-w-4xl mx-auto">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <div>
          <h2 className="text-base font-bold text-slate-800">AI 위험점수 사전검토</h2>
          <p className="text-xs text-slate-500 mt-0.5">배치 자동 발송 전 위험 순위 · 발송 근거 확인</p>
        </div>
        <div className="flex items-center gap-2">
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="border border-slate-200 rounded-lg px-2 py-1.5 text-sm text-slate-700 cursor-pointer" />
          <button onClick={() => load(date)}
            className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-600 text-xs font-medium">
            <RefreshCw size={12} /> 새로고침
          </button>
        </div>
      </div>

      {lastUpdated && (
        <p className="text-xs text-slate-400 mb-3">마지막 갱신: {lastUpdated}</p>
      )}

      {error && (
        <div className="rounded-lg bg-red-50 border border-red-100 p-3 text-sm text-red-700 mb-4">
          {error} — 배치가 아직 실행되지 않았거나 해당 날짜 결과가 없습니다.
        </div>
      )}

      {loading ? (
        <div className="text-center py-16 text-slate-400 text-sm">불러오는 중...</div>
      ) : data.length === 0 && !error ? (
        <div className="text-center py-16 text-slate-400 text-sm">해당 날짜의 분석 결과가 없습니다.</div>
      ) : (
        <div className="space-y-2">
          {data.map((item, i) => {
            const score = item.risk_score || 0;
            const rationale = item.rationale || {};
            return (
              <div key={item.store_code || i}
                className="bg-white rounded-xl border border-slate-100 shadow-sm p-3 hover:border-indigo-200 transition-colors">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs font-bold text-slate-400 w-5 text-right shrink-0">#{i+1}</span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate">{item.store_name || item.store_code}</span>
                        <RiskBadge score={score} />
                        {item.trigger === 'batch_auto' && (
                          <span className="px-1.5 py-0.5 rounded text-xs bg-amber-50 text-amber-600 border border-amber-100">자동발송</span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{item.dept || ''} {item.team || ''}</p>
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {onSendRequest && (
                      <button
                        onClick={() => onSendRequest(item.store_code)}
                        className="flex items-center gap-1 px-2 py-1 rounded-md bg-indigo-50 hover:bg-indigo-100 text-indigo-600 text-xs font-medium border border-indigo-100 shrink-0 cursor-pointer"
                      >
                        <Send size={11} />발송
                      </button>
                    )}
                    <div className="text-right">
                      <span className="text-lg font-bold text-slate-700">{(score * 100).toFixed(0)}</span>
                      <span className="text-xs text-slate-400">/100</span>
                    </div>
                  </div>
                </div>

                <div className="mt-2.5 space-y-1">
                  <RiskBar value={score} color={score >= 0.7 ? 'bg-red-400' : score >= 0.4 ? 'bg-amber-400' : 'bg-green-400'} />
                </div>

                {(rationale.accident_pattern || rationale.weather || rationale.risk_score) && (
                  <div className="mt-2.5 grid grid-cols-1 gap-1">
                    {rationale.accident_pattern && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Activity size={11} className="mt-0.5 text-indigo-400 shrink-0" />
                        <span>{rationale.accident_pattern}</span>
                      </div>
                    )}
                    {rationale.weather && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600">
                        <Cloud size={11} className="mt-0.5 text-sky-400 shrink-0" />
                        <span>{rationale.weather}</span>
                      </div>
                    )}
                    {rationale.risk_score && (
                      <div className="flex items-start gap-1.5 text-xs text-slate-600">
                        <TrendingUp size={11} className="mt-0.5 text-emerald-400 shrink-0" />
                        <span>{rationale.risk_score}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

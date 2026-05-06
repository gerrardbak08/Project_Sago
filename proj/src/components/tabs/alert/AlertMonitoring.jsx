import { useState, useEffect } from 'react';
import { Bell, Calendar, CheckCircle2, AlertCircle, ChevronRight, RefreshCw, X, AlertTriangle, Building2, MapPin } from 'lucide-react';
import { DAISO_RED, ALERT_RED, SAFE_GREEN } from '../../../constants/colors.js';
import { Card } from '../../shared/Card.jsx';

const RISK_META = {
  high:   { label: "고위험", bg: "bg-red-50",    border: "border-red-200",    text: "text-red-700",    dot: "#D70011" },
  medium: { label: "중위험", bg: "bg-amber-50",  border: "border-amber-200",  text: "text-amber-700",  dot: "#B45309" },
  low:    { label: "저위험", bg: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-700", dot: "#15803D" },
};

function RiskBadge({ grade }) {
  const m = RISK_META[grade] || RISK_META.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bg} ${m.border} ${m.text} border`}>
      <span className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function ScoreBar({ score }) {
  const color = score >= 70 ? ALERT_RED : score >= 50 ? "#B45309" : SAFE_GREEN;
  return (
    <div className="flex items-center gap-1.5">
      <div className="w-16 h-1.5 rounded-full bg-stone-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${score}%`, background: color }} />
      </div>
      <span className="text-xs tabular-nums font-bold" style={{ color }}>{score}</span>
    </div>
  );
}

function DetailModal({ item, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!item?.detail_key) { setLoading(false); return; }
    const base = import.meta.env.VITE_API_BASE ?? '';
    const filename = item.detail_key.split('/').pop();
    fetch(`${base}/api/alerts/${item.date}/${filename}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => { setDetail(d); setLoading(false); })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [item]);

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div>
            <div className="font-bold text-stone-900 text-base">{item.store_name}</div>
            <div className="text-xs text-stone-500 mt-0.5">{item.region} · {item.date}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center cursor-pointer text-stone-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {loading && (
            <div className="flex items-center justify-center py-10 text-stone-400">
              <RefreshCw size={16} className="animate-spin mr-2" /> 상세 데이터 로딩 중...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle size={14} /> 상세 정보를 불러올 수 없습니다: {error}
            </div>
          )}
          {detail && (
            <>
              {/* 기상 */}
              {detail.weather && (
                <div className="rounded-xl bg-sky-50 border border-sky-100 p-4">
                  <div className="text-xs font-bold text-sky-700 uppercase tracking-wide mb-3">기상 정보</div>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {[
                      { k: "최고기온", v: `${detail.weather.temperature_2m_max}°C` },
                      { k: "최저기온", v: `${detail.weather.temperature_2m_min}°C` },
                      { k: "강수량", v: `${detail.weather.precipitation_sum}mm` },
                      { k: "최대풍속", v: `${detail.weather.wind_speed_10m_max}m/s` },
                    ].map(({ k, v }) => (
                      <div key={k} className="bg-white rounded-lg p-2.5 text-center border border-sky-100">
                        <div className="text-[10px] text-sky-600 font-medium">{k}</div>
                        <div className="text-sm font-bold text-stone-800 mt-0.5">{v}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 고객 안전 */}
              {detail.results?.cust && (
                <GuideSection type="CUST" label="고객 안전" result={detail.results.cust} />
              )}

              {/* 직원 안전 */}
              {detail.results?.emp && (
                <GuideSection type="EMP" label="직원 안전" result={detail.results.emp} />
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function GuideSection({ type, label, result }) {
  const isCust = type === "CUST";
  const accentColor = isCust ? "#0891B2" : "#4F46E5";
  const bgClass = isCust ? "bg-sky-50 border-sky-100" : "bg-indigo-50 border-indigo-100";
  const grade = result.risk?.grade || "low";
  const m = RISK_META[grade];

  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold" style={{ background: accentColor }}>
            {type}
          </div>
          <span className="font-semibold text-stone-800 text-sm">{label}</span>
        </div>
        <RiskBadge grade={grade} />
      </div>

      {result.guide && (
        <div className="space-y-2">
          <div className="text-xs font-semibold text-stone-700 bg-white rounded-lg px-3 py-2 border border-stone-200">
            {result.guide['위험_요약']}
          </div>
          {result.guide['안전_수칙'] && (
            <ul className="space-y-1">
              {result.guide['안전_수칙'].map((item, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                  <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold" style={{ background: accentColor }}>
                    {i + 1}
                  </span>
                  {item}
                </li>
              ))}
            </ul>
          )}
          {result.guide['과거_사례_인용'] && (
            <div className="text-[11px] text-stone-500 bg-white/70 rounded-lg px-3 py-2 border border-stone-100 italic">
              "{result.guide['과거_사례_인용']}"
            </div>
          )}
          {result.matched_rule && (
            <div className="text-[10px] text-stone-400 font-mono bg-stone-50 px-2 py-1 rounded">
              적용 규칙: {result.matched_rule}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertMonitoring() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [filter, setFilter] = useState("all");

  const load = async (d) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const base = import.meta.env.VITE_API_BASE ?? '';
      const res = await fetch(`${base}/api/alerts/${d}`);
      if (!res.ok) throw new Error(`데이터 없음 (HTTP ${res.status})`);
      const data = await res.json();
      setResult(Array.isArray(data) ? data : data.stores || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => load(date);

  const filtered = !result ? [] : filter === "all" ? result : result.filter(s => s.risk_cust === filter || s.risk_emp === filter);

  const counts = result ? {
    total: result.length,
    high: result.filter(s => s.risk_cust === "high" || s.risk_emp === "high").length,
    medium: result.filter(s => s.risk_cust === "medium" || s.risk_emp === "medium").length,
    low: result.filter(s => s.risk_cust === "low" && s.risk_emp === "low").length,
  } : null;

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="rounded-xl bg-gradient-to-r from-stone-900 to-stone-800 p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Bell size={18} />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-tight">알림 발송 현황</div>
            <div className="text-xs text-stone-400 mt-0.5">배치 결과 · 매장별 위험도 모니터링</div>
          </div>
        </div>
      </div>

      {/* 날짜 선택 + 조회 */}
      <Card>
        <div className="flex items-center gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <Calendar size={14} className="text-stone-400" />
            <span className="text-xs font-semibold text-stone-600">조회 날짜</span>
          </div>
          <input
            type="date"
            value={date}
            onChange={e => setDate(e.target.value)}
            className="h-8 px-3 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 bg-white focus:outline-none focus:border-stone-400 cursor-pointer"
          />
          <button
            onClick={handleLoad}
            disabled={loading}
            className="h-8 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
          >
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Bell size={12} />}
            조회
          </button>
          {result && (
            <span className="text-xs text-stone-500 ml-auto">{result.length}개 매장 결과</span>
          )}
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} />
          {date} 날짜의 배치 결과가 없습니다. 다른 날짜를 선택하거나 배치를 먼저 실행하세요.
        </div>
      )}

      {/* 요약 카드 */}
      {counts && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "총 매장", value: counts.total, color: "#1C1917", bg: "bg-stone-50", border: "border-stone-200" },
            { label: "고위험", value: counts.high, color: ALERT_RED, bg: "bg-red-50", border: "border-red-200" },
            { label: "중위험", value: counts.medium, color: "#B45309", bg: "bg-amber-50", border: "border-amber-200" },
            { label: "저위험", value: counts.low, color: SAFE_GREEN, bg: "bg-emerald-50", border: "border-emerald-200" },
          ].map(({ label, value, color, bg, border }) => (
            <div key={label} className={`rounded-xl p-4 border ${bg} ${border}`}>
              <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">{label}</div>
              <div className="text-3xl font-extrabold tabular-nums mt-1" style={{ color }}>{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* 필터 + 테이블 */}
      {result && (
        <Card title="매장별 알림 결과" titleIcon={Bell}>
          {/* 필터 탭 */}
          <div className="flex gap-1 mb-3 border-b border-stone-100 pb-3">
            {[
              { id: "all", label: "전체", count: result.length },
              { id: "high", label: "고위험", count: counts.high },
              { id: "medium", label: "중위험", count: counts.medium },
              { id: "low", label: "저위험", count: counts.low },
            ].map(f => (
              <button
                key={f.id}
                onClick={() => setFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer transition-all ${
                  filter === f.id ? "bg-stone-900 text-white" : "text-stone-500 hover:bg-stone-100"
                }`}
              >
                {f.label} <span className="opacity-60">{f.count}</span>
              </button>
            ))}
          </div>

          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b-2 border-stone-100 text-xs text-stone-400 uppercase">
                  <th className="text-left py-2 px-2 font-semibold">매장</th>
                  <th className="text-left py-2 px-2 font-semibold">지역</th>
                  <th className="text-center py-2 px-2 font-semibold">고객 위험도</th>
                  <th className="text-center py-2 px-2 font-semibold">직원 위험도</th>
                  <th className="text-left py-2 px-2 font-semibold">주 유형 (고객)</th>
                  <th className="text-left py-2 px-2 font-semibold">주 유형 (직원)</th>
                  <th className="text-center py-2 px-2 font-semibold">상세</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => (
                  <tr key={s.store_code + i} className="border-b border-stone-50 hover:bg-stone-50/70 transition-colors">
                    <td className="py-2.5 px-2">
                      <div className="font-semibold text-stone-900 text-xs">{s.store_name}</div>
                      <div className="text-[10px] text-stone-400 tabular-nums">{s.store_code}</div>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-stone-500">{s.region}</td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <RiskBadge grade={s.risk_cust} />
                        <ScoreBar score={s.risk_cust_score} />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <RiskBadge grade={s.risk_emp} />
                        <ScoreBar score={s.risk_emp_score} />
                      </div>
                    </td>
                    <td className="py-2.5 px-2 text-xs text-stone-600">{s.dominant_type_cust || "—"}</td>
                    <td className="py-2.5 px-2 text-xs text-stone-600">{s.dominant_type_emp || "—"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <button
                        onClick={() => setSelectedItem(s)}
                        className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center cursor-pointer text-stone-500 mx-auto"
                      >
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-10 text-center text-stone-400 text-xs">해당 위험 등급의 매장이 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* 빈 상태 */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
            <Bell size={24} className="text-stone-300" />
          </div>
          <div className="text-sm font-medium">날짜를 선택하고 조회 버튼을 눌러주세요</div>
          <div className="text-xs mt-1">배치 실행 결과가 있는 날짜만 조회됩니다</div>
        </div>
      )}

      {/* 상세 모달 */}
      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

export default AlertMonitoring;

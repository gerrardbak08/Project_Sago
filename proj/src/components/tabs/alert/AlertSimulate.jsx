import { useState, useEffect, useRef } from 'react';
import { Sparkles, Search, AlertCircle, RefreshCw, X, CheckCircle2, MapPin, Building2 } from 'lucide-react';
import { Card } from '../../shared/Card.jsx';
import rawStores from '../../../data/raw/stores.json';

const STORES_LIST = rawStores.data.filter(s => s['폐점여부'] === '영업');

function GuideSection({ type, label, result }) {
  const isCust = type === "CUST";
  const accentColor = isCust ? "#0891B2" : "#4F46E5";
  const bgClass = isCust ? "bg-sky-50/60 border-sky-100" : "bg-indigo-50/60 border-indigo-100";
  const guide = result.guide || {};
  const todayItems = Array.isArray(guide["오늘의_주의사항"]) ? guide["오늘의_주의사항"] : [];
  const negligenceItems = Array.isArray(guide["부주의_주의사항"]) ? guide["부주의_주의사항"] : [];

  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center text-white text-[10px] font-bold" style={{ background: accentColor }}>
            {type}
          </div>
          <span className="font-bold text-stone-800">{label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold border bg-white/70 border-stone-200 text-stone-600">
            {guide["주요_위험유형"] || "위험유형 분석 중"}
          </span>
          {result.fallback_level > 0 && (
            <span className="text-[10px] px-2 py-0.5 rounded-full bg-stone-100 text-stone-500 border border-stone-200">
              Fallback L{result.fallback_level}
            </span>
          )}
        </div>
      </div>

      {result.guide && (
        <div className="space-y-2.5">
          {/* 위험 요약 */}
          <div className="bg-white rounded-lg px-3 py-2.5 border border-stone-200/80 text-xs font-semibold text-stone-700">
            {guide["위험_요약"]}
          </div>

          {/* 오늘의 주의사항 */}
          {todayItems.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1.5">오늘의 주의사항</div>
              <ul className="space-y-2">
                {todayItems.map((item, i) => (
                  <li key={item.incident_id || i} className="text-xs text-stone-700 bg-white/70 rounded-lg px-2.5 py-2 border border-white/70">
                    <div className="flex items-start gap-2">
                      <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold" style={{ background: accentColor }}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 space-y-1">
                        <div className="font-semibold text-stone-800">{item["수칙"]}</div>
                        {item["사고내용"] && (
                          <div className="text-[11px] text-stone-500 leading-relaxed">{item["사고내용"]}</div>
                        )}
                        <div className="flex flex-wrap gap-1">
                          {item["오늘_재현_가능성"] && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                              재현 {item["오늘_재현_가능성"]}
                            </span>
                          )}
                          {item["관련_피처"] && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-500">
                              {item["관련_피처"]}
                            </span>
                          )}
                          {item.incident_id && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded bg-stone-100 text-stone-400 font-mono">
                              {item.incident_id}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 부주의 주의사항 */}
          {negligenceItems.length > 0 && (
            <div>
              <div className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-1.5">상시 주의사항</div>
              <ul className="space-y-1.5">
                {negligenceItems.map((item, i) => (
                  <li key={i} className="flex items-start gap-2 text-xs text-stone-700 bg-white/60 rounded-lg px-2.5 py-1.5">
                    <span className="text-stone-400 font-bold">{i + 1}.</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 추가 참고 */}
          {guide["추가_참고"] && (
            <div className="text-[11px] text-stone-600 bg-white/60 rounded-lg px-3 py-2 border border-stone-100 leading-relaxed">
              ℹ️ {guide["추가_참고"]}
            </div>
          )}

          {/* 적용 규칙 */}
          {result.matched_rule && (
            <div className="text-[10px] text-stone-400 font-mono bg-stone-50/80 px-2.5 py-1.5 rounded-lg border border-stone-100">
              적용 규칙: {result.matched_rule} ({result.incident_count}건 기반)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AlertSimulate() {
  const today = new Date().toISOString().slice(0, 10);
  const [query, setQuery] = useState('');
  const [date, setDate] = useState(today);
  const [selectedStore, setSelectedStore] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const searchRef = useRef(null);
  const dropdownRef = useRef(null);

  const filtered = query.trim().length === 0 ? [] : STORES_LIST.filter(s => {
    const q = query.toLowerCase();
    return (s['매장명'] || '').toLowerCase().includes(q) || String(s['매장'] || '').includes(q);
  }).slice(0, 20);

  // 외부 클릭 시 드롭다운 닫기
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const selectStore = (s) => {
    setSelectedStore(s);
    setQuery('');
    setShowDropdown(false);
    setResult(null);
    setError(null);
  };

  const clearStore = () => {
    setSelectedStore(null);
    setResult(null);
    setError(null);
  };

  const canSimulate = selectedStore && date && !loading;

  const runSimulate = async () => {
    if (!canSimulate) return;
    setLoading(true); setError(null); setResult(null);
    try {
      const base = import.meta.env.VITE_SIMULATE_URL ?? import.meta.env.VITE_API_BASE ?? '';
      const res = await fetch(`${base}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_code: String(selectedStore['매장']), date }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `HTTP ${res.status}`);
      }
      const data = await res.json();
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="rounded-xl bg-gradient-to-r from-indigo-900 to-indigo-800 p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Sparkles size={18} />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-tight">수동 알림 생성</div>
            <div className="text-xs text-indigo-300 mt-0.5">매장 + 날짜 선택 → AI 안전 가이드 즉시 생성</div>
          </div>
        </div>
      </div>

      {/* 입력 패널 */}
      <Card title="매장 · 날짜 선택" titleIcon={Search}>
        <div className="space-y-4">
          {/* 매장 검색 */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">매장 검색</label>
            {selectedStore ? (
              <div className="flex items-center gap-2 px-3 py-2.5 rounded-lg border border-indigo-200 bg-indigo-50">
                <Building2 size={14} className="text-indigo-500 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <span className="text-sm font-bold text-stone-900">{selectedStore['매장명']}</span>
                  <span className="text-xs text-stone-500 ml-2">{selectedStore['매장']} · {selectedStore['지역']}</span>
                </div>
                <button onClick={clearStore} className="w-6 h-6 rounded-full hover:bg-indigo-100 flex items-center justify-center cursor-pointer text-stone-400">
                  <X size={13} />
                </button>
              </div>
            ) : (
              <div className="relative" ref={dropdownRef}>
                <div className="relative">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400 pointer-events-none" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
                    onFocus={() => query.trim() && setShowDropdown(true)}
                    placeholder="매장명 또는 코드 입력 (예: 강남, 10931)"
                    className="w-full h-9 pl-8 pr-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-indigo-400 placeholder:text-stone-300"
                  />
                </div>
                {showDropdown && filtered.length > 0 && (
                  <ul className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg overflow-hidden max-h-52 overflow-y-auto">
                    {filtered.map((s) => (
                      <li
                        key={s['매장']}
                        onMouseDown={() => selectStore(s)}
                        className="flex items-center gap-2 px-3 py-2.5 hover:bg-stone-50 cursor-pointer border-b border-stone-50 last:border-0"
                      >
                        <MapPin size={12} className="text-stone-400 flex-shrink-0" />
                        <span className="text-sm font-medium text-stone-800 flex-1 truncate">{s['매장명']}</span>
                        <span className="text-[10px] text-stone-400 flex-shrink-0">{s['매장']} · {s['지역']}</span>
                      </li>
                    ))}
                  </ul>
                )}
                {showDropdown && query.trim().length > 0 && filtered.length === 0 && (
                  <div className="absolute z-20 left-0 right-0 top-full mt-1 bg-white border border-stone-200 rounded-xl shadow-lg px-3 py-4 text-xs text-stone-400 text-center">
                    검색 결과가 없습니다
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 날짜 선택 */}
          <div>
            <label className="block text-xs font-semibold text-stone-600 mb-1.5">날짜 선택</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="h-9 px-3 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 bg-white focus:outline-none focus:border-indigo-400 cursor-pointer"
            />
            <span className="ml-2 text-[10px] text-stone-400">과거 날짜: 실제 기상 데이터 · 미래 날짜: 예보 기반</span>
          </div>

          {/* 생성 버튼 */}
          <button
            onClick={runSimulate}
            disabled={!canSimulate}
            className="w-full h-10 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: canSimulate ? "linear-gradient(135deg, #4F46E5, #6366F1)" : undefined, backgroundColor: canSimulate ? undefined : "#E7E5E4", color: canSimulate ? "white" : "#A8A29E" }}
          >
            {loading ? (
              <><RefreshCw size={15} className="animate-spin" /> 안전 가이드 생성 중...</>
            ) : (
              <><Sparkles size={15} /> AI 안전 가이드 생성</>
            )}
          </button>
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-start gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {/* 결과 */}
      {result && (
        <div className="space-y-3">
          {/* 매장 정보 헤더 */}
          <div className="rounded-xl bg-white border border-stone-200 p-4 flex items-start gap-3 flex-wrap">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg font-extrabold text-stone-900">{result.store_name || selectedStore?.['매장명']}</span>
                {result.region && <span className="text-xs px-2 py-0.5 rounded-full bg-stone-100 text-stone-600 border border-stone-200">{result.region}</span>}
                <span className="text-xs px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-200">{date}</span>
              </div>
              {result.weather && (
                <div className="flex gap-3 mt-2 flex-wrap text-xs text-stone-500">
                  <span>최고 {result.weather.temperature_2m_max}°C</span>
                  <span>최저 {result.weather.temperature_2m_min}°C</span>
                  <span>강수 {result.weather.precipitation_sum}mm</span>
                  <span>풍속 {result.weather.wind_speed_10m_max}m/s</span>
                  <span>습도 {result.weather.relative_humidity_2m_mean}%</span>
                </div>
              )}
            </div>
            <span className="flex items-center gap-1 text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-full px-2.5 py-1 font-semibold flex-shrink-0">
              <CheckCircle2 size={12} /> 생성 완료
            </span>
          </div>

          {/* 고객 / 직원 안전 가이드 */}
          {result.results?.cust && (
            <GuideSection type="CUST" label="고객 안전 (CUST)" result={result.results.cust} />
          )}
          {result.results?.emp && (
            <GuideSection type="EMP" label="직원 안전 (EMP)" result={result.results.emp} />
          )}
        </div>
      )}

      {/* 빈 상태 */}
      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center mb-3">
            <Sparkles size={24} className="text-indigo-300" />
          </div>
          <div className="text-sm font-medium text-stone-500">매장을 검색하고 날짜를 선택하세요</div>
          <div className="text-xs mt-1">기상 데이터 + 과거 사고 패턴 기반으로 AI 안전 가이드를 생성합니다</div>
        </div>
      )}
    </div>
  );
}

export default AlertSimulate;

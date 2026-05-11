import { useState, useEffect } from 'react';
import { Bell, Calendar, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, X, AlertTriangle, Info } from 'lucide-react';
import { Card } from '../../shared/Card.jsx';

// 이미지 URL 변환: "images/xxx.png" → frontend S3 기준 절대 경로
const FRONTEND_BASE = import.meta.env.VITE_FRONTEND_URL
  ? import.meta.env.VITE_FRONTEND_URL.replace(/\/$/, '')
  : '';

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  // 상대경로 → frontend S3 URL
  return FRONTEND_BASE ? `${FRONTEND_BASE}/${url}` : `/${url}`;
}

// ─── 상세보기 모달 ───────────────────────────────────────
function DetailModal({ item, onClose }) {
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!item?.detail_key) { setLoading(false); return; }
    const base = import.meta.env.VITE_ALERTS_URL
      ? import.meta.env.VITE_ALERTS_URL.replace(/\/$/, '')
      : `${import.meta.env.VITE_API_BASE ?? ''}/api/alerts`;
    const filename = item.detail_key.split('/').pop();
    fetch(`${base}/${item.date}/${filename}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(d => {
        let parsed = d;
        if (typeof d === 'object' && d !== null && typeof d.body === 'string') {
          try { parsed = JSON.parse(d.body); } catch {}
        }
        setDetail(parsed);
        setLoading(false);
      })
      .catch(e => { setError(e.message); setLoading(false); });
  }, [item]);

  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
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

// ─── 캐러셀 (좌우 화살표 슬라이더) ─────────────────────────
function CaseCarousel({ cases, accentColor }) {
  const [idx, setIdx] = useState(0);
  if (!cases || cases.length === 0) return null;

  const current = cases[idx];
  const imgUrl = resolveImageUrl(current.image_url);
  const canPrev = idx > 0;
  const canNext = idx < cases.length - 1;

  return (
    <div className="space-y-3">
      <div className="text-[11px] font-bold uppercase tracking-wide text-red-700">
        오늘의 주의사항 ({idx + 1}/{cases.length})
      </div>

      {/* 카드 */}
      <div className="relative bg-white rounded-xl border border-stone-200 overflow-hidden">
        {/* 이미지 */}
        <div className="relative w-full aspect-[16/10] bg-stone-100 flex items-center justify-center overflow-hidden">
          {imgUrl ? (
            <img
              src={imgUrl}
              alt={current.incident_id}
              className="w-full h-full object-contain"
              onError={e => { e.target.style.display = 'none'; }}
            />
          ) : (
            <div className="text-stone-300 text-xs flex flex-col items-center gap-1">
              <AlertTriangle size={24} />
              <span>이미지 없음</span>
            </div>
          )}

          {/* 좌우 화살표 */}
          {canPrev && (
            <button
              onClick={() => setIdx(i => i - 1)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer hover:bg-white"
            >
              <ChevronLeft size={16} className="text-stone-700" />
            </button>
          )}
          {canNext && (
            <button
              onClick={() => setIdx(i => i + 1)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer hover:bg-white"
            >
              <ChevronRight size={16} className="text-stone-700" />
            </button>
          )}

          {/* 인디케이터 */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1">
            {cases.map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full transition-all ${i === idx ? 'bg-stone-800 w-3' : 'bg-stone-400/50'}`}
              />
            ))}
          </div>
        </div>

        {/* 텍스트 내용 */}
        <div className="p-4 space-y-2">
          {/* 사고 ID + 재현 가능성 */}
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-mono text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 border border-amber-200">
              {current.incident_id}
            </span>
            {current["오늘_재현_가능성"] && (
              <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                current["오늘_재현_가능성"] === '높음'
                  ? 'bg-red-50 border-red-200 text-red-700'
                  : current["오늘_재현_가능성"] === '중간'
                  ? 'bg-amber-50 border-amber-200 text-amber-700'
                  : 'bg-stone-50 border-stone-200 text-stone-600'
              }`}>
                재현 가능성: {current["오늘_재현_가능성"]}
              </span>
            )}
          </div>

          {/* 사고 내용 */}
          <div className="text-xs font-semibold text-stone-800">
            {current["사고내용"]}
          </div>

          {/* 원인 분석 */}
          {current["사고_원인_분석"] && (
            <div className="text-[11px] text-stone-600 bg-stone-50 rounded-lg px-3 py-2 border border-stone-100 leading-relaxed">
              💡 {current["사고_원인_분석"]}
            </div>
          )}

          {/* 안전 수칙 */}
          {current["수칙"] && (
            <div className="text-[11px] text-white rounded-lg px-3 py-2 leading-relaxed" style={{ background: accentColor }}>
              ☑️ {current["수칙"]}
            </div>
          )}

          {/* 관련 피처 */}
          {current["관련_피처"] && (
            <div className="text-[10px] text-stone-500 font-mono">
              📊 {current["관련_피처"]}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── 가이드 섹션 ─────────────────────────────────────────
function GuideSection({ type, label, result }) {
  const isCust = type === "CUST";
  const accentColor = isCust ? "#0891B2" : "#4F46E5";
  const bgClass = isCust ? "bg-sky-50 border-sky-100" : "bg-indigo-50 border-indigo-100";
  const guide = result?.guide || {};

  // 새 포맷: 오늘의_주의사항 (캐러셀), 부주의_주의사항, 추가_참고
  const todayCases = guide["오늘의_주의사항"] || [];
  const carelessNotes = guide["부주의_주의사항"] || [];
  const additionalNote = guide["추가_참고"] || "";
  const mainRisk = guide["주요_위험유형"] || "";
  const summary = guide["위험_요약"] || "";

  // 구 포맷 하위 호환
  const oldSpecial = guide["오늘의_특별_주의사항"] || [];
  const oldCommon = guide["상시_주의사항"] || [];
  const oldPicks = guide["오늘의_주의_사례"] || [];

  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      {/* 헤더 */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold" style={{ background: accentColor }}>
            {type}
          </div>
          <span className="font-semibold text-stone-800 text-sm">{label}</span>
        </div>
        {mainRisk && (
          <span className="text-[11px] font-semibold text-stone-700 bg-white rounded-full px-2 py-0.5 border border-stone-200">
            {mainRisk}
          </span>
        )}
      </div>

      {/* 위험 요약 */}
      {summary && (
        <div className="text-xs font-semibold text-stone-700 bg-white rounded-lg px-3 py-2 border border-stone-200 mb-3">
          {summary}
        </div>
      )}

      {/* ─── 새 포맷: 오늘의_주의사항 캐러셀 ─── */}
      {todayCases.length > 0 && (
        <CaseCarousel cases={todayCases} accentColor={accentColor} />
      )}

      {/* ─── 구 포맷 하위 호환: 오늘의_특별_주의사항 ─── */}
      {todayCases.length === 0 && oldSpecial.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-red-700 mb-1.5">오늘의 특별 주의사항</div>
          <ul className="space-y-1.5">
            {oldSpecial.map((item, i) => (
              <li key={i} className="bg-white rounded-lg px-3 py-2 border border-red-100">
                <div className="text-xs font-semibold text-stone-800">{item["수칙"]}</div>
                {item["관련_피처"] && <div className="text-[10px] text-red-600 mt-0.5 font-mono">📊 {item["관련_피처"]}</div>}
                {item["근거_사례"] && <div className="text-[10px] text-stone-500 italic mt-0.5">"{item["근거_사례"]}"</div>}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── 부주의 주의사항 ─── */}
      {carelessNotes.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1.5">
            부주의 주의사항
          </div>
          <ul className="space-y-1.5">
            {carelessNotes.map((note, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-stone-700 bg-white rounded-lg px-3 py-2 border border-stone-200">
                <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold bg-stone-500">
                  {i + 1}
                </span>
                <span>{note}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── 구 포맷 하위 호환: 상시_주의사항 ─── */}
      {carelessNotes.length === 0 && oldCommon.length > 0 && (
        <div className="mt-4">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1.5">상시 주의사항</div>
          <ul className="space-y-1">
            {oldCommon.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                <span className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold" style={{ background: accentColor }}>{i + 1}</span>
                <span>{item["수칙"]}{item["근거_사례"] && <span className="text-stone-400 italic ml-1">"{item["근거_사례"]}"</span>}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ─── 추가 참고 ─── */}
      {additionalNote && (
        <div className="mt-4 flex items-start gap-2 text-[11px] text-stone-600 bg-white rounded-lg px-3 py-2.5 border border-stone-200">
          <Info size={13} className="text-stone-400 flex-shrink-0 mt-0.5" />
          <span>{additionalNote}</span>
        </div>
      )}

      {/* 적용 규칙 */}
      {result?.matched_rule && (
        <div className="text-[10px] text-stone-400 font-mono bg-stone-50 px-2 py-1 rounded mt-3">
          적용 규칙: {result.matched_rule}
        </div>
      )}
    </div>
  );
}

// ─── 메인 컴포넌트 ───────────────────────────────────────
function AlertMonitoring() {
  const today = new Date().toISOString().slice(0, 10);
  const [date, setDate] = useState(today);
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);

  const load = async (d) => {
    setLoading(true); setError(null); setResult(null);
    try {
      const base = import.meta.env.VITE_ALERTS_URL
        ? import.meta.env.VITE_ALERTS_URL.replace(/\/$/, '')
        : `${import.meta.env.VITE_API_BASE ?? ''}/api/alerts`;
      const res = await fetch(`${base}/${d}`);
      if (!res.ok) throw new Error(`데이터 없음 (HTTP ${res.status})`);
      const data = await res.json();
      let parsed = data;
      if (typeof data === 'object' && data !== null && typeof data.body === 'string') {
        try { parsed = JSON.parse(data.body); } catch {}
      }
      setResult(Array.isArray(parsed) ? parsed : parsed?.stores || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const handleLoad = () => load(date);
  const filtered = result || [];

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
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="h-8 px-3 rounded-lg border border-stone-200 text-sm font-medium text-stone-700 bg-white focus:outline-none focus:border-stone-400 cursor-pointer" />
          <button onClick={handleLoad} disabled={loading}
            className="h-8 px-4 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1.5 disabled:opacity-50">
            {loading ? <RefreshCw size={12} className="animate-spin" /> : <Bell size={12} />} 조회
          </button>
          {result && <span className="text-xs text-stone-500 ml-auto">{result.length}개 매장 결과</span>}
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {date} 날짜의 배치 결과가 없습니다.
        </div>
      )}

      {/* 테이블 */}
      {result && (
        <Card title="매장별 알림 결과" titleIcon={Bell}>
          <div className="overflow-x-auto -mx-5 px-5">
            <table className="w-full min-w-[600px] text-sm">
              <thead>
                <tr className="border-b-2 border-stone-100 text-xs text-stone-400 uppercase">
                  <th className="text-left py-2 px-2 font-semibold">매장</th>
                  <th className="text-left py-2 px-2 font-semibold">지역</th>
                  <th className="text-center py-2 px-2 font-semibold">발송 유형</th>
                  <th className="text-left py-2 px-2 font-semibold">주요 위험유형 (고객)</th>
                  <th className="text-left py-2 px-2 font-semibold">주요 위험유형 (직원)</th>
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
                      {s.trigger_type === 'batch'
                        ? <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 border border-indigo-200 text-indigo-700">⏰ 배치</span>
                        : <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-stone-100 border border-stone-200 text-stone-600">✋ 수동</span>
                      }
                    </td>
                    <td className="py-2.5 px-2 text-xs text-stone-700">{s["주요_위험유형_cust"] || s.dominant_type_cust || "—"}</td>
                    <td className="py-2.5 px-2 text-xs text-stone-700">{s["주요_위험유형_emp"] || s.dominant_type_emp || "—"}</td>
                    <td className="py-2.5 px-2 text-center">
                      <button onClick={() => setSelectedItem(s)}
                        className="w-7 h-7 rounded-lg bg-stone-100 hover:bg-stone-200 flex items-center justify-center cursor-pointer text-stone-500 mx-auto">
                        <ChevronRight size={12} />
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-10 text-center text-stone-400 text-xs">조회된 매장이 없습니다.</td></tr>
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

import { useState, useEffect } from 'react';
import { Bell, Calendar, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, X, AlertTriangle, Search, Menu, ArrowLeft } from 'lucide-react';
import { Card } from '../../shared/Card.jsx';

// 이미지 URL 변환
const FRONTEND_BASE = import.meta.env.VITE_FRONTEND_URL
  ? import.meta.env.VITE_FRONTEND_URL.replace(/\/$/, '')
  : '';

function resolveImageUrl(url) {
  if (!url) return null;
  if (url.startsWith('http')) return url;
  return FRONTEND_BASE ? `${FRONTEND_BASE}/${url}` : `/${url}`;
}

// ─── 카카오톡 채팅창 스타일 ──────────────────────────────
function KakaoChat({ channelName, profileEmoji, storeName, date, summary, mainRisk, cases, carelessNotes, additionalNote }) {
  const [idx, setIdx] = useState(0);
  const hasCases = cases && cases.length > 0;
  const current = hasCases ? cases[idx] : null;
  const imgUrl = current ? resolveImageUrl(current.image_url) : null;
  const canPrev = idx > 0;
  const canNext = hasCases && idx < cases.length - 1;

  // 날짜 한글 포맷
  const dateObj = date ? new Date(date) : new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dateLabel = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 ${days[dateObj.getDay()]}요일`;

  return (
    <div className="w-full max-w-[380px] mx-auto rounded-[24px] overflow-hidden shadow-xl" style={{ background: '#9DC6C2' }}>
      {/* 카카오톡 헤더 */}
      <div className="bg-[#9DC6C2] px-3 pt-3 pb-2">
        <div className="flex items-center gap-2">
          <ArrowLeft size={20} className="text-stone-800" />
          <div className="w-9 h-9 rounded-full bg-white shadow-sm flex items-center justify-center text-lg flex-shrink-0">
            {profileEmoji}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-bold text-stone-900 truncate flex items-center gap-1">
              {channelName}
              <span className="inline-block w-3 h-3 rounded-full bg-yellow-400 text-[8px] flex items-center justify-center">✓</span>
            </div>
            <div className="text-[10px] text-stone-700 truncate">안전보건팀 (safety@daiso.co.kr) ⌄</div>
          </div>
          <Search size={18} className="text-stone-700" />
          <Menu size={18} className="text-stone-700" />
        </div>
      </div>

      {/* 날짜 구분선 */}
      <div className="px-4 py-2 bg-[#9DC6C2] text-center">
        <span className="inline-block text-[10px] text-white font-semibold bg-stone-700/30 rounded-full px-2.5 py-0.5">
          {dateLabel} &gt;
        </span>
      </div>

      {/* 채팅 메시지 영역 */}
      <div className="bg-[#9DC6C2] px-3 pb-3">
        <div className="flex items-start gap-2">
          {/* 봉투 아이콘 */}
          <div className="w-9 h-9 rounded-full bg-amber-300 flex-shrink-0 flex items-center justify-center text-lg shadow-sm mt-1">
            📮
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-stone-700 mb-1">(광고) 오늘의 안전 가이드</div>

            {/* 카드 말풍선 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-md">
              {/* 제목 */}
              <div className="px-4 pt-4 pb-2">
                <div className="text-[15px] font-extrabold text-stone-900">
                  오늘 주의! 🚨 매장 안전 가이드
                </div>
              </div>

              {/* 메인 이미지 캐러셀 */}
              {hasCases && (
                <div className="relative w-full bg-stone-100 aspect-[4/3]">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt={current.incident_id}
                      className="w-full h-full object-cover"
                      onError={e => { e.target.style.visibility = 'hidden'; }}
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-300 text-xs flex-col gap-1">
                      <AlertTriangle size={24} />
                      <span>이미지 준비 중</span>
                    </div>
                  )}

                  {/* 좌우 화살표 */}
                  {canPrev && (
                    <button onClick={() => setIdx(i => i - 1)}
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer hover:bg-white">
                      <ChevronLeft size={16} className="text-stone-700" />
                    </button>
                  )}
                  {canNext && (
                    <button onClick={() => setIdx(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/90 shadow flex items-center justify-center cursor-pointer hover:bg-white">
                      <ChevronRight size={16} className="text-stone-700" />
                    </button>
                  )}

                  {/* 하단 오버레이: 사고 내용 */}
                  <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent pt-8 pb-3 px-4">
                    <div className="text-white text-[13px] font-bold leading-tight drop-shadow-lg">
                      {current["사고내용"]}
                    </div>
                  </div>

                  {/* 인디케이터 */}
                  <div className="absolute top-2 right-2 bg-black/50 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                    {idx + 1} / {cases.length}
                  </div>
                </div>
              )}

              {/* 사례 상세 */}
              {hasCases && (
                <div className="px-4 py-3 border-b border-stone-100">
                  <div className="flex items-center gap-1.5 mb-2">
                    <span className="text-[10px] font-mono text-amber-700 bg-amber-50 rounded px-1.5 py-0.5 border border-amber-200">
                      {current.incident_id}
                    </span>
                    {current["오늘_재현_가능성"] && (
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${
                        current["오늘_재현_가능성"] === '높음' ? 'bg-red-50 border-red-200 text-red-700'
                          : current["오늘_재현_가능성"] === '중간' ? 'bg-amber-50 border-amber-200 text-amber-700'
                          : 'bg-stone-50 border-stone-200 text-stone-600'
                      }`}>
                        재현 {current["오늘_재현_가능성"]}
                      </span>
                    )}
                  </div>

                  {current["수칙"] && (
                    <div className="text-[12px] text-stone-800 leading-relaxed">
                      <span className="font-bold">✅ </span>
                      {current["수칙"]}
                    </div>
                  )}
                </div>
              )}

              {/* 매장 정보 + 기상 */}
              <div className="px-4 py-3 space-y-2.5">
                <div className="flex items-start gap-2.5">
                  <div className="w-10 h-10 rounded-lg bg-stone-100 flex items-center justify-center text-lg flex-shrink-0">
                    🏪
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-stone-900">{storeName}</div>
                    <div className="text-[11px] text-stone-500">{date} · 오늘의 안전 알림</div>
                  </div>
                </div>

                {summary && (
                  <div className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center text-lg flex-shrink-0">
                      ⚠️
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-red-700 mb-0.5">오늘의 위험</div>
                      <div className="text-[11px] text-stone-700 leading-snug">
                        {mainRisk || summary}
                      </div>
                    </div>
                  </div>
                )}

                {/* 부주의 주의사항 (최대 2개 미리보기) */}
                {carelessNotes && carelessNotes.slice(0, 2).map((note, i) => (
                  <div key={i} className="flex items-start gap-2.5">
                    <div className="w-10 h-10 rounded-lg bg-amber-50 flex items-center justify-center text-lg flex-shrink-0">
                      📌
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-bold text-stone-900 mb-0.5">상시 주의 {i + 1}</div>
                      <div className="text-[11px] text-stone-700 leading-snug line-clamp-2">
                        {note}
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              {/* 자세히 보기 버튼 */}
              <div className="border-t border-stone-100">
                <button className="w-full py-3 text-[13px] font-semibold text-stone-700 hover:bg-stone-50">
                  자세히 보기
                </button>
              </div>
            </div>

            {/* 말풍선 아래 시간 */}
            <div className="text-[10px] text-stone-600 mt-1 ml-1">오전 9:00</div>
          </div>
        </div>

        {/* 부주의 주의사항 전체 (확장) */}
        {carelessNotes && carelessNotes.length > 0 && (
          <div className="mt-4 ml-11">
            <details className="bg-white/70 rounded-xl overflow-hidden">
              <summary className="px-3 py-2 text-[11px] font-semibold text-stone-700 cursor-pointer hover:bg-white">
                📌 상시 부주의 주의사항 전체 ({carelessNotes.length}건)
              </summary>
              <div className="px-3 py-2 bg-white border-t border-stone-100">
                <ul className="space-y-1.5">
                  {carelessNotes.map((note, i) => (
                    <li key={i} className="text-[11px] text-stone-700 leading-relaxed flex items-start gap-1.5">
                      <span className="text-stone-400 font-bold flex-shrink-0">{i + 1}.</span>
                      <span>{note}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </details>
          </div>
        )}

        {/* 원인 분석 */}
        {current && current["사고_원인_분석"] && (
          <div className="mt-2 ml-11">
            <details className="bg-white/70 rounded-xl overflow-hidden">
              <summary className="px-3 py-2 text-[11px] font-semibold text-stone-700 cursor-pointer hover:bg-white">
                💡 현재 사례의 원인 분석
              </summary>
              <div className="px-3 py-2 bg-white border-t border-stone-100 text-[11px] text-stone-700 leading-relaxed">
                {current["사고_원인_분석"]}
                {current["관련_피처"] && (
                  <div className="mt-1 text-[10px] text-stone-400 font-mono">
                    📊 {current["관련_피처"]}
                  </div>
                )}
              </div>
            </details>
          </div>
        )}

        {/* 추가 참고 */}
        {additionalNote && (
          <div className="mt-2 ml-11 text-[10px] text-stone-600 bg-white/70 rounded-xl px-3 py-2 leading-relaxed">
            ℹ️ {additionalNote}
          </div>
        )}
      </div>

      {/* 하단 입력창 (장식) */}
      <div className="bg-white border-t border-stone-200">
        <div className="px-3 py-2 text-center text-[11px] font-semibold text-stone-400 border-b border-stone-100">
          채널 메뉴 ⌃
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5">
          <div className="w-6 h-6 rounded-full bg-stone-200 flex items-center justify-center text-stone-400 text-xs">+</div>
          <div className="flex-1 text-[11px] text-stone-300">챗봇에게 메시지 입력</div>
        </div>
      </div>
    </div>
  );
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
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-stone-50 rounded-2xl shadow-2xl w-full max-w-5xl max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="sticky top-0 bg-white border-b border-stone-200 px-5 py-4 flex items-center justify-between rounded-t-2xl z-10">
          <div>
            <div className="font-bold text-stone-900 text-base">{item.store_name}</div>
            <div className="text-xs text-stone-500 mt-0.5">{item.region} · {item.date}</div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center cursor-pointer text-stone-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {loading && (
            <div className="flex items-center justify-center py-10 text-stone-400">
              <RefreshCw size={16} className="animate-spin mr-2" /> 상세 데이터 로딩 중...
            </div>
          )}
          {error && (
            <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 rounded-lg p-3">
              <AlertCircle size={14} /> {error}
            </div>
          )}
          {detail && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 justify-items-center">
              {detail.results?.cust && (
                <KakaoChat
                  channelName="다이소 안전 알림"
                  profileEmoji="🛡️"
                  storeName={detail.store_name}
                  date={detail.date}
                  summary={detail.results.cust.guide?.["위험_요약"]}
                  mainRisk={detail.results.cust.guide?.["주요_위험유형"]}
                  cases={detail.results.cust.guide?.["오늘의_주의사항"] || []}
                  carelessNotes={detail.results.cust.guide?.["부주의_주의사항"] || []}
                  additionalNote={detail.results.cust.guide?.["추가_참고"] || ""}
                />
              )}

              {detail.results?.emp && (
                <KakaoChat
                  channelName="다이소 안전 알림"
                  profileEmoji="👷"
                  storeName={detail.store_name}
                  date={detail.date}
                  summary={detail.results.emp.guide?.["위험_요약"]}
                  mainRisk={detail.results.emp.guide?.["주요_위험유형"]}
                  cases={detail.results.emp.guide?.["오늘의_주의사항"] || []}
                  carelessNotes={detail.results.emp.guide?.["부주의_주의사항"] || []}
                  additionalNote={detail.results.emp.guide?.["추가_참고"] || ""}
                />
              )}
            </div>
          )}
        </div>
      </div>
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

      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {date} 날짜의 배치 결과가 없습니다.
        </div>
      )}

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

      {!result && !loading && !error && (
        <div className="flex flex-col items-center justify-center py-16 text-stone-400">
          <div className="w-14 h-14 rounded-2xl bg-stone-100 flex items-center justify-center mb-3">
            <Bell size={24} className="text-stone-300" />
          </div>
          <div className="text-sm font-medium">날짜를 선택하고 조회 버튼을 눌러주세요</div>
          <div className="text-xs mt-1">배치 실행 결과가 있는 날짜만 조회됩니다</div>
        </div>
      )}

      {selectedItem && <DetailModal item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

export default AlertMonitoring;

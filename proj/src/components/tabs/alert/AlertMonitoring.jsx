import { useState, useEffect } from 'react';
import { Bell, Calendar, AlertCircle, ChevronRight, ChevronLeft, RefreshCw, X, AlertTriangle, Search, Menu, ArrowLeft, Home, ChevronDown, Send } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Line } from 'recharts';
import { Card } from '../../shared/Card.jsx';

// 이미지 URL 변환
const FRONTEND_BASE = import.meta.env.VITE_FRONTEND_URL
  ? import.meta.env.VITE_FRONTEND_URL.replace(/\/$/, '')
  : '';

const GUIDE_BASE = import.meta.env.VITE_FRONTEND_URL
  ? import.meta.env.VITE_FRONTEND_URL.replace(/\/$/, '')
  : '';

function guideUrl(date, storeCode) {
  return `${GUIDE_BASE}/guide/${date}/${storeCode}.html`;
}

function resolveImageUrl(url) {
  if (!url) return null;
  const value = String(url).trim();
  if (!value || ['nan', 'none', 'null'].includes(value.toLowerCase())) return null;
  if (value.startsWith('http')) return value;

  let path = value.replace(/^\/+/, '');
  if (path.startsWith('frontend/')) path = path.replace(/^frontend\//, '');
  if (!path.startsWith('images/')) path = `images/${path}`;
  return FRONTEND_BASE ? `${FRONTEND_BASE}/${path}` : `/${path}`;
}

// ─── 카카오톡 채팅창 스타일 ──────────────────────────────
function KakaoChat({ channelName, channelEmail, storeName, date, cases, showImages = true }) {
  const [idx, setIdx] = useState(0);
  const hasCases = cases && cases.length > 0;
  const currentIdx = hasCases ? Math.min(idx, cases.length - 1) : 0;
  const current = hasCases ? cases[currentIdx] : null;
  const imgUrl = showImages && current ? resolveImageUrl(current.image_url) : null;
  const canPrev = currentIdx > 0;
  const canNext = hasCases && currentIdx < cases.length - 1;

  useEffect(() => {
    if (!hasCases || idx < cases.length) return;
    setIdx(0);
  }, [cases, hasCases, idx]);

  // 날짜 한글 포맷
  const dateObj = date ? new Date(date) : new Date();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  const dateLabel = `${dateObj.getFullYear()}년 ${dateObj.getMonth() + 1}월 ${dateObj.getDate()}일 ${days[dateObj.getDay()]}요일`;

  return (
    <div className="w-full max-w-[380px] mx-auto rounded-[28px] overflow-hidden shadow-xl" style={{ background: '#9DC6C2' }}>
      {/* 카카오톡 헤더 */}
      <div className="px-3 pt-4 pb-2 bg-[#9DC6C2]">
        <div className="flex items-center gap-2">
          <ArrowLeft size={22} className="text-stone-800" strokeWidth={2.5} />
          <div className="flex-1 min-w-0">
            <div className="text-[14px] font-extrabold text-stone-900 truncate flex items-center gap-1">
              {channelName}
              <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-yellow-400 text-[9px] font-bold text-white">✓</span>
            </div>
            <div className="text-[11px] text-stone-700 truncate flex items-center gap-0.5">
              {channelEmail}
              <ChevronDown size={12} />
            </div>
          </div>
          <Search size={20} className="text-stone-700" strokeWidth={2.2} />
          <Menu size={20} className="text-stone-700" strokeWidth={2.2} />
        </div>
      </div>

      {/* 날짜 구분선 */}
      <div className="py-2.5 bg-[#9DC6C2] text-center">
        <span className="inline-flex items-center gap-1 text-[11px] text-white font-semibold bg-stone-800/20 rounded-full px-3 py-1">
          {dateLabel}
          <ChevronRight size={10} />
        </span>
      </div>

      {/* 채팅 메시지 영역 */}
      <div className="bg-[#9DC6C2] px-3 pb-4">
        <div className="flex items-start gap-2">
          {/* 봉투 아이콘 */}
          <div className="w-10 h-10 rounded-2xl bg-[#f7d24b] flex-shrink-0 flex items-center justify-center shadow-sm">
            <Bell size={19} className="text-stone-900" strokeWidth={2.4} />
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-stone-700 mb-1 ml-0.5">(광고) 오늘의 안전 가이드</div>

            {/* 하나의 카드 말풍선 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-md">
              {/* 제목 */}
              <div className="px-4 pt-4 pb-3 border-b border-stone-100">
                <div className="text-[17px] font-extrabold text-stone-950 leading-tight">
                  매장 안전 가이드
                </div>
                <div className="mt-3 flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center flex-shrink-0">
                    <Home size={17} className="text-stone-700" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-extrabold text-stone-900 truncate">{storeName}</div>
                    <div className="text-[11px] font-medium text-stone-500">{dateLabel}</div>
                  </div>
                </div>
              </div>

              {/* 이미지 캐러셀 (원본 그대로, 오버레이 텍스트 없음) */}
              {hasCases && showImages && (
                <div className="relative w-full bg-stone-100 aspect-[4/3]">
                  {imgUrl ? (
                    <img
                      src={imgUrl}
                      alt=""
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
                      className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow flex items-center justify-center cursor-pointer hover:bg-white">
                      <ChevronLeft size={16} className="text-stone-700" />
                    </button>
                  )}
                  {canNext && (
                    <button onClick={() => setIdx(i => i + 1)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/95 shadow flex items-center justify-center cursor-pointer hover:bg-white">
                      <ChevronRight size={16} className="text-stone-700" />
                    </button>
                  )}

                  {/* 페이지 인디케이터 */}
                  <div className="absolute top-2 right-2 bg-black/60 text-white text-[10px] font-bold rounded-full px-2 py-0.5">
                    {currentIdx + 1} / {cases.length}
                  </div>
                </div>
              )}

              {/* 사고 내용 + 안전 수칙 (이미지 아래) */}
              {hasCases && (
                <div className="px-4 py-4 space-y-3">
                  <div className="text-[11px] font-bold text-stone-500">유사 사고 사례</div>
                  <div className="text-[16px] font-extrabold text-stone-950 leading-snug">
                    {current["사고내용"]}
                  </div>
                  {current["수칙"] && (
                    <div className="rounded-xl bg-stone-50 px-3 py-3 text-[13px] font-medium text-stone-800 leading-relaxed border border-stone-100">
                      <span className="block mb-1 text-[11px] font-extrabold text-stone-500">안전 조치</span>
                      {current["수칙"]}
                    </div>
                  )}
                  {!showImages && cases.length > 1 && (
                    <div className="flex items-center justify-between pt-1">
                      <button
                        onClick={() => setIdx(i => Math.max(0, i - 1))}
                        disabled={!canPrev}
                        className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <div className="text-[12px] font-bold text-stone-500">{currentIdx + 1} / {cases.length}</div>
                      <button
                        onClick={() => setIdx(i => Math.min(cases.length - 1, i + 1))}
                        disabled={!canNext}
                        className="w-8 h-8 rounded-full border border-stone-200 flex items-center justify-center text-stone-700 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-stone-50"
                      >
                        <ChevronRight size={16} />
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* 하단 버튼 */}
              <div className="border-t border-stone-100">
                <button
                  onClick={() => {
                    if (!hasCases || cases.length < 2) return;
                    setIdx(i => (i + 1) % cases.length);
                  }}
                  className="w-full py-3 text-[13px] font-bold text-stone-800 hover:bg-stone-50"
                >
                  {hasCases && cases.length > 1 ? '다음 사례 보기' : '사례 더 보기'}
                </button>
              </div>
            </div>

            {/* 말풍선 아래 시간 */}
            <div className="text-[10px] text-stone-600 mt-1 ml-1">
              수신거부 | 홈 &gt; 채널 차단
            </div>
            <div className="text-[10px] text-stone-600 ml-1">오전 9:00</div>
          </div>

          {/* 홈 버튼 */}
          <div className="w-9 h-9 rounded-full bg-white shadow-md flex items-center justify-center flex-shrink-0 self-end mb-8">
            <Home size={16} className="text-stone-600" />
          </div>
        </div>
      </div>

      {/* 하단 입력창 (장식) */}
      <div className="bg-[#9DC6C2]">
        <div className="bg-yellow-400 text-center py-2.5 text-[13px] font-bold text-stone-900">
          채널 메뉴 ⌃
        </div>
        <div className="flex items-center gap-2 px-3 py-2.5 bg-white">
          <div className="w-7 h-7 rounded-full bg-stone-100 flex items-center justify-center text-stone-500 text-sm">+</div>
          <div className="flex-1 text-[12px] text-stone-400">챗봇에게 메시지 입력</div>
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
            <div className="text-xs text-stone-500 mt-0.5 flex items-center gap-1.5">
              <span>{item.region} · {item.date}</span>
              {item.sent_at && (
                <span className="text-xs text-slate-400">{item.sent_at.slice(11, 16)}</span>
              )}
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center cursor-pointer text-stone-500">
            <X size={16} />
          </button>
        </div>

        <div className="p-5">
          {item.recipients && item.recipients.length > 0 && (
            <div className="mb-4 px-1">
              <p className="text-xs font-semibold text-slate-600 mb-1">수신자 ({item.recipients.length}명)</p>
              <div className="space-y-1">
                {item.recipients.map((r, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-slate-700">
                    <span className="font-medium">{r.name || '수신자' + (i + 1)}</span>
                    {r.role && <span className="text-slate-400">·</span>}
                    {r.role && <span className="text-slate-500">{r.role}</span>}
                    {r.team && <span className="text-slate-400">·</span>}
                    {r.team && <span className="text-slate-500">{r.team}</span>}
                    {r.store_name && <span className="text-slate-400">·</span>}
                    {r.store_name && <span className="text-slate-500">{r.store_name}</span>}
                  </div>
                ))}
              </div>
            </div>
          )}
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
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 justify-items-center items-start">
              {detail.results?.cust && (
                <KakaoChat
                  channelName="다이소 고객 안전 알림"
                  channelEmail="safety@daiso.co.kr"
                  storeName={detail.store_name}
                  date={detail.date}
                  cases={detail.results.cust.guide?.["오늘의_주의사항"] || []}
                  showImages={false}
                />
              )}

              {detail.results?.emp && (
                <KakaoChat
                  channelName="다이소 직원 안전 알림"
                  channelEmail="safety@daiso.co.kr"
                  storeName={detail.store_name}
                  date={detail.date}
                  cases={detail.results.emp.guide?.["오늘의_주의사항"] || []}
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
function AlertMonitoring({ initialDate, onSendRequest }) {
  const [date, setDate] = useState(() => {
    const d = new window.Date();
    return d.toISOString().slice(0, 10);
  });
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selectedItem, setSelectedItem] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [activeFilter, setActiveFilter] = useState('all');
  const [showTrend, setShowTrend] = useState(false);
  const [trendData, setTrendData] = useState(null);
  const [trendLoading, setTrendLoading] = useState(false);

  const load = async (d) => {
    setLoading(true); setError(null); setResult(null); setActiveFilter('all');
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

  const loadTrend = async (days = 7) => {
    setTrendLoading(true);
    setTrendData(null);
    const base = import.meta.env.VITE_ALERTS_URL
      ? import.meta.env.VITE_ALERTS_URL.replace(/\/$/, '')
      : `${import.meta.env.VITE_API_BASE ?? ''}/api/alerts`;

    const dates = Array.from({ length: days }, (_, i) => {
      const d = new Date(date);
      d.setDate(d.getDate() - (days - 1 - i));
      return d.toISOString().slice(0, 10);
    });

    const results = await Promise.all(
      dates.map(d =>
        fetch(`${base}/${d}`)
          .then(r => r.ok ? r.json() : null)
          .then(data => {
            if (!data) return { date: d, total: 0, sent: 0, failed: 0, high: 0, successRate: 0 };
            let parsed = data;
            if (typeof data === 'object' && data !== null && typeof data.body === 'string') {
              try { parsed = JSON.parse(data.body); } catch {}
            }
            const stores = Array.isArray(parsed) ? parsed : (parsed?.stores || []);
            const total = stores.length;
            const sent = stores.filter(s => s.delivery_status === 'sent').length;
            const failed = stores.filter(s => s.delivery_status === 'failed').length;
            const high = stores.filter(s => s.risk_score >= 0.7).length;
            const successRate = total > 0 ? Math.round(sent / total * 100) : 0;
            const label = d.slice(5).replace('-', '/');
            return { date: d, label, total, sent, failed, high, successRate };
          })
          .catch(() => {
            const label = d.slice(5).replace('-', '/');
            return { date: d, label, total: 0, sent: 0, failed: 0, high: 0, successRate: 0 };
          })
      )
    );
    setTrendData(results);
    setTrendLoading(false);
  };

  // Sync with initialDate prop
  useEffect(() => {
    if (initialDate) setDate(initialDate);
  }, [initialDate]);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => setRefreshTick(t => t + 1), 30000);
    return () => clearInterval(id);
  }, [date]);

  // Reload when refreshTick increments (only if a result already loaded)
  useEffect(() => {
    if (refreshTick === 0) return;
    load(date);
  }, [refreshTick]);

  const filtered = (result || []).filter(s => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'high') return s.risk_score >= 0.7;
    if (activeFilter === 'medium') return s.risk_score >= 0.4 && s.risk_score < 0.7;
    if (activeFilter === 'low') return (s.risk_score ?? 0) < 0.4;
    if (activeFilter === 'failed') return s.delivery_status === 'failed';
    return true;
  });

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
          {onSendRequest && (
            <button
              onClick={onSendRequest}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer ml-auto"
            >
              <Send size={13} /> 새 알림 발송
            </button>
          )}
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

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            if (!showTrend) { setShowTrend(true); loadTrend(7); }
            else setShowTrend(false);
          }}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
            showTrend
              ? 'bg-stone-900 text-white border-stone-900'
              : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
          }`}
        >
          📈 주간 트렌드
        </button>
        {showTrend && (
          <div className="flex gap-1">
            {[7, 14].map(d => (
              <button
                key={d}
                onClick={() => loadTrend(d)}
                className="px-2.5 py-1 rounded-full text-[11px] font-bold border border-stone-200 bg-white text-stone-500 hover:border-stone-400 cursor-pointer"
              >
                {d}일
              </button>
            ))}
          </div>
        )}
      </div>

      {showTrend && (
        <Card title="주간 알림 트렌드" titleIcon={Bell}>
          {trendLoading && (
            <div className="flex items-center justify-center py-10 text-stone-400">
              <RefreshCw size={14} className="animate-spin mr-2" /> 트렌드 데이터 로딩 중...
            </div>
          )}
          {trendData && !trendLoading && (
            <div className="space-y-4">
              <div>
                <div className="text-[11px] font-bold text-stone-400 mb-2">발송 현황 (매장 수)</div>
                <ResponsiveContainer width="100%" height={160}>
                  <ComposedChart data={trendData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7e5e4" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 10, fill: '#78716c' }} axisLine={false} tickLine={false} allowDecimals={false} />
                    <Tooltip
                      contentStyle={{ borderRadius: 10, border: '1px solid #e7e5e4', fontSize: 11 }}
                      formatter={(value, name) => [value, name === 'total' ? '총 발송' : name === 'high' ? '고위험' : '실패']}
                      labelFormatter={label => `${label} 날짜`}
                    />
                    <Bar dataKey="total" name="total" fill="#d6d3d1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Bar dataKey="high" name="high" fill="#fca5a5" radius={[4, 4, 0, 0]} maxBarSize={32} />
                    <Line type="monotone" dataKey="successRate" name="성공률(%)" stroke="#34d399" strokeWidth={2} dot={{ r: 3, fill: '#34d399' }} yAxisId={0} />
                  </ComposedChart>
                </ResponsiveContainer>
                <div className="flex gap-4 justify-center mt-1">
                  {[
                    { color: '#d6d3d1', label: '총 발송' },
                    { color: '#fca5a5', label: '고위험' },
                    { color: '#34d399', label: '성공률(%)' },
                  ].map(({ color, label }) => (
                    <div key={label} className="flex items-center gap-1">
                      <div className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
                      <span className="text-[10px] text-stone-500">{label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-4 gap-2 pt-2 border-t border-stone-100">
                {(() => {
                  const total = trendData.reduce((s, d) => s + d.total, 0);
                  const sent = trendData.reduce((s, d) => s + d.sent, 0);
                  const high = trendData.reduce((s, d) => s + d.high, 0);
                  const failed = trendData.reduce((s, d) => s + d.failed, 0);
                  return [
                    { label: '총 발송', value: total, color: 'text-stone-900' },
                    { label: '성공', value: sent, sub: total > 0 ? Math.round(sent / total * 100) + '%' : '-', color: 'text-emerald-700' },
                    { label: '고위험', value: high, color: 'text-red-600' },
                    { label: '실패', value: failed, color: 'text-stone-400' },
                  ].map(({ label, value, sub, color }) => (
                    <div key={label} className="text-center">
                      <div className={`text-base font-extrabold tabular-nums ${color}`}>{value}</div>
                      {sub && <div className="text-[10px] text-stone-400">{sub}</div>}
                      <div className="text-[10px] text-stone-400 mt-0.5">{label}</div>
                    </div>
                  ));
                })()}
              </div>
            </div>
          )}
        </Card>
      )}

      {result && (
        <div className="grid grid-cols-4 gap-2">
          {[
            { label: "총 발송", value: result.length, color: "text-stone-900", bg: "bg-white" },
            {
              label: "성공",
              value: result.filter(s => s.delivery_status === 'sent').length,
              sub: result.length > 0
                ? Math.round(result.filter(s => s.delivery_status === 'sent').length / result.length * 100) + '%'
                : '0%',
              color: "text-emerald-700", bg: "bg-emerald-50"
            },
            {
              label: "고위험",
              value: result.filter(s => s.risk_score >= 0.7).length,
              color: "text-red-700", bg: "bg-red-50"
            },
            {
              label: "실패",
              value: result.filter(s => s.delivery_status === 'failed').length,
              color: "text-stone-500", bg: "bg-stone-50"
            },
          ].map(({ label, value, sub, color, bg }) => (
            <div key={label} className={`rounded-xl ${bg} border border-stone-100 p-3 text-center`}>
              <div className={`text-xl font-extrabold tabular-nums ${color}`}>{value}</div>
              {sub && <div className="text-[10px] text-stone-400 font-semibold">{sub}</div>}
              <div className="text-[10px] text-stone-500 mt-0.5 font-semibold">{label}</div>
            </div>
          ))}
        </div>
      )}

      {result && (
        <div className="flex gap-2 flex-wrap">
          {[
            { id: 'all', label: '전체' },
            { id: 'high', label: '고위험' },
            { id: 'medium', label: '중위험' },
            { id: 'low', label: '저위험' },
            { id: 'failed', label: '실패' },
          ].map(f => (
            <button
              key={f.id}
              onClick={() => setActiveFilter(f.id)}
              className={`px-3 py-1 rounded-full text-xs font-bold border transition-colors cursor-pointer ${
                activeFilter === f.id
                  ? 'bg-stone-900 text-white border-stone-900'
                  : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
              }`}
            >
              {f.label}
              {result && (
                <span className="ml-1.5 opacity-60">
                  {f.id === 'all' ? result.length
                    : f.id === 'high' ? result.filter(s => s.risk_score >= 0.7).length
                    : f.id === 'medium' ? result.filter(s => s.risk_score >= 0.4 && s.risk_score < 0.7).length
                    : f.id === 'low' ? result.filter(s => (s.risk_score ?? 0) < 0.4).length
                    : result.filter(s => s.delivery_status === 'failed').length}
                </span>
              )}
            </button>
          ))}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {date} 날짜의 배치 결과가 없습니다.
        </div>
      )}

      {result && (
        <Card title="매장별 알림 결과" titleIcon={Bell}>
          <div className="space-y-2">
            {filtered.map((s, i) => {
              const riskColor = s.risk_score >= 0.7 ? 'border-l-red-500' : s.risk_score >= 0.4 ? 'border-l-amber-500' : 'border-l-emerald-500';
              const riskBg = s.risk_score >= 0.7 ? 'bg-red-50' : s.risk_score >= 0.4 ? 'bg-amber-50' : 'bg-emerald-50';
              const riskText = s.risk_score >= 0.7 ? 'text-red-700' : s.risk_score >= 0.4 ? 'text-amber-700' : 'text-emerald-700';
              const riskLabel = s.risk_score >= 0.7 ? '고위험' : s.risk_score >= 0.4 ? '중위험' : '저위험';
              return (
                <div
                  key={s.store_code + i}
                  className={`dash-slide-up rounded-xl border border-stone-100 border-l-4 ${riskColor} bg-white shadow-sm hover:shadow-md transition-shadow p-4 cursor-pointer`}
                  style={{ animationDelay: `${Math.min(i * 40, 400)}ms` }}
                  onClick={() => setSelectedItem(s)}
                >
                  <div className="flex items-start justify-between gap-3">
                    {/* 왼쪽: 매장 정보 */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-stone-900 text-sm">{s.store_name}</span>
                        <span className="text-[10px] text-stone-400">{s.store_code}</span>
                        {s.trigger === 'batch_auto'
                          ? <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-100 text-amber-800">자동발송</span>
                          : <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700">수동발송</span>
                        }
                        {s.delivery_status === 'sent'
                          ? <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 border border-emerald-200 text-emerald-700">✓ 발송 성공</span>
                          : s.delivery_status === 'failed'
                            ? <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-50 border border-red-200 text-red-700">✗ 발송 실패</span>
                            : null
                        }
                      </div>
                      <div className="text-[11px] text-stone-500 mt-1">{s.region}</div>
                      {/* 위험유형 */}
                      <div className="flex gap-3 mt-2 flex-wrap">
                        {(s["주요_위험유형_cust"] || s.dominant_type_cust) && (
                          <div className="text-[11px]">
                            <span className="font-semibold text-sky-600">고객 </span>
                            <span className="text-stone-600">{s["주요_위험유형_cust"] || s.dominant_type_cust}</span>
                          </div>
                        )}
                        {(s["주요_위험유형_emp"] || s.dominant_type_emp) && (
                          <div className="text-[11px]">
                            <span className="font-semibold text-indigo-600">직원 </span>
                            <span className="text-stone-600">{s["주요_위험유형_emp"] || s.dominant_type_emp}</span>
                          </div>
                        )}
                      </div>
                      {/* 수신자 */}
                      {(s.sent_recipients?.length > 0 || s.failed_recipients?.length > 0) && (
                        <div className="mt-1.5 text-[11px]">
                          {s.sent_recipients?.length > 0 && (
                            <span className="text-emerald-700">성공: {s.sent_recipients.join(', ')} </span>
                          )}
                          {s.failed_recipients?.length > 0 && (
                            <span className="text-red-600">실패: {s.failed_recipients.join(', ')}</span>
                          )}
                        </div>
                      )}
                    </div>
                    {/* 오른쪽: 위험도 + 상세 버튼 */}
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      {s.risk_score != null && (
                        <div className="flex flex-col items-end gap-1">
                          <span className={`px-2.5 py-1 rounded-lg text-xs font-bold ${riskBg} ${riskText}`}>
                            {riskLabel}
                          </span>
                          <span className="text-[11px] text-stone-400 tabular-nums">
                            {Math.round(s.risk_score * 100)}점
                          </span>
                        </div>
                      )}
                      {/* 재발송 버튼 */}
                      {(s.delivery_status === 'failed' || s.status === 'failed') && onSendRequest && (
                        <button
                          onClick={e => { e.stopPropagation(); onSendRequest(s.store_code); }}
                          className="flex items-center gap-1 px-2 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 text-xs font-medium border border-red-100"
                        >
                          재발송
                        </button>
                      )}
                      {s.store_code && date && (
                        <a
                          href={guideUrl(date, s.store_code)}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 hover:bg-stone-100 text-stone-500 text-[10px] font-semibold border border-stone-200"
                        >
                          가이드
                        </a>
                      )}
                      <ChevronRight size={14} className="text-stone-300" />
                    </div>
                  </div>
                </div>
              );
            })}
            {filtered.length === 0 && (
              <div className="py-10 text-center text-stone-400 text-xs">조회된 매장이 없습니다.</div>
            )}
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

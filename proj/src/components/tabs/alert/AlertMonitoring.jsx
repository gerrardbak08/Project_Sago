import { useState, useEffect } from 'react';
import {
  Bell,
  Calendar,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  RefreshCw,
  X,
  AlertTriangle,
  Search,
  Menu,
  ArrowLeft,
  Home,
  ChevronDown,
  Calculator,
  CalendarCheck,
  FileCheck,
  FileText,
  MessageCircle,
  ClipboardCheck,
  ShieldCheck,
  UserCircle,
} from 'lucide-react';
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

// "사고 5건 발생했습니다" 같은 문구 제거 (부주의 가이드 정리)
function cleanCarelessNote(text) {
  if (!text) return text;
  return text
    .replace(/사고가?\s*\d+건\s*발생했습니다\.?\s*/g, '')
    .replace(/\d+건\s*발생했습니다\.?\s*/g, '')
    .trim();
}

// ─── 카카오톡 채팅창 스타일 ──────────────────────────────
function KakaoChat({ channelName, channelEmail, storeName, date, cases, carelessNotes }) {
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

  // 부주의 주의사항: 최대 3개 + "사고 N건 발생" 문구 제거
  const cleanedNotes = (carelessNotes || [])
    .map(cleanCarelessNote)
    .filter(Boolean)
    .slice(0, 3);

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
          <div className="w-10 h-10 rounded-2xl bg-amber-300 flex-shrink-0 flex items-center justify-center text-xl shadow-sm">
            📮
          </div>

          <div className="flex-1 min-w-0">
            <div className="text-[11px] text-stone-700 mb-1 ml-0.5">(광고) 오늘의 안전 가이드</div>

            {/* 하나의 카드 말풍선 */}
            <div className="bg-white rounded-2xl overflow-hidden shadow-md">
              {/* 제목 */}
              <div className="px-4 pt-4 pb-3">
                <div className="text-[16px] font-extrabold text-stone-900 flex items-center gap-1.5">
                  <span>오늘 주의!</span>
                  <span className="text-lg">🚨</span>
                  <span>매장 안전 가이드</span>
                </div>
              </div>

              {/* 이미지 캐러셀 (원본 그대로, 오버레이 텍스트 없음) */}
              {hasCases && (
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
                    {idx + 1} / {cases.length}
                  </div>
                </div>
              )}

              {/* 사고 내용 + 안전 수칙 (이미지 아래) */}
              {hasCases && (
                <div className="px-4 py-3 space-y-2">
                  <div className="text-[13px] font-bold text-stone-900 leading-snug">
                    {current["사고내용"]}
                  </div>
                  {current["수칙"] && (
                    <div className="text-[12px] text-stone-800 leading-relaxed">
                      <span className="font-bold">✅ </span>
                      {current["수칙"]}
                    </div>
                  )}
                </div>
              )}

              {/* 매장 + 오늘 정보 */}
              <div className="px-4 py-3 border-t border-stone-100">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-stone-100 flex items-center justify-center text-base flex-shrink-0">
                    🏪
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-[12px] font-bold text-stone-900">{storeName}</div>
                    <div className="text-[10px] text-stone-500">{date} · 오늘의 안전 알림</div>
                  </div>
                </div>
              </div>

              {/* 부주의 주의사항 (최대 3개) */}
              {cleanedNotes.length > 0 && (
                <div className="px-4 py-3 border-t border-stone-100 space-y-2.5">
                  <div className="text-[11px] font-bold text-stone-800 flex items-center gap-1">
                    📌 상시 주의사항
                  </div>
                  {cleanedNotes.map((note, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <div className="w-5 h-5 rounded-full bg-stone-700 text-white text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                        {i + 1}
                      </div>
                      <div className="flex-1 text-[11px] text-stone-700 leading-relaxed">
                        {note}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* 하단 버튼 */}
              <div className="border-t border-stone-100">
                <button className="w-full py-3 text-[13px] font-semibold text-stone-700 hover:bg-stone-50">
                  자세히 보기
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

// ─── 모바일 HR 앱 팝업 스타일 ─────────────────────────────
function HrSafetyPopup({ storeName, date, cases, carelessNotes }) {
  const [idx, setIdx] = useState(0);
  const hasCases = cases && cases.length > 0;
  const current = hasCases ? cases[idx] : null;
  const canPrev = idx > 0;
  const canNext = hasCases && idx < cases.length - 1;

  const dateObj = date ? new Date(date) : new Date();
  const timeLabel = dateObj.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'short' });
  const cleanedNotes = (carelessNotes || [])
    .map(cleanCarelessNote)
    .filter(Boolean)
    .slice(0, 2);

  const menuItems = [
    { label: '급여명세서', Icon: Calculator },
    { label: '근태현황(연차)', Icon: CalendarCheck },
    { label: '계출원신청', Icon: FileCheck },
    { label: '제증명서신청', Icon: FileText },
    { label: '공지사항', Icon: ClipboardCheck },
    { label: 'FAQ', Icon: MessageCircle },
    { label: '휴직/복직신청', Icon: RefreshCw },
    { label: '건강검진 결과등록', Icon: ShieldCheck },
    { label: 'TBM활동', Icon: AlertTriangle },
  ];

  return (
    <div className="w-full max-w-[380px] mx-auto">
      <div className="rounded-[30px] overflow-hidden shadow-xl border border-stone-200 bg-white">
        <div className="relative min-h-[680px] bg-white">
          <div className="px-8 pt-5 flex items-center justify-between text-stone-950">
            <div className="text-[15px] font-extrabold">9:00</div>
            <div className="flex items-center gap-1 text-[11px] font-bold">
              <span className="w-4 h-2.5 rounded-sm bg-stone-900 inline-block" />
              <span>LTE</span>
              <span className="rounded-md bg-stone-900 px-1.5 py-0.5 text-white">98</span>
            </div>
          </div>

          <div className="mt-10 text-center text-[30px] font-black tracking-normal">
            <span className="text-[#244a9b]">ASUNG</span>
            <span className="text-stone-950"> HR</span>
          </div>

          <div className="mt-12 grid grid-cols-3 gap-x-5 gap-y-7 px-7">
            {menuItems.map(({ label, Icon }) => (
              <div key={label} className="min-w-0 text-center">
                <div className="mx-auto flex h-[82px] w-[82px] items-center justify-center rounded-2xl border border-stone-200 bg-stone-50 shadow-sm">
                  <Icon size={38} className="text-[#244a9b]" strokeWidth={1.9} />
                </div>
                <div className="mt-2 text-[14px] font-medium leading-tight text-stone-700 break-keep">
                  {label}
                </div>
              </div>
            ))}
          </div>

          <div className="absolute inset-x-5 top-[160px] z-10">
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-2xl">
              <div className="bg-[#244a9b] px-4 py-3 text-white">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[11px] font-semibold text-white/75">{timeLabel} 고객 안전 알림</div>
                    <div className="text-[17px] font-extrabold leading-tight">매장 안전 가이드</div>
                  </div>
                  <Bell size={22} />
                </div>
              </div>

              <div className="px-4 py-4">
                <div className="flex items-center gap-2.5 rounded-xl bg-stone-50 px-3 py-2.5">
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-white text-[#244a9b] shadow-sm">
                    <Home size={18} />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate text-[13px] font-extrabold text-stone-900">{storeName}</div>
                    <div className="text-[11px] font-medium text-stone-500">{date} · 고객 사고 예방 안내</div>
                  </div>
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="text-[11px] font-bold text-[#244a9b]">유사 사고 기반 주의사항</div>
                  <div
                    className="text-[14px] font-extrabold leading-snug text-stone-950"
                    style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                  >
                    {current?.["사고내용"] || '오늘 조건과 유사한 고객 사고 사례를 기준으로 안전 가이드를 확인하세요.'}
                  </div>
                  {current?.["수칙"] && (
                    <div
                      className="rounded-xl bg-amber-50 px-3 py-2 text-[12px] font-semibold leading-relaxed text-stone-800"
                      style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}
                    >
                      {current["수칙"]}
                    </div>
                  )}
                </div>

                {cleanedNotes.length > 0 && (
                  <div className="mt-4 space-y-2">
                    <div className="text-[11px] font-bold text-stone-500">상시 확인</div>
                    {cleanedNotes.map((note, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] leading-relaxed text-stone-700">
                        <span className="mt-0.5 flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full bg-stone-800 text-[9px] font-bold text-white">
                          {i + 1}
                        </span>
                        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                          {note}
                        </span>
                      </div>
                    ))}
                  </div>
                )}

                {hasCases && (
                  <div className="mt-4 flex items-center justify-between border-t border-stone-100 pt-3">
                    <button
                      onClick={() => setIdx(i => i - 1)}
                      disabled={!canPrev}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-600 disabled:opacity-30"
                    >
                      <ChevronLeft size={16} />
                    </button>
                    <div className="text-[11px] font-bold text-stone-500">{idx + 1} / {cases.length}</div>
                    <button
                      onClick={() => setIdx(i => i + 1)}
                      disabled={!canNext}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-stone-200 text-stone-600 disabled:opacity-30"
                    >
                      <ChevronRight size={16} />
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex h-20 items-center justify-around bg-[#2f3d73] px-8 text-white">
            <ChevronLeft size={36} strokeWidth={2.4} />
            <ChevronRight size={36} strokeWidth={2.4} />
            <Home size={36} fill="white" strokeWidth={2.1} />
            <RefreshCw size={34} strokeWidth={2.2} />
            <UserCircle size={38} strokeWidth={2.1} />
          </div>
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
                <HrSafetyPopup
                  storeName={detail.store_name}
                  date={detail.date}
                  cases={detail.results.cust.guide?.["오늘의_주의사항"] || []}
                  carelessNotes={detail.results.cust.guide?.["부주의_주의사항"] || []}
                />
              )}

              {detail.results?.emp && (
                <KakaoChat
                  channelName="다이소 직원 안전 알림"
                  channelEmail="safety@daiso.co.kr"
                  storeName={detail.store_name}
                  date={detail.date}
                  cases={detail.results.emp.guide?.["오늘의_주의사항"] || []}
                  carelessNotes={detail.results.emp.guide?.["부주의_주의사항"] || []}
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

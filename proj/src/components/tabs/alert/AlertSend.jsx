import { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, RefreshCw, Users, MessageCircle } from 'lucide-react';
import { ALERT_RED, SAFE_GREEN } from '../../../constants/colors.js';
import { Card } from '../../shared/Card.jsx';
import rawStores from '../../../data/raw/stores.json';

const STORES_LIST = rawStores.data.filter(s => s['폐점여부'] === '영업');

function AlertSend() {
  const today = new Date().toISOString().slice(0, 10);
  const [storeCode, setStoreCode] = useState('');
  const [storeQuery, setStoreQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [date, setDate] = useState(today);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const selectedStore = STORES_LIST.find(s => String(s['매장']) === String(storeCode));

  const filteredStores = storeQuery
    ? STORES_LIST.filter(s =>
        String(s['매장명'] || '').includes(storeQuery) ||
        String(s['매장'] || '').includes(storeQuery) ||
        String(s['지역'] || '').includes(storeQuery)
      ).slice(0, 20)
    : STORES_LIST.slice(0, 20);

  const selectStore = (store) => {
    setStoreCode(String(store['매장']));
    setStoreQuery(store['매장명'] || '');
    setShowDropdown(false);
  };

  const canSend = storeCode && date && !loading;

  const handleSend = async () => {
    if (!canSend) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const base = import.meta.env.VITE_API_BASE ?? '';
      const res = await fetch(`${base}/api/notify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ store_code: parseInt(storeCode, 10), date }),
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
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
      <div className="rounded-xl bg-gradient-to-r from-stone-900 to-stone-800 p-5 text-white">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Send size={18} />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-tight">알림 발송</div>
            <div className="text-xs text-stone-400 mt-0.5">매장 선택 → 안전 가이드 생성 → 발송 기록</div>
          </div>
        </div>
      </div>

      {/* 프로토타입 안내 */}
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex items-start gap-3">
        <MessageCircle size={16} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700 space-y-0.5">
          <div className="font-semibold">프로토타입 모드</div>
          <div>현재는 실제 메시지 전송 없이 발송 기록만 남깁니다.</div>
          <div>카카오 비즈니스 채널 연동 후 매장 직원 전체에게 실제 발송됩니다.</div>
        </div>
      </div>

      {/* 발송 폼 */}
      <Card>
        <div className="space-y-4">
          {/* 매장 선택 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-600">매장 선택</label>
            <div className="relative">
              <input
                type="text"
                value={storeQuery}
                onChange={e => { setStoreQuery(e.target.value); setShowDropdown(true); setStoreCode(''); }}
                onFocus={() => setShowDropdown(true)}
                placeholder="매장명 또는 매장코드 검색..."
                className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400"
              />
              {showDropdown && filteredStores.length > 0 && (
                <div className="absolute z-20 top-10 left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg max-h-52 overflow-y-auto">
                  {filteredStores.map(s => (
                    <button
                      key={s['매장']}
                      onClick={() => selectStore(s)}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 text-xs flex items-center justify-between cursor-pointer"
                    >
                      <span className="font-medium text-stone-800">{s['매장명']}</span>
                      <span className="text-stone-400">{s['지역']} · {s['매장']}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedStore && (
              <div className="flex items-center gap-2 text-xs text-stone-500 bg-stone-50 rounded-lg px-3 py-2">
                <Users size={11} />
                <span>{selectedStore['매장명']} · {selectedStore['지역']} · 매장코드 {selectedStore['매장']}</span>
              </div>
            )}
          </div>

          {/* 날짜 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-600">날짜</label>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400 cursor-pointer"
            />
          </div>

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full h-10 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> 가이드 생성 중...</>
              : <><Send size={14} /> 안전 가이드 발송</>
            }
          </button>
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} /> {error}
        </div>
      )}

      {/* 발송 결과 */}
      {result && (
        <Card>
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={16} style={{ color: SAFE_GREEN }} />
              <span className="font-bold text-stone-900 text-sm">발송 완료</span>
              <button onClick={() => setResult(null)} className="ml-auto text-xs text-stone-400 hover:text-stone-600 cursor-pointer">
                닫기
              </button>
            </div>

            <div className="text-xs text-stone-500">{result.store_name} · {result.date}</div>

            {/* 가이드 미리보기 */}
            {(result.guide_preview?.cust || result.guide_preview?.emp) && (
              <div className="space-y-2">
                {result.guide_preview.cust && (
                  <div className="rounded-lg bg-sky-50 border border-sky-100 px-3 py-2 text-xs text-sky-800">
                    <span className="font-semibold">고객 안전:</span> {result.guide_preview.cust}
                  </div>
                )}
                {result.guide_preview.emp && (
                  <div className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-800">
                    <span className="font-semibold">직원 안전:</span> {result.guide_preview.emp}
                  </div>
                )}
              </div>
            )}

            <div className="text-[11px] text-stone-400 bg-stone-50 rounded-lg px-3 py-2">
              {result.note}
            </div>
          </div>
        </Card>
      )}

      {/* 빈 상태 안내 */}
      {!result && !error && !loading && (
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 text-xs text-stone-500 space-y-1">
          <div className="font-semibold text-stone-600 mb-2">📌 발송 흐름</div>
          <div>1. 매장 선택 → 날짜 선택 → 발송 버튼 클릭</div>
          <div>2. 해당 매장·날짜 기준 안전 가이드 자동 생성</div>
          <div>3. 발송 기록이 알림 현황 탭에 저장됨</div>
          <div className="pt-1 text-amber-600">※ 카카오 연동 후 매장 직원 전체에게 실제 발송됩니다</div>
        </div>
      )}
    </div>
  );
}

export default AlertSend;

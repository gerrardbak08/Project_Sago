import { useState } from 'react';
import { Send, CheckCircle2, AlertCircle, RefreshCw, MessageCircle, X, Plus, Search } from 'lucide-react';
import { ALERT_RED, SAFE_GREEN } from '../../../constants/colors.js';
import { Card } from '../../shared/Card.jsx';
import rawStores from '../../../data/raw/stores.json';

const STORES_LIST = rawStores.data.filter(s => s['폐점여부'] === '영업');

const RISK_META = {
  high:   { label: "고위험", bg: "bg-red-50",     text: "text-red-700",     dot: "#D70011" },
  medium: { label: "중위험", bg: "bg-amber-50",   text: "text-amber-700",   dot: "#B45309" },
  low:    { label: "저위험", bg: "bg-emerald-50", text: "text-emerald-700", dot: "#15803D" },
};

function RiskBadge({ grade }) {
  const m = RISK_META[grade] || RISK_META.low;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold ${m.bg} ${m.text}`}>
      <span className="w-1.5 h-1.5 rounded-full" style={{ background: m.dot }} />
      {m.label}
    </span>
  );
}

function AlertSend() {
  const today = new Date().toISOString().slice(0, 10);
  const kakaoEnabled = import.meta.env.VITE_ENABLE_KAKAO_SEND === 'true';
  const [query, setQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [selectedStores, setSelectedStores] = useState([]);
  const [date, setDate] = useState(today);
  const [receiverText, setReceiverText] = useState('');
  const [sendToken, setSendToken] = useState(localStorage.getItem('MANUAL_SEND_TOKEN') || '');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const filteredStores = (query
    ? STORES_LIST.filter(s =>
        String(s['매장명'] || '').includes(query) ||
        String(s['매장'] || '').includes(query) ||
        String(s['지역'] || '').includes(query)
      )
    : STORES_LIST
  ).filter(s => !selectedStores.find(sel => sel['매장'] === s['매장']))
   .slice(0, 20);

  const addStore = (store) => {
    setSelectedStores(prev => [...prev, store]);
    setQuery('');
    setShowDropdown(false);
  };

  const removeStore = (code) => {
    setSelectedStores(prev => prev.filter(s => s['매장'] !== code));
  };

  const receiverUuids = receiverText
    .split(/[\n,]+/)
    .map(v => v.trim())
    .filter(Boolean);
  const canSend = selectedStores.length > 0 && date && (!kakaoEnabled || receiverUuids.length > 0) && !loading;

  const handleSend = async () => {
    if (!canSend) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const url = import.meta.env.VITE_NOTIFY_URL ?? `${import.meta.env.VITE_API_BASE ?? ''}/api/notify`;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(sendToken ? { 'x-api-key': sendToken } : {}) },
        body: JSON.stringify({
          store_codes: selectedStores.map(s => parseInt(s['매장'], 10)),
          date,
          channel: kakaoEnabled ? 'kakao' : 'mock',
          ...(kakaoEnabled ? { receiver_uuids: receiverUuids } : {}),
        }),
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
      <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 flex items-start gap-2.5">
        <MessageCircle size={14} className="text-amber-600 flex-shrink-0 mt-0.5" />
        <div className="text-xs text-amber-700">
          {kakaoEnabled ? (
            <><span className="font-semibold">카카오 테스트 발송 —</span> 입력한 친구 UUID로 실제 안전가이드 메시지를 발송하고 성공/실패 결과를 기록합니다.</>
          ) : (
            <><span className="font-semibold">모의 발송 —</span> 실제 카카오 발송은 비활성화되어 있으며, 안전가이드 생성 결과만 기록합니다.</>
          )}
        </div>
      </div>

      {/* 발송 폼 */}
      <Card>
        <div className="space-y-4">
          {/* 매장 검색 + 선택 */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-stone-600">매장 선택</label>
              {selectedStores.length > 0 && (
                <span className="text-xs text-stone-400">{selectedStores.length}개 선택됨</span>
              )}
            </div>

            {/* 검색 입력 */}
            <div className="relative">
              <div className="relative">
                <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
                <input
                  type="text"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setShowDropdown(true); }}
                  onFocus={() => setShowDropdown(true)}
                  placeholder="매장명, 매장코드, 지역으로 검색..."
                  className="w-full h-9 pl-8 pr-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400"
                />
              </div>
              {showDropdown && filteredStores.length > 0 && (
                <div
                  className="absolute z-20 top-10 left-0 right-0 bg-white border border-stone-200 rounded-lg shadow-lg max-h-52 overflow-y-auto"
                  onMouseDown={e => e.preventDefault()}
                >
                  {filteredStores.map(s => (
                    <button
                      key={s['매장']}
                      onClick={() => addStore(s)}
                      className="w-full text-left px-3 py-2 hover:bg-stone-50 text-xs flex items-center justify-between cursor-pointer border-b border-stone-50 last:border-0"
                    >
                      <span className="font-medium text-stone-800">{s['매장명']}</span>
                      <span className="text-stone-400">{s['지역']} · {s['매장']}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 선택된 매장 목록 */}
            {selectedStores.length > 0 && (
              <div className="space-y-1.5 max-h-48 overflow-y-auto">
                {selectedStores.map(s => (
                  <div
                    key={s['매장']}
                    className="flex items-center justify-between bg-stone-50 border border-stone-200 rounded-lg px-3 py-2"
                  >
                    <div className="text-xs">
                      <span className="font-semibold text-stone-800">{s['매장명']}</span>
                      <span className="text-stone-400 ml-2">{s['지역']} · {s['매장']}</span>
                    </div>
                    <button
                      onClick={() => removeStore(s['매장'])}
                      className="text-stone-400 hover:text-stone-700 cursor-pointer ml-2 flex-shrink-0"
                    >
                      <X size={13} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {selectedStores.length === 0 && (
              <div className="text-xs text-stone-400 text-center py-3 bg-stone-50 rounded-lg border border-dashed border-stone-200">
                매장을 검색해서 추가하세요
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

          {/* 인증 토큰 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-600">인증 토큰</label>
            <input
              type="password"
              value={sendToken}
              onChange={e => { setSendToken(e.target.value); localStorage.setItem('MANUAL_SEND_TOKEN', e.target.value); }}
              placeholder="MANUAL_SEND_TOKEN 입력 (저장됨)"
              className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400 font-mono"
            />
          </div>

          {kakaoEnabled && (
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-semibold text-stone-600">카카오 친구 UUID</label>
                {receiverUuids.length > 0 && (
                  <span className="text-xs text-stone-400">{receiverUuids.length}명 입력됨</span>
                )}
              </div>
              <textarea
                value={receiverText}
                onChange={e => setReceiverText(e.target.value)}
                placeholder="friends 결과의 uuid를 입력하세요. 여러 명은 줄바꿈 또는 쉼표로 구분"
                rows={3}
                className="w-full px-3 py-2 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400 resize-none font-mono"
              />
              <div className="text-[11px] text-stone-400">
                현재는 테스트 단계이므로 친구 UUID를 직접 입력합니다.
              </div>
            </div>
          )}

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full h-10 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> 가이드 생성 중 ({selectedStores.length}개 매장)...</>
              : <><Send size={14} /> {selectedStores.length}개 매장 · {kakaoEnabled ? `${receiverUuids.length}명 카카오 발송` : '모의 발송'}</>
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
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} style={{ color: SAFE_GREEN }} />
                <span className="font-bold text-stone-900 text-sm">발송 완료</span>
              </div>
              <button onClick={() => setResult(null)} className="text-xs text-stone-400 hover:text-stone-600 cursor-pointer">
                닫기
              </button>
            </div>

            {/* 요약 */}
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: "총 매장", value: result.summary?.total, color: "#1C1917" },
                { label: "성공", value: result.summary?.success, color: SAFE_GREEN },
                { label: "실패", value: result.summary?.failed, color: ALERT_RED },
              ].map(({ label, value, color }) => (
                <div key={label} className="rounded-lg bg-stone-50 border border-stone-200 p-2.5 text-center">
                  <div className="text-[10px] text-stone-500 font-semibold uppercase">{label}</div>
                  <div className="text-xl font-extrabold tabular-nums mt-0.5" style={{ color }}>{value}</div>
                </div>
              ))}
            </div>

            {/* 매장별 결과 */}
            <div className="space-y-1.5">
              {result.stores?.map((s, i) => (
                <div
                  key={s.store_code + i}
                  className={`rounded-lg border px-3 py-2.5 ${s.status === 'sent' ? 'bg-emerald-50 border-emerald-200' : 'bg-red-50 border-red-200'}`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold text-stone-800">{s.store_name || s.store_code}</span>
                    <span className={`text-[10px] font-bold ${s.status === 'sent' ? 'text-emerald-600' : 'text-red-600'}`}>
                      {s.status === 'sent' ? '✓ 완료' : '✗ 실패'}
                    </span>
                  </div>
                  {s.status === 'sent' && s.guide_preview && (
                    <div className="space-y-0.5">
                      {s.sent_recipients?.length > 0 && (
                        <div className="text-[11px] text-emerald-700">
                          <span className="font-medium">성공:</span> {s.sent_recipients.join(', ')}
                        </div>
                      )}
                      {s.failed_recipients?.length > 0 && (
                        <div className="text-[11px] text-red-600">
                          <span className="font-medium">실패:</span> {s.failed_recipients.join(', ')}
                        </div>
                      )}
                      {s.guide_preview.cust && (
                        <div className="text-[11px] text-stone-600">
                          <span className="font-medium text-sky-700">고객:</span> {s.guide_preview.cust}
                        </div>
                      )}
                      {s.guide_preview.emp && (
                        <div className="text-[11px] text-stone-600">
                          <span className="font-medium text-indigo-700">직원:</span> {s.guide_preview.emp}
                        </div>
                      )}
                      <div className="flex gap-1.5 mt-1">
                        {s.risk_cust && <RiskBadge grade={s.risk_cust} />}
                        {s.risk_emp && <RiskBadge grade={s.risk_emp} />}
                      </div>
                    </div>
                  )}
                  {s.status === 'failed' && (
                    <div className="space-y-0.5">
                      {s.failed_recipients?.length > 0 && (
                        <div className="text-[11px] text-red-600">
                          <span className="font-medium">실패:</span> {s.failed_recipients.join(', ')}
                        </div>
                      )}
                      <div className="text-[11px] text-red-600">{s.error}</div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <div className="text-[11px] text-stone-400 bg-stone-50 rounded-lg px-3 py-2">
              {result.note}
            </div>
          </div>
        </Card>
      )}

      {/* 빈 상태 */}
      {!result && !error && !loading && (
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 text-xs text-stone-500 space-y-1">
          <div className="font-semibold text-stone-600 mb-2">📌 발송 흐름</div>
          <div>1. 매장 검색 → 여러 매장 추가 → 날짜 선택</div>
          <div>2. 발송 버튼 클릭{kakaoEnabled ? " (카카오 친구 UUID 필요)" : ""}</div>
          <div>3. 매장별 안전가이드 생성 후 발송 결과가 알림 현황 탭에 저장됨</div>
          <div className="pt-1 text-amber-600">※ 실제 카카오 발송은 배포 환경에서 별도 활성화가 필요합니다</div>
        </div>
      )}
    </div>
  );
}

export default AlertSend;

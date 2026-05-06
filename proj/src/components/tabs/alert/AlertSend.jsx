import { useState } from 'react';
import { Send, Plus, X, CheckCircle2, AlertCircle, RefreshCw, Mail } from 'lucide-react';
import { ALERT_RED, SAFE_GREEN } from '../../../constants/colors.js';
import { Card } from '../../shared/Card.jsx';

function RecipientInput({ recipients, onChange }) {
  const [input, setInput] = useState('');

  const add = () => {
    const trimmed = input.trim();
    if (!trimmed) return;
    // 쉼표 구분 여러 개 처리
    const items = trimmed.split(',').map(s => s.trim()).filter(Boolean);
    const next = [...new Set([...recipients, ...items])];
    onChange(next);
    setInput('');
  };

  const remove = (addr) => onChange(recipients.filter(r => r !== addr));

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      add();
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="이메일 입력 후 Enter (쉼표로 여러 개 입력 가능)"
          className="flex-1 h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400"
        />
        <button
          onClick={add}
          className="h-9 px-3 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-xs font-bold cursor-pointer flex items-center gap-1"
        >
          <Plus size={13} /> 추가
        </button>
      </div>
      {recipients.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {recipients.map(r => (
            <span
              key={r}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-stone-100 border border-stone-200 text-xs font-medium text-stone-700"
            >
              <Mail size={10} className="text-stone-400" />
              {r}
              <button
                onClick={() => remove(r)}
                className="ml-0.5 text-stone-400 hover:text-stone-700 cursor-pointer"
              >
                <X size={11} />
              </button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function AlertSend() {
  const today = new Date().toISOString().slice(0, 10);
  const [storeCode, setStoreCode] = useState('');
  const [date, setDate] = useState(today);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const canSend = storeCode && date && recipients.length > 0 && !loading;

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
        body: JSON.stringify({
          store_code: parseInt(storeCode, 10),
          date,
          recipients,
          channel: 'email',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }

      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
    setError(null);
    setRecipients([]);
  };

  return (
    <div className="space-y-3 sm:space-y-4">
      {/* 헤더 */}
      <div className="rounded-xl bg-gradient-to-r from-stone-900 to-stone-800 p-5 text-white">
        <div className="flex items-center gap-3 mb-1">
          <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center">
            <Send size={18} />
          </div>
          <div>
            <div className="font-extrabold text-lg leading-tight">알림 발송</div>
            <div className="text-xs text-stone-400 mt-0.5">안전 가이드 메시지 · 이메일 발송</div>
          </div>
        </div>
      </div>

      {/* 발송 폼 */}
      <Card>
        <div className="space-y-4">
          {/* 매장코드 + 날짜 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-600">매장코드</label>
              <input
                type="number"
                value={storeCode}
                onChange={e => setStoreCode(e.target.value)}
                placeholder="예: 10130"
                className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-stone-600">날짜</label>
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm text-stone-700 bg-white focus:outline-none focus:border-stone-400 cursor-pointer"
              />
            </div>
          </div>

          {/* 수신자 */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-stone-600">
              수신자 이메일
              <span className="ml-1.5 text-stone-400 font-normal">({recipients.length}명)</span>
            </label>
            <RecipientInput recipients={recipients} onChange={setRecipients} />
          </div>

          {/* 발송 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            className="w-full h-10 rounded-lg bg-stone-900 hover:bg-stone-800 text-white text-sm font-bold cursor-pointer flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed transition-opacity"
          >
            {loading
              ? <><RefreshCw size={14} className="animate-spin" /> 발송 중...</>
              : <><Send size={14} /> 안전 가이드 발송</>
            }
          </button>
        </div>
      </Card>

      {/* 에러 */}
      {error && (
        <div className="flex items-center gap-2 text-red-700 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={15} />
          {error}
        </div>
      )}

      {/* 발송 결과 */}
      {result && (
        <Card>
          <div className="space-y-3">
            {/* 요약 */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 size={16} style={{ color: SAFE_GREEN }} />
                <span className="font-bold text-stone-900 text-sm">발송 완료</span>
              </div>
              <button
                onClick={reset}
                className="text-xs text-stone-400 hover:text-stone-600 cursor-pointer"
              >
                초기화
              </button>
            </div>

            <div className="text-xs text-stone-500">
              {result.store_name} · {result.date}
            </div>

            {/* 성공/실패 카운트 */}
            <div className="grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-center">
                <div className="text-xs font-semibold text-emerald-600 mb-1">발송 성공</div>
                <div className="text-2xl font-extrabold tabular-nums" style={{ color: SAFE_GREEN }}>
                  {result.total_sent}
                </div>
              </div>
              <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-center">
                <div className="text-xs font-semibold text-red-600 mb-1">발송 실패</div>
                <div className="text-2xl font-extrabold tabular-nums" style={{ color: ALERT_RED }}>
                  {result.total_failed}
                </div>
              </div>
            </div>

            {/* 성공 목록 */}
            {result.sent?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">성공</div>
                {result.sent.map(r => (
                  <div key={r} className="flex items-center gap-2 text-xs text-emerald-700 bg-emerald-50 rounded-lg px-3 py-1.5">
                    <CheckCircle2 size={11} />
                    {r}
                  </div>
                ))}
              </div>
            )}

            {/* 실패 목록 */}
            {result.failed?.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wide">실패</div>
                {result.failed.map(r => (
                  <div key={r} className="flex items-center gap-2 text-xs text-red-700 bg-red-50 rounded-lg px-3 py-1.5">
                    <AlertCircle size={11} />
                    {r}
                  </div>
                ))}
              </div>
            )}
          </div>
        </Card>
      )}

      {/* 안내 */}
      {!result && !error && (
        <div className="rounded-xl bg-stone-50 border border-stone-200 p-4 text-xs text-stone-500 space-y-1">
          <div className="font-semibold text-stone-600 mb-2">📌 사용 안내</div>
          <div>• 매장코드와 날짜를 입력하면 해당 조건의 안전 가이드를 생성해 발송합니다</div>
          <div>• 수신자는 쉼표로 구분하거나 Enter로 여러 명 추가할 수 있습니다</div>
          <div>• 발송 성공 건만 알림 현황 탭에 기록됩니다</div>
          <div>• SES 샌드박스 모드에서는 인증된 이메일만 수신 가능합니다</div>
        </div>
      )}
    </div>
  );
}

export default AlertSend;

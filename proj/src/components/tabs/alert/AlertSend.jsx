import { useState, useEffect } from 'react';
import { Send, CheckCircle2, AlertCircle, RefreshCw, MessageCircle, X, Plus, Search, Bell } from 'lucide-react';
import { ALERT_RED, SAFE_GREEN } from '../../../constants/colors.js';
import { Card } from '../../shared/Card.jsx';
import rawStores from '../../../data/raw/stores.json';
import { track, ALERT_SEND_SUBMITTED, ALERT_SEND_RESULT } from '../../../utils/analytics.js';

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

function PresetForm({ name, onNameChange, members, onMemberChange, onAddMember, onRemoveMember, onSave, onCancel }) {
  return (
    <div className="space-y-3">
      <input
        value={name}
        onChange={e => onNameChange(e.target.value)}
        placeholder="프리셋 이름 (예: 서울 안전팀)"
        className="w-full h-9 px-3 rounded-lg border border-stone-200 text-sm font-semibold text-stone-800 bg-white focus:outline-none focus:border-stone-400"
      />
      <div className="space-y-2">
        <div className="text-[11px] font-bold text-stone-400">수신자 목록</div>
        {members.map((m, i) => (
          <div key={i} className="flex gap-1.5 items-center">
            <input value={m.name} onChange={e => onMemberChange(i, 'name', e.target.value)}
              placeholder="이름" className="w-20 h-8 px-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none focus:border-stone-400" />
            <input value={m.role} onChange={e => onMemberChange(i, 'role', e.target.value)}
              placeholder="직책" className="w-20 h-8 px-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none focus:border-stone-400" />
            <input value={m.uuid} onChange={e => onMemberChange(i, 'uuid', e.target.value)}
              placeholder="카카오 UUID" className="flex-1 h-8 px-2 rounded-lg border border-stone-200 text-xs bg-white focus:outline-none focus:border-stone-400 font-mono" />
            {members.length > 1 && (
              <button onClick={() => onRemoveMember(i)} className="w-7 h-7 rounded-lg hover:bg-red-50 flex items-center justify-center text-stone-300 hover:text-red-400 cursor-pointer flex-shrink-0">
                <X size={13} />
              </button>
            )}
          </div>
        ))}
        <button onClick={onAddMember} className="text-[11px] font-bold text-stone-400 hover:text-stone-600 cursor-pointer">+ 수신자 추가</button>
      </div>
      <div className="flex gap-2 pt-1">
        <button onClick={onSave} className="flex-1 h-9 rounded-xl bg-stone-900 text-white text-xs font-bold cursor-pointer hover:bg-stone-800">저장</button>
        <button onClick={onCancel} className="h-9 px-4 rounded-xl border border-stone-200 text-stone-500 text-xs font-bold cursor-pointer hover:bg-stone-50">취소</button>
      </div>
    </div>
  );
}

function RecipientPresetManager({ presets, onChange, onClose }) {
  const [editingId, setEditingId] = useState(null);
  const [newName, setNewName] = useState('');
  const [newMembers, setNewMembers] = useState([{ name: '', role: '', uuid: '' }]);

  const startNew = () => {
    setEditingId('__new__');
    setNewName('');
    setNewMembers([{ name: '', role: '', uuid: '' }]);
  };

  const savePreset = () => {
    if (!newName.trim()) return;
    const members = newMembers.filter(m => m.uuid.trim());
    if (editingId === '__new__') {
      onChange([...presets, { id: `preset-${Date.now()}`, name: newName.trim(), members }]);
    } else {
      onChange(presets.map(p => p.id === editingId ? { ...p, name: newName.trim(), members } : p));
    }
    setEditingId(null);
  };

  const deletePreset = (id) => onChange(presets.filter(p => p.id !== id));

  const editPreset = (p) => {
    setEditingId(p.id);
    setNewName(p.name);
    setNewMembers(p.members.length > 0 ? [...p.members] : [{ name: '', role: '', uuid: '' }]);
  };

  const updateMember = (i, field, val) => {
    setNewMembers(prev => prev.map((m, idx) => idx === i ? { ...m, [field]: val } : m));
  };

  const addMember = () => setNewMembers(prev => [...prev, { name: '', role: '', uuid: '' }]);
  const removeMember = (i) => setNewMembers(prev => prev.filter((_, idx) => idx !== i));

  return (
    <div className="fixed inset-0 bg-stone-900/60 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        {/* 헤더 */}
        <div className="sticky top-0 bg-white border-b border-stone-100 px-5 py-4 flex items-center justify-between rounded-t-2xl">
          <div className="font-extrabold text-stone-900 text-base">수신자 프리셋 관리</div>
          <button onClick={onClose} className="w-8 h-8 rounded-full hover:bg-stone-100 flex items-center justify-center cursor-pointer text-stone-400">
            <X size={16} />
          </button>
        </div>

        <div className="p-5 space-y-4">
          {/* 기존 프리셋 목록 */}
          {presets.map(p => (
            <div key={p.id} className="rounded-xl border border-stone-100 bg-stone-50 p-4">
              {editingId === p.id ? (
                <PresetForm
                  name={newName} onNameChange={setNewName}
                  members={newMembers} onMemberChange={updateMember}
                  onAddMember={addMember} onRemoveMember={removeMember}
                  onSave={savePreset} onCancel={() => setEditingId(null)}
                />
              ) : (
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="font-bold text-stone-900 text-sm">{p.name}</div>
                    <div className="text-[11px] text-stone-500 mt-1 space-y-0.5">
                      {p.members.map((m, i) => (
                        <div key={i}>{m.name}{m.role ? ` · ${m.role}` : ''}</div>
                      ))}
                    </div>
                  </div>
                  <div className="flex gap-1.5 shrink-0">
                    <button onClick={() => editPreset(p)} className="px-2.5 py-1 rounded-lg bg-white border border-stone-200 text-[11px] font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer">편집</button>
                    <button onClick={() => deletePreset(p.id)} className="px-2.5 py-1 rounded-lg bg-red-50 border border-red-100 text-[11px] font-semibold text-red-600 hover:bg-red-100 cursor-pointer">삭제</button>
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* 새 프리셋 추가 */}
          {editingId === '__new__' ? (
            <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
              <PresetForm
                name={newName} onNameChange={setNewName}
                members={newMembers} onMemberChange={updateMember}
                onAddMember={addMember} onRemoveMember={removeMember}
                onSave={savePreset} onCancel={() => setEditingId(null)}
              />
            </div>
          ) : (
            <button
              onClick={startNew}
              className="w-full h-10 rounded-xl border-2 border-dashed border-stone-200 text-[12px] font-bold text-stone-400 hover:border-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
            >
              + 새 프리셋 추가
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function AlertSend({ onSent, preFillStore, onPreFillConsumed }) {
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
  const [showPreview, setShowPreview] = useState(false);

  // 프리셋 관련 state
  const [presets, setPresets] = useState(() => {
    try { return JSON.parse(localStorage.getItem('SAGO_RECIPIENT_PRESETS') || '[]'); }
    catch { return []; }
  });
  const [selectedPresetId, setSelectedPresetId] = useState(null);
  const [showPresetManager, setShowPresetManager] = useState(false);
  const [directInput, setDirectInput] = useState(false);

  // presets 변경 시 localStorage 동기화
  useEffect(() => {
    localStorage.setItem('SAGO_RECIPIENT_PRESETS', JSON.stringify(presets));
  }, [presets]);

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

  // 활성 프리셋과 최종 수신자 UUID 계산
  const activePreset = presets.find(p => p.id === selectedPresetId) || null;
  const receiverUuids = activePreset
    ? activePreset.members.map(m => m.uuid).filter(Boolean)
    : receiverText.split(/[\n,]+/).map(v => v.trim()).filter(Boolean);

  const canSend = selectedStores.length > 0 && date && (
    !kakaoEnabled || (activePreset ? activePreset.members.length > 0 : receiverUuids.length > 0)
  ) && !loading;

  useEffect(() => {
    if (preFillStore) {
      setSelectedStores(prev => {
        const already = prev.some(s => String(s['매장'] || s.store_code) === String(preFillStore));
        if (already) return prev;
        return [...prev, { '매장': preFillStore, '매장명': String(preFillStore) }];
      });
      if (onPreFillConsumed) onPreFillConsumed();
    }
  }, [preFillStore]);

  const handleSend = async () => {
    if (!canSend) return;
    setLoading(true);
    setError(null);
    setResult(null);

    track(ALERT_SEND_SUBMITTED, {
      store_count: selectedStores.length,
      channel: kakaoEnabled ? 'kakao' : 'mock',
      date,
      receiver_count: kakaoEnabled ? receiverUuids.length : 0,
    });

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
      if (onSent) onSent(date);
      track(ALERT_SEND_RESULT, {
        success: true,
        store_count: selectedStores.length,
        channel: kakaoEnabled ? 'kakao' : 'mock',
        http_status: res.status,
      });
    } catch (e) {
      setError(e.message);
      track(ALERT_SEND_RESULT, {
        success: false,
        error_message: e.message,
        channel: kakaoEnabled ? 'kakao' : 'mock',
      });
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

          {/* 인증 토큰 — 개발 모드에서만 노출 */}
          {import.meta.env.VITE_DEV_MODE === 'true' && (
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
          )}

          {/* 수신자 선택 */}
          {kakaoEnabled && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-stone-600">수신자</span>
                <button
                  type="button"
                  onClick={() => setShowPresetManager(true)}
                  className="flex items-center gap-1 text-[11px] text-stone-500 hover:text-stone-800 font-semibold cursor-pointer"
                >
                  <Plus size={11} /> 수신자 관리
                </button>
              </div>

              {/* 프리셋 칩 목록 */}
              {presets.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {presets.map(p => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => { setSelectedPresetId(p.id === selectedPresetId ? null : p.id); setDirectInput(false); }}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                        selectedPresetId === p.id
                          ? 'bg-stone-900 text-white border-stone-900'
                          : 'bg-white text-stone-600 border-stone-200 hover:border-stone-400'
                      }`}
                    >
                      {p.name}
                      <span className="opacity-60">{p.members.length}명</span>
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setDirectInput(v => !v); setSelectedPresetId(null); }}
                    className={`px-3 py-1.5 rounded-full text-[11px] font-bold border transition-colors cursor-pointer ${
                      directInput
                        ? 'bg-stone-900 text-white border-stone-900'
                        : 'bg-white text-stone-500 border-stone-200 hover:border-stone-400'
                    }`}
                  >
                    직접 입력
                  </button>
                </div>
              )}

              {/* 선택된 프리셋 멤버 미리보기 */}
              {activePreset && (
                <div className="rounded-xl bg-stone-50 border border-stone-100 px-3 py-2.5 space-y-1">
                  {activePreset.members.map((m, i) => (
                    <div key={i} className="flex items-center gap-2 text-[11px]">
                      <span className="w-5 h-5 rounded-full bg-stone-200 flex items-center justify-center text-[9px] font-bold text-stone-600 flex-shrink-0">
                        {m.name?.[0] || '?'}
                      </span>
                      <span className="font-semibold text-stone-800">{m.name}</span>
                      {m.role && <span className="text-stone-400">·</span>}
                      {m.role && <span className="text-stone-500">{m.role}</span>}
                    </div>
                  ))}
                </div>
              )}

              {/* 직접 입력 (프리셋 없거나 directInput 모드) */}
              {(directInput || (presets.length === 0 && !activePreset)) && (
                <textarea
                  value={receiverText}
                  onChange={e => setReceiverText(e.target.value)}
                  placeholder="수신자 UUID를 쉼표 또는 줄바꿈으로 구분해 입력"
                  className="w-full h-20 px-3 py-2 rounded-xl border border-stone-200 text-xs text-stone-700 bg-white resize-none focus:outline-none focus:border-stone-400 font-mono"
                />
              )}
            </div>
          )}

          {/* 발송 전 미리보기 토글 */}
          {selectedStores.length > 0 && !result && (
            <button
              type="button"
              onClick={() => setShowPreview(v => !v)}
              className="w-full h-8 rounded-lg border border-stone-200 bg-stone-50 hover:bg-stone-100 text-xs font-semibold text-stone-500 flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
            >
              {showPreview ? '미리보기 닫기 ↑' : '카카오 카드 미리보기 ↓'}
            </button>
          )}

          {/* 미리보기 패널 */}
          {showPreview && selectedStores.length > 0 && !result && (
            <div className="rounded-xl border border-stone-100 bg-stone-50 p-3 space-y-2">
              <div className="text-[11px] font-bold text-stone-400">발송될 카카오 피드카드 형식 미리보기</div>
              {selectedStores.slice(0, 2).map(s => (
                <div key={s['매장']} className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm">
                  {/* 카드 헤더 */}
                  <div className="px-3 pt-3 pb-2.5 border-b border-stone-100">
                    <div className="text-[13px] font-extrabold text-stone-900 leading-tight">
                      🔴 {s['매장명'] || s['매장']} · 위험유형 주의
                    </div>
                    <div className="flex items-center gap-2 mt-2">
                      <div className="w-7 h-7 rounded-lg bg-stone-100 flex items-center justify-center text-sm">🏪</div>
                      <div>
                        <div className="text-[12px] font-bold text-stone-800">{s['매장명'] || s['매장']}</div>
                        <div className="text-[10px] text-stone-400">{date}</div>
                      </div>
                    </div>
                  </div>
                  {/* 이미지 플레이스홀더 */}
                  <div className="w-full aspect-[4/3] bg-gradient-to-br from-stone-100 to-stone-200 flex flex-col items-center justify-center gap-1.5">
                    <div className="w-9 h-9 rounded-xl bg-white/70 flex items-center justify-center text-lg">🛡</div>
                    <span className="text-[10px] text-stone-400 font-medium">AI 안전가이드 이미지</span>
                  </div>
                  {/* 수칙 플레이스홀더 */}
                  <div className="px-3 py-2.5 border-b border-stone-100">
                    <div className="text-[10px] font-bold text-stone-400 mb-1.5">오늘의 안전 수칙</div>
                    <div className="space-y-1">
                      <div className="h-2.5 bg-stone-100 rounded-full w-4/5" />
                      <div className="h-2.5 bg-stone-100 rounded-full w-3/5" />
                    </div>
                  </div>
                  {/* 버튼 */}
                  <div className="px-3 py-2.5 text-center text-[11px] font-bold text-stone-500">
                    안전가이드 전체 보기 &rsaquo;
                  </div>
                </div>
              ))}
              {selectedStores.length > 2 && (
                <div className="text-center text-[10px] text-stone-400">
                  외 {selectedStores.length - 2}개 매장 동일 형식 발송
                </div>
              )}
              <div className="text-[10px] text-stone-400 bg-white rounded-lg px-3 py-2 border border-stone-100">
                💡 실제 카드는 AI가 생성한 안전가이드 내용으로 채워집니다
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
                          <span className="font-medium text-[#1D4ED8]">직원:</span> {s.guide_preview.emp}
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
                  {s.status === 'sent' && (
                    <div className="mt-3 pt-3 border-t border-stone-100">
                      <div className="text-[11px] font-bold text-stone-400 mb-2">발송된 카카오 피드카드 미리보기</div>
                      {/* 카카오 피드카드 미니 시뮬레이터 */}
                      <div className="rounded-xl overflow-hidden border border-stone-200 bg-white shadow-sm max-w-[320px]">
                        {/* 카드 헤더 */}
                        <div className="px-4 pt-3 pb-2.5 border-b border-stone-100">
                          <div className="text-[15px] font-extrabold text-stone-950 leading-tight">
                            {s.risk_cust === 'high' ? '🔴' : s.risk_cust === 'medium' ? '🟡' : '🟢'} {s.store_name || s.store_code} · 안전 가이드
                          </div>
                          <div className="text-[11px] text-stone-500 mt-1 leading-relaxed line-clamp-3">
                            {s.guide_preview?.cust || s.guide_preview?.emp || '오늘의 안전가이드를 확인해주세요.'}
                          </div>
                        </div>
                        {/* 이미지 플레이스홀더 */}
                        <div className="w-full aspect-[4/3] bg-gradient-to-br from-stone-100 to-stone-200 flex flex-col items-center justify-center gap-1">
                          <div className="w-10 h-10 rounded-xl bg-white/60 flex items-center justify-center">
                            <Bell size={20} className="text-stone-400" />
                          </div>
                          <span className="text-[10px] text-stone-400">안전가이드 이미지</span>
                        </div>
                        {/* 하단 버튼 */}
                        <div className="border-t border-stone-100">
                          <div className="w-full py-3 text-center text-[12px] font-bold text-stone-600">
                            안전가이드 전체 보기
                          </div>
                        </div>
                      </div>
                      {/* S3 랜딩 링크 힌트 */}
                      <div className="mt-2 text-[11px] text-stone-400 flex items-center gap-1">
                        <span>버튼 탭 시 S3 랜딩페이지로 이동</span>
                      </div>
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
          <div>2. 발송 버튼 클릭{kakaoEnabled ? " (수신자 프리셋 또는 직접 UUID 입력 필요)" : ""}</div>
          <div>3. 매장별 안전가이드 생성 후 발송 결과가 알림 현황 탭에 저장됨</div>
          <div className="pt-1 text-amber-600">※ 실제 카카오 발송은 배포 환경에서 별도 활성화가 필요합니다</div>
        </div>
      )}

      {/* 프리셋 관리 모달 */}
      {showPresetManager && (
        <RecipientPresetManager
          presets={presets}
          onChange={(updated) => { setPresets(updated); }}
          onClose={() => setShowPresetManager(false)}
        />
      )}
    </div>
  );
}

export default AlertSend;

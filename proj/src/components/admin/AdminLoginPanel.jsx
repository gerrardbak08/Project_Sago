import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { Lock } from 'lucide-react';
import { DAISO_RED } from '../../constants/colors.js';

function AdminLoginPanel({ onLogin, onCancel }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const ADMIN_PIN = "dasoo2026"; // 실제 운영시 환경변수/서버 검증 권장
  
  const handleSubmit = () => {
    if (pin === ADMIN_PIN) {
      onLogin();
    } else {
      setError("PIN이 올바르지 않습니다");
      setTimeout(() => setError(""), 2500);
    }
  };
  
  return (
    <div className="fixed inset-0 bg-stone-900/50 backdrop-blur flex items-center justify-center z-50 p-4" onClick={onCancel}>
      <div className="bg-white rounded-lg p-6 max-w-md w-full shadow-[0_4px_12px_rgba(0,0,0,0.08)]" onClick={e => e.stopPropagation()}>
        <div className="flex items-center gap-3 mb-4">
          <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-[#1D4ED8]"><Lock size={22} strokeWidth={2} /></div>
          <div>
            <div className="text-lg font-extrabold text-stone-900">관리자 로그인</div>
            <div className="text-xs text-stone-500">데이터 업로드·초기화 권한이 필요합니다</div>
          </div>
        </div>
        <div className="text-xs text-stone-600 mb-2 font-semibold">관리자 PIN</div>
        <input 
          type="password" 
          value={pin} 
          onChange={e => setPin(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
          autoFocus
          placeholder="PIN 입력..."
          className="w-full px-3 py-2.5 border border-stone-300 rounded-lg text-sm focus:outline-none focus:border-[#1D4ED8] font-mono"
        />
        {error && <div className="mt-2 text-xs text-red-600 font-semibold">{error}</div>}
        <div className="flex gap-2 mt-4">
          <button onClick={onCancel} className="flex-1 px-4 py-2 rounded-lg border border-stone-200 text-sm font-semibold text-stone-600 hover:bg-stone-50 cursor-pointer">취소</button>
          <button onClick={handleSubmit} className="flex-1 px-4 py-2 rounded-lg bg-[#1D4ED8] text-white text-sm font-semibold hover:bg-[#003B8F] cursor-pointer">로그인</button>
        </div>
        <div className="mt-4 p-3 rounded-lg bg-stone-50 border border-stone-200 text-xs text-stone-500">
          <b>데모 환경</b>에서는 PIN <code className="bg-white px-1.5 py-0.5 rounded font-mono">dasoo2026</code> 사용. 실제 운영 시 서버 기반 인증 교체 필요
        </div>
      </div>
    </div>
  );
}

// ========== ADMIN TAB: 업로드 전용 ==========
export default AdminLoginPanel;

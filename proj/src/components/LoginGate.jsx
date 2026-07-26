import { useState } from 'react';
import { DIVISIONS, verifyLogin } from '../constants/auth.js';
import { ripple } from '../utils/uifx.js';

// 부문별 접근 로그인 게이트 (소프트 게이트 — constants/auth.js 참고)
export default function LoginGate({ onLogin }) {
  const [label, setLabel] = useState(DIVISIONS[0].label);
  const [pw, setPw] = useState('');
  const [err, setErr] = useState(false);

  const submit = (e) => {
    e.preventDefault();
    const scope = verifyLogin(label, pw);
    if (!scope) { setErr(true); return; }
    onLogin(scope);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-5"
      style={{ background: 'linear-gradient(135deg,#FBF3F2 0%,#F6F3F8 45%,#F3F6F4 100%)' }}
    >
      <style>{`@keyframes lgUp{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}@media (prefers-reduced-motion:reduce){.lg-ent{animation:none!important}}`}</style>
      <div
        className="w-full max-w-[440px] bg-white rounded-[28px] overflow-hidden relative lg-ent"
        style={{ boxShadow: '0 24px 60px rgba(7,30,74,0.14), 0 4px 14px rgba(7,30,74,0.06)', animation: 'lgUp .5s cubic-bezier(.2,.7,.3,1) both' }}
      >
        {/* 상단 그라데이션 스트라이프 */}
        <div style={{ height: 6, background: 'linear-gradient(90deg,#E0323C 0%,#8B2FB0 32%,#1D4ED8 58%,#0F9A8E 80%,#D4AF37 100%)' }} />

        <div className="px-8 sm:px-10 pt-9 pb-9">
          {/* 로고 */}
          <div className="flex items-start gap-2 relative lg-ent" style={{ animation: 'lgUp .55s cubic-bezier(.2,.7,.3,1) both', animationDelay: '.1s' }}>
            <div className="flex items-baseline gap-1.5">
              <span
                className="text-[34px] font-black tracking-tight leading-none"
                style={{ background: 'linear-gradient(90deg,#E0323C,#002B6D)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
              >ASUNG</span>
            </div>
            <span className="text-[34px] font-black tracking-tight leading-none text-stone-400 -ml-0.5">DAISO</span>
            <span className="absolute -top-2 right-0 text-[11px] font-bold text-[#8A6D00] bg-[#FDF0BE] px-2.5 py-1 rounded-full whitespace-nowrap" style={{ transform: 'rotate(-2deg)' }}>
              오늘도 안전하게!
            </span>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-black text-[#071E4A] mt-5 tracking-tight leading-snug lg-ent" style={{ animation: 'lgUp .55s cubic-bezier(.2,.7,.3,1) both', animationDelay: '.18s' }}>
            산업재해 현황 분석 대시보드
          </h1>

          <form onSubmit={submit} className="mt-8 lg-ent" style={{ animation: 'lgUp .55s cubic-bezier(.2,.7,.3,1) both', animationDelay: '.26s' }}>
            {/* 영업부문 선택 — 단일 계정이면 드롭다운 숨김 */}
            {DIVISIONS.length > 1 && (
              <>
                <label className="block text-[15px] font-bold text-[#071E4A] mb-2">영업부문 선택</label>
                <select
                  value={label}
                  onChange={(e) => { setLabel(e.target.value); setErr(false); }}
                  className="w-full h-[52px] px-4 rounded-2xl border border-stone-200 text-[15px] text-stone-800 bg-white cursor-pointer outline-none focus:border-[#1D4ED8] transition"
                  style={{ fontFamily: 'inherit' }}
                >
                  {DIVISIONS.map((d) => (
                    <option key={d.label} value={d.label}>{d.label}</option>
                  ))}
                </select>
              </>
            )}

            {/* 비밀번호 */}
            <label className={`block text-[15px] font-bold text-[#071E4A] mb-2 ${DIVISIONS.length > 1 ? 'mt-5' : ''}`}>비밀번호</label>
            <input
              type="password"
              value={pw}
              autoFocus
              onChange={(e) => { setPw(e.target.value); setErr(false); }}
              placeholder="비밀번호 입력"
              className="w-full h-[52px] px-4 rounded-2xl border text-[15px] text-stone-800 bg-white outline-none transition"
              style={{ borderColor: err ? '#E0323C' : undefined }}
              onFocus={(e) => { if (!err) e.target.style.borderColor = '#1D4ED8'; }}
              onBlur={(e) => { if (!err) e.target.style.borderColor = ''; }}
            />
            {err && <div className="text-[13px] text-[#D70011] mt-2 font-semibold">비밀번호가 올바르지 않습니다.</div>}

            <button
              type="submit"
              onMouseDown={ripple}
              className="relative overflow-hidden w-full h-[54px] mt-7 rounded-2xl text-white text-[16px] font-bold cursor-pointer transition active:opacity-80"
              style={{ background: 'linear-gradient(180deg,#E5404A,#D70011)', boxShadow: '0 10px 24px rgba(215,0,17,0.28)' }}
            >
              로그인
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}

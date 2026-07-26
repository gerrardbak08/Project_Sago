// ── 대시보드 전용 모션 유틸 ──────────────────────────────
// CSS-only / 순수 React 훅. 외부 라이브러리 없음.
import { useState, useEffect, useRef } from 'react';

const DASH_CSS = `
@keyframes dashSlideUp {
  from { opacity: 0; transform: translateY(18px); }
  to   { opacity: 1; transform: none; }
}
@keyframes dashSlideDown {
  from { opacity: 0; transform: translateY(-12px); }
  to   { opacity: 1; transform: none; }
}
@keyframes dashFadeIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
@keyframes dashBlurIn {
  from { opacity: 0; filter: blur(8px); }
  to   { opacity: 1; filter: blur(0); }
}
@keyframes dashShimmer {
  0%   { background-position: 100% 0; }
  100% { background-position: -100% 0; }
}
@keyframes dashPulse {
  0%, 100% { transform: scale(1);   opacity: .6; }
  50%       { transform: scale(2.2); opacity: 0; }
}
.dash-slide-up   { animation: dashSlideUp   .4s cubic-bezier(.2,.7,.3,1) both; }
.dash-slide-down { animation: dashSlideDown .4s cubic-bezier(.2,.7,.3,1) both; }
.dash-fade-in    { animation: dashFadeIn   .5s ease both; }
.dash-blur-in    { animation: dashBlurIn   .5s ease both; }

/* 브랜드 sheen — 네이비→레드 저대비 슬로우(히어로 타이틀 전용) */
@keyframes dashSheen { 0% { background-position: 0% 50%; } 100% { background-position: 200% 50%; } }
.dash-sheen {
  background-image: linear-gradient(100deg,#071E4A 0%,#003B8F 38%,#D70011 55%,#003B8F 72%,#071E4A 100%);
  background-size: 200% 100%; -webkit-background-clip: text; background-clip: text;
  -webkit-text-fill-color: transparent; color: transparent;
  animation: dashSheen 7s linear infinite;
}
/* 실시간/알림 펄스 링 */
@keyframes dashPing { from { transform: scale(1); opacity: .5; } to { transform: scale(2.6); opacity: 0; } }
/* 버튼 프레스 — 전역, 차분하게 (기존 active: 유틸이 있으면 그쪽 우선) */
button { transition: transform .12s cubic-bezier(.2,.7,.3,1); }
button:active { transform: scale(.97); }
/* 리플(프라이머리 CTA) */
@keyframes dashRipple { to { transform: scale(3.4); opacity: 0; } }
.dash-ripple { position: absolute; border-radius: 999px; background: rgba(255,255,255,.55); transform: scale(0); animation: dashRipple .6s ease-out; pointer-events: none; }
/* 토스트 */
#dash-toasts { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 400; display: flex; flex-direction: column; gap: 8px; align-items: center; pointer-events: none; }
.dash-toast { background: #071E4A; color: #fff; font-size: 13px; font-weight: 600; padding: 10px 16px; border-radius: 12px; box-shadow: 0 10px 24px rgba(7,30,74,.24); opacity: 0; transform: translateY(12px); transition: opacity .25s, transform .25s; }
.dash-toast.in { opacity: 1; transform: none; }
.dash-toast.ok { background: #047857; } .dash-toast.warn { background: #B45309; } .dash-toast.err { background: #D70011; }

@media (prefers-reduced-motion: reduce) {
  * { animation-duration: .001s !important; transition-duration: .001s !important; }
}
`;

/** id='dash-motion' 로 한 번만 <style> inject */
export function injectDashCss() {
  if (typeof document === 'undefined') return;
  if (document.getElementById('dash-motion')) return;
  const el = document.createElement('style');
  el.id = 'dash-motion';
  el.textContent = DASH_CSS;
  document.head.appendChild(el);
}

/**
 * 숫자를 0에서 target까지 duration ms 동안 카운트업.
 * 컴포넌트 마운트(또는 target 변경) 시 자동 실행.
 * @param {number} target  최종 목표 값
 * @param {number} duration 애니메이션 ms (기본 1200)
 * @returns {number} 현재 표시 값
 */
export function useCountUp(target, duration = 1200, enabled = true) {
  const [count, setCount] = useState(0);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!enabled) { setCount(0); return; }            // 뷰포트 진입 전: 0 유지 (스크롤 진입 시 카운트업)
    if (target == null || isNaN(target)) { setCount(0); return; }
    const startTime = performance.now();
    const startVal = 0;

    const tick = (now) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // easeOutCubic
      const ease = 1 - Math.pow(1 - progress, 3);
      setCount(Math.round(startVal + (target - startVal) * ease));
      if (progress < 1) rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [target, duration, enabled]);

  return count;
}

/**
 * ref 요소가 viewport에 들어오면 true 반환.
 * @param {React.RefObject} ref
 * @param {number} threshold  0~1 (기본 0.15)
 * @returns {boolean}
 */
export function useInView(ref, threshold = 0.15) {
  const [inView, setInView] = useState(false);

  useEffect(() => {
    if (!ref?.current) return;
    const el = ref.current;
    const observer = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { setInView(true); observer.disconnect(); } },
      { threshold }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, threshold]);

  return inView;
}

export { DASH_CSS };

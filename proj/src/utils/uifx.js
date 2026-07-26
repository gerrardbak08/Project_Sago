// 가벼운 UI 피드백 — 토스트 & 리플 (외부 라이브러리 없음, CSS는 motion.js DASH_CSS)
import { injectDashCss } from './motion.js';

// 토스트: toast('저장됨', 'ok'|'warn'|'err')
export function toast(message, type = 'ok', ms = 2500) {
  if (typeof document === 'undefined') return;
  injectDashCss();
  let root = document.getElementById('dash-toasts');
  if (!root) { root = document.createElement('div'); root.id = 'dash-toasts'; document.body.appendChild(root); }
  const el = document.createElement('div');
  el.className = `dash-toast ${type}`;
  el.textContent = message;
  root.appendChild(el);
  requestAnimationFrame(() => el.classList.add('in'));
  setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 280); }, ms);
}

// 리플: 프라이머리 버튼 onMouseDown에 연결. 버튼은 position:relative; overflow:hidden 필요.
export function ripple(e) {
  const btn = e.currentTarget;
  if (!btn) return;
  const rect = btn.getBoundingClientRect();
  const d = Math.max(rect.width, rect.height);
  const el = document.createElement('span');
  el.className = 'dash-ripple';
  el.style.width = el.style.height = `${d}px`;
  el.style.left = `${e.clientX - rect.left - d / 2}px`;
  el.style.top = `${e.clientY - rect.top - d / 2}px`;
  btn.appendChild(el);
  setTimeout(() => el.remove(), 650);
}

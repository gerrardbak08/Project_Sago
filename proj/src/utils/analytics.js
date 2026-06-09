/**
 * SAGO AI — Multi-destination analytics abstraction
 *
 * SDK 자동 초기화:
 *   Amplitude  → VITE_AMPLITUDE_API_KEY 설정 시 자동 init
 *   Accoil     → VITE_ACCOIL_API_KEY   설정 시 자동 init
 *
 * 키 없이도 동작 (큐잉 + 콘솔 로그). 키 추가 후 재빌드하면 즉시 활성화.
 */

import * as amplitude from '@amplitude/analytics-browser';

// ---------------------------------------------------------------------------
// Named event constants
// ---------------------------------------------------------------------------

export const PAGE_VIEW            = 'page_viewed';
export const TAB_VIEWED           = 'tab_viewed';
export const ALERT_SEND_SUBMITTED = 'alert_send_submitted';
export const ALERT_SEND_RESULT    = 'alert_send_result';
export const AI_GUIDE_REQUESTED   = 'ai_guide_requested';
export const AI_GUIDE_RESULT      = 'ai_guide_result';

// ---------------------------------------------------------------------------
// SDK 초기화
// ---------------------------------------------------------------------------

const AMPLITUDE_KEY = import.meta.env.VITE_AMPLITUDE_API_KEY;
const ACCOIL_KEY    = import.meta.env.VITE_ACCOIL_API_KEY;

let _amplitudeReady = false;

if (AMPLITUDE_KEY) {
  amplitude.init(AMPLITUDE_KEY, {
    defaultTracking: { sessions: true, pageViews: false, formInteractions: false, fileDownloads: false },
    logLevel: import.meta.env.DEV ? amplitude.Types.LogLevel.Warn : amplitude.Types.LogLevel.None,
  });
  _amplitudeReady = true;
  if (import.meta.env.DEV) console.log('[📊 SAGO Analytics] Amplitude initialized');
}

// Accoil: CDN 스크립트로 로드되거나 window.accoil 전역이 설정된 경우 사용
// VITE_ACCOIL_API_KEY가 있으면 index.html CDN 스니펫이 자동 초기화함 (아래 참고)

// ---------------------------------------------------------------------------
// 내부 이벤트 큐 (최대 100개 — SDK 미연결 환경에서 드레인용)
// ---------------------------------------------------------------------------

const QUEUE_LIMIT = 100;

function getQueue() {
  if (!Array.isArray(window._sagoAnalyticsQueue)) window._sagoAnalyticsQueue = [];
  return window._sagoAnalyticsQueue;
}

function enqueue(name, props) {
  const q = getQueue();
  if (q.length >= QUEUE_LIMIT) q.shift();
  q.push({ name, props });
}

// ---------------------------------------------------------------------------
// track
// ---------------------------------------------------------------------------

export function track(eventName, properties = {}) {
  if (!eventName || typeof eventName !== 'string') return;

  const enriched = { ...properties, _source: 'sago_ai' };

  if (import.meta.env.DEV) {
    console.log('[📊 SAGO Analytics]', eventName, enriched);
  }

  // Amplitude npm SDK
  if (_amplitudeReady) {
    try { amplitude.track(eventName, enriched); } catch (e) { /* silent */ }
  }

  // Accoil (CDN global)
  if (typeof window !== 'undefined' && window.accoil?.track) {
    try { window.accoil.track(eventName, enriched); } catch (e) { /* silent */ }
  }

  // Amplitude CDN global (fallback — CDN 방식 혼용 시)
  if (!_amplitudeReady && typeof window !== 'undefined' && window.amplitude?.track) {
    try { window.amplitude.track(eventName, enriched); } catch (e) { /* silent */ }
  }

  enqueue(eventName, enriched);
}

// ---------------------------------------------------------------------------
// identify
// ---------------------------------------------------------------------------

export function identify(userId, traits = {}) {
  if (!userId) return;

  if (import.meta.env.DEV) console.log('[📊 SAGO Analytics] identify', userId, traits);

  if (_amplitudeReady) {
    try {
      amplitude.setUserId(String(userId));
      const idObj = new amplitude.Identify();
      Object.entries(traits).forEach(([k, v]) => idObj.set(k, v));
      amplitude.identify(idObj);
    } catch (e) { /* silent */ }
  }

  if (typeof window !== 'undefined' && window.accoil?.identify) {
    try { window.accoil.identify(userId, traits); } catch (e) { /* silent */ }
  }
}

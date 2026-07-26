// 안전보건 활동 실시 기록 데이터 레이어 — 3모듈(위험성평가·비상대응훈련·TBM) 공통 단일 소스.
// ─────────────────────────────────────────────────────────────────────────
// SOURCE 심: 지금은 localStorage(즉시 작동·단일 브라우저 데모), 실서비스는 Apps Script doPost로
// 스왑(BACKEND='apps-script'). 화면 코드는 이 모듈의 함수만 호출하므로 백엔드 교체 시 무수정.
//   go-live: proj/scripts/APPS_SCRIPT_TBM_PATCH.md 참고.

export const COMPLIANCE_BACKEND = 'local'; // 'local' | 'apps-script'
export const COMPLIANCE_SOURCE = { endpoint: '' }; // Apps Script exec URL (go-live 시 채움)

const KEY = (program) => `sago_compliance_${program}_v1`;
const safeParse = (s) => { try { return JSON.parse(s || '[]'); } catch { return []; } };

// 프로그램별 실시 기록 목록 (최신순)
export function listRecords(program) {
  if (COMPLIANCE_BACKEND === 'local' && typeof localStorage !== 'undefined') {
    return safeParse(localStorage.getItem(KEY(program)));
  }
  return [];
}

// 실시 기록 저장. rec = { store, dept, team, bum, date, manager, note, ...program고유필드 }
export async function submitRecord(program, rec) {
  const record = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    program,
    createdAt: new Date().toISOString(),
    ...rec,
  };
  if (COMPLIANCE_BACKEND === 'local' && typeof localStorage !== 'undefined') {
    const all = listRecords(program);
    all.unshift(record);
    try { localStorage.setItem(KEY(program), JSON.stringify(all)); } catch {}
    notify(program);
    return { ok: true, record };
  }
  // apps-script: 서버 저장 (go-live)
  const res = await fetch(COMPLIANCE_SOURCE.endpoint, {
    method: 'POST', redirect: 'follow',
    body: JSON.stringify({ action: 'compliance_create', ...record }),
  });
  return res.json();
}

// 기록 목록 가져오기 (백엔드 무관·비동기). local=즉시, apps-script=서버 GET.
export async function fetchRecords(program) {
  if (COMPLIANCE_BACKEND === 'local') return listRecords(program);
  const u = new URL(COMPLIANCE_SOURCE.endpoint);
  u.searchParams.set('action', 'compliance_list');
  u.searchParams.set('program', program);
  const res = await fetch(u, { redirect: 'follow', cache: 'no-store' });
  const j = await res.json();
  return j.records || [];
}

// 기록 배열 → 매장명별 최신 기록 Map (모니터가 매장별 현황 계산에 사용)
export function latestFrom(records) {
  const map = new Map();
  for (const r of records || []) {
    if (!r || !r.store) continue;
    const cur = map.get(r.store);
    if (!cur || String(r.date || '') > String(cur.date || '')) map.set(r.store, r);
  }
  return map;
}
export function latestByStore(program) { return latestFrom(listRecords(program)); }

// 입력 발생 시 열려있는 모니터에 알림(같은 탭 즉시 반영)
function notify(program) {
  try { window.dispatchEvent(new CustomEvent('sago-compliance-updated', { detail: { program } })); } catch {}
}

export const COMPLIANCE_EVENT = 'sago-compliance-updated';

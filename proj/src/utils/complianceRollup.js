// 안전보건 활동 집계 공용 헬퍼 — 모니터(개별)와 종합 뷰가 동일 로직을 공유(수치 정합).
// 실입력 기록이 있는 매장은 실데이터, 없으면 결정론적 샘플로 채운다. 실입력 연동 완료 시
// buildStoreRows의 샘플 분기만 제거하면 된다.
import { statusOf } from '../constants/compliancePrograms.js';

function fnv(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }

// 매장 목록 + 최신 실기록 Map → 매장별 실시현황 rows
export function buildStoreRows(program, stores, latestMap, cadenceDays) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return (stores || []).filter((s) => s && s.store).map((s) => {
    const base = { store: s.store, bum: s.bum || '기타', dept: s.dept || '미분류', team: s.team || '미분류' };
    const rec = latestMap && latestMap.get(s.store);
    if (rec) {
      const ds = Math.max(0, Math.round((today - new Date(rec.date)) / 86400000));
      return { ...base, daysSince: ds, status: statusOf(ds, cadenceDays), count: 1, attend: Number(rec.attendees) || 0, real: true };
    }
    const h = fnv(s.store + '|' + program);
    const hasRecord = (h >> 3) % 10 !== 0;                 // 약 10% 미실시
    const ds = hasRecord ? h % Math.round(cadenceDays * 2.4) : null;
    return {
      ...base, daysSince: ds, status: statusOf(ds, cadenceDays),
      count: program === 'tbm' ? (h >> 4) % 6 : 1 + ((h >> 4) % 3),
      attend: 6 + ((h >> 8) % 18), real: false,
    };
  });
}

// rows → 상태 집계 { total, ok, due, overdue, never, rate(실시율%), attention(주의=기한초과+미실시) }
export function aggregate(rows) {
  const total = rows.length || 1;
  const c = { ok: 0, due: 0, overdue: 0, never: 0 };
  for (const r of rows) c[r.status] = (c[r.status] || 0) + 1;
  return { total: rows.length, ...c, rate: Math.round(((c.ok + c.due) / total) * 100), attention: c.overdue + c.never };
}

// rows → key(bum/dept/team)별 집계 배열
export function rollupBy(rows, key) {
  const m = new Map();
  for (const r of rows) { const k = r[key]; if (!m.has(k)) m.set(k, []); m.get(k).push(r); }
  return [...m.entries()].map(([k, rs]) => ({ key: k, ...aggregate(rs) }));
}

// 실시율 색 (높을수록 초록)
export function rateColor(r) { return r >= 90 ? '#047857' : r >= 70 ? '#B45309' : '#D70011'; }

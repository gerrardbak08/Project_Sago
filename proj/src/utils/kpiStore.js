/**
 * KPI 목표 저장소 — kpi_targets.json(번들) + localStorage 오버레이 병합
 * 대시보드(읽기)와 관리자 패널(쓰기) 모두 이 모듈의 API 를 사용한다.
 * org_rollup.json 에서 2026 YTD 실적을 읽어 프로레이션 비교를 수행한다.
 */
import kpiTargetsRaw from '../data/kpi_targets.json';
import orgRollup from '../data/org_rollup.json';
import { computeProgress } from './kpiProgress.js';
import { useState, useEffect } from 'react';

const LS_KEY  = 'sago_kpi_targets';
const EV_NAME = 'kpi-targets-updated';

// ── 단일 read 경로 ──────────────────────────────────────────

/**
 * kpi_targets.json(번들) + localStorage 오버레이를 병합해 반환.
 * 관리자 수정이 저장된 경우 해당 조직의 target_incidents·edited 를 덮어쓴다.
 */
export function loadTargets() {
  const base = kpiTargetsRaw;
  try {
    const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LS_KEY) : null;
    if (!raw) return base;
    const saved = JSON.parse(raw);
    if (!saved?.levels) return base;
    const merged = {
      ...base,
      levels: {
        bumun: { ...base.levels.bumun },
        dept:  { ...base.levels.dept  },
        team:  { ...base.levels.team  },
      },
    };
    for (const level of ['bumun', 'dept', 'team']) {
      if (!saved.levels[level]) continue;
      for (const [key, val] of Object.entries(saved.levels[level])) {
        if (merged.levels[level][key]) {
          merged.levels[level][key] = { ...merged.levels[level][key], ...val };
        }
      }
    }
    return merged;
  } catch {
    return base;
  }
}

/**
 * localStorage 에 저장하고 'kpi-targets-updated' 이벤트를 발행.
 * 대시보드 배지를 포함하는 모든 컴포넌트가 useKpiVersion() 으로 즉시 재렌더된다.
 */
export function saveTargets(merged) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LS_KEY, JSON.stringify({ levels: merged.levels }));
      window.dispatchEvent(new CustomEvent(EV_NAME));
    }
  } catch {}
}

/**
 * 특정 조직의 목표 객체 반환.
 * @param {'bumun'|'dept'|'team'} level
 * @param {string} key 조직명
 */
export function getTarget(level, key) {
  return loadTargets().levels?.[level]?.[key] ?? null;
}

// ── 경과 개월 수 계산 ───────────────────────────────────────

let _cachedMonths = null;
function _computeMonthsElapsed() {
  let max = 0;
  for (const levelData of Object.values(orgRollup.levels || {})) {
    for (const entry of Object.values(levelData)) {
      for (const m of Object.keys(entry.months || {})) {
        if (m.startsWith('2026-')) {
          const mo = parseInt(m.split('-')[1], 10);
          if (mo > max) max = mo;
        }
      }
    }
  }
  return max > 0 ? max : 6;
}

/**
 * org_rollup 기준 2026년 최신 월 = 경과 개월 수 (예: 6 = 1~6월)
 * 모듈 수준 캐시로 중복 계산 방지.
 */
export function getMonthsElapsed() {
  if (_cachedMonths == null) _cachedMonths = _computeMonthsElapsed();
  return _cachedMonths;
}

// ── YTD 실적 & 진척 계산 ────────────────────────────────────

/** org_rollup 에서 해당 조직의 2026 YTD 실적건수 (null=데이터 없음) */
function _getActualYtd(level, key) {
  const entry = orgRollup.levels?.[level]?.[key];
  if (!entry?.months) return null;
  return Object.entries(entry.months)
    .filter(([m]) => m.startsWith('2026-'))
    .reduce((s, [, v]) => s + v, 0);
}

/**
 * 조직의 KPI 진척 계산 — YTD 실적 vs 프로레이션 목표.
 * annual target × (monthsElapsed/12) 로 공정 비교.
 * @returns computeProgress 결과 객체 or null
 */
export function getKpiProgress(level, key) {
  const tgt = getTarget(level, key);
  if (!tgt || tgt.baseline_incidents == null || tgt.target_incidents == null) return null;
  const actual = _getActualYtd(level, key);
  if (actual == null) return null;
  const me = getMonthsElapsed();
  const proratedTarget   = tgt.target_incidents   * me / 12;
  const proratedBaseline = tgt.baseline_incidents * me / 12;
  return computeProgress({ actual, target: proratedTarget, baseline: proratedBaseline });
}

// ── React 훅 ────────────────────────────────────────────────

/**
 * 'kpi-targets-updated' 이벤트 수신 훅.
 * 컴포넌트에서 호출하면 saveTargets 직후 자동 재렌더된다.
 * @returns {number} 버전 카운터 (의존성 배열 불필요 — 훅 호출만으로 충분)
 */
export function useKpiVersion() {
  const [v, setV] = useState(0);
  useEffect(() => {
    const handler = () => setV(n => n + 1);
    window.addEventListener(EV_NAME, handler);
    return () => window.removeEventListener(EV_NAME, handler);
  }, []);
  return v;
}

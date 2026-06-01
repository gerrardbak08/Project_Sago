"""
risk_score.py — 위험 점수 트리거 엔진 (순수 Python, math만 사용)

각 매장 × 오늘(또는 예보) 조건에 대해 정량 위험 점수를 계산하고,
임계 초과 + 신뢰도 충족 시에만 알림을 발동(trigger)한다.
generate_guide()(Bedrock 호출) **이전**에 실행되어 LLM 스킵 게이트로 작동한다.

설계 (docs/alphafold-transfer-analysis.md 착안):
  - MSA(동족서열 pooling) → 유사 매장군 pooling: 매장당 사고가 1~2건뿐이라
    개별 학습 불가 → 형제 리프(expand_with_siblings) 사례를 후보 풀로 사용.
  - pLDDT(신뢰도) → conformal compute_confidence 게이트: 확신할 때만 발동.

위험 점수 = 0.45·S2 + 0.30·S1 + 0.25·S3
  S1 조건위험  : leaf 규칙 risk_level (높음/중간/낮음)
  S2 사례근접도: 유사 매장군 사례 top-k 평균 IQR거리 → exp(-d̄/τ)  [최고 가중]
  S3 심각도믹스: leaf 유형분포 × 심각도 가중치 가중평균
발동 = (risk_score >= θ_score) AND confidence_gate(G)

Lambda는 sklearn/numpy-free 순수 Python (rule_matcher.py 패턴). math만 사용한다.
"""

from __future__ import annotations

import math
from typing import Any

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
_RISK_LEVEL_MAP = {"높음": 1.0, "중간": 0.5, "낮음": 0.15}

# 점수 결합 가중치 (risk_policy.json으로 override 가능)
DEFAULT_WEIGHTS = {"S1": 0.30, "S2": 0.45, "S3": 0.25}

# 임계 기본값 (risk_policy.json valid 시 거기서 로드; env RISK_SCORE_THRESHOLD override)
DEFAULT_THRESHOLDS = {"theta_score": 0.55, "theta_high": 0.75, "tau": 1.0}

# 거리 계산 — llm.rank_incidents._dist 와 동일 공식 (1차 복제, 추후 통합 가능)
_WEATHER_FEATS = [
    "temperature_2m_min", "temperature_2m_max", "precipitation_sum",
    "snowfall_sum", "rain_sum", "wind_speed_10m_max",
    "relative_humidity_2m_mean", "soil_temperature_0_to_7cm_mean",
]
_STORE_NUM_FEATS = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]


# ──────────────────────────────────────────────
# S1 — 조건 위험도
# ──────────────────────────────────────────────
def condition_risk(rule_str: str, type_counts: dict | None = None) -> float:
    """leaf 규칙의 risk_level(높음/중간/낮음)을 0~1 점수로. enrich_leaf_rule 재사용."""
    try:
        from core.rule_enrichment import enrich_leaf_rule
        level = enrich_leaf_rule(rule_str, type_counts or {}).get("risk_level", "중간")
    except Exception:
        return 0.5
    return _RISK_LEVEL_MAP.get(level, 0.5)


# ──────────────────────────────────────────────
# S2 — 사례 근접도 (MSA pooling 핵심)
# ──────────────────────────────────────────────
def _normalized_distance(inc: dict, today: dict, feature_stats: dict) -> float:
    """IQR 정규화 가중 거리 (기상×2 / 매장수치×1 / 형태×0.5). 작을수록 유사.

    llm.rank_incidents 내부 _dist 와 동일 공식 (순수 Python 복제).
    """
    total_w = 0.0
    total_d = 0.0
    for feat in _WEATHER_FEATS:
        t_val = today.get(feat)
        i_val = inc.get(feat)
        if t_val is None or i_val is None:
            continue
        try:
            iqr = feature_stats.get(feat, {}).get("iqr") or 1.0
            total_d += 2.0 * abs(float(t_val) - float(i_val)) / iqr
            total_w += 2.0
        except (TypeError, ValueError):
            continue
    for feat in _STORE_NUM_FEATS:
        t_val = today.get(feat)
        i_val = inc.get(feat)
        if t_val is None or i_val is None:
            continue
        try:
            iqr = feature_stats.get(feat, {}).get("iqr") or 1.0
            total_d += abs(float(t_val) - float(i_val)) / iqr
            total_w += 1.0
        except (TypeError, ValueError):
            continue
    t_type = today.get("형태")
    i_type = inc.get("형태")
    if t_type is not None and i_type is not None:
        try:
            match = int(float(t_type)) == int(float(i_type))
            total_d += 0.5 * (0.0 if match else 1.0)
            total_w += 0.5
        except (TypeError, ValueError):
            pass
    return total_d / total_w if total_w > 0 else float("inf")


def case_proximity(
    incidents: list[dict],
    today_weather: dict,
    today_store: dict,
    feature_stats: dict,
    k: int = 5,
    tau: float = 1.0,
    exclude_ids: set | None = None,
) -> float:
    """유사 매장군 사례 중 오늘 조건과 가장 가까운 top-k의 평균거리 → exp(-d̄/τ).

    오늘 조건이 과거 사고 사례와 가까울수록(d̄↓) 1.0에 근접 → "위험이 실재함".
    feature_stats 없거나 사례 없으면 중립값 0.0 반환(근접 신호 없음).
    exclude_ids: 후보에서 제외할 incident_id 집합 (오프라인 leave-one-out 평가용,
                 자기 사례 누수 방지). 런타임 기본 None → 영향 없음.
    """
    if not incidents or not feature_stats:
        return 0.0
    if exclude_ids:
        incidents = [inc for inc in incidents
                     if str(inc.get("incident_id")) not in exclude_ids]
        if not incidents:
            return 0.0
    today = {**today_weather, **today_store}
    dists = sorted(_normalized_distance(inc, today, feature_stats) for inc in incidents)
    finite = [d for d in dists[:k] if d != float("inf")]
    if not finite:
        return 0.0
    d_mean = sum(finite) / len(finite)
    return math.exp(-d_mean / tau) if tau > 0 else 0.0


# ──────────────────────────────────────────────
# S3 — 심각도 믹스
# ──────────────────────────────────────────────
def severity_mix(class_counts: dict | None, severity_weights: dict | None) -> float:
    """leaf 유형분포 × 심각도 가중치 가중평균. 누락 유형은 기본 0.5."""
    if not class_counts:
        return 0.5
    weights = severity_weights or {}
    num = 0.0
    den = 0.0
    for label, cnt in class_counts.items():
        try:
            c = float(cnt)
        except (TypeError, ValueError):
            continue
        w = weights.get(str(label), 0.5)
        num += w * c
        den += c
    return num / den if den > 0 else 0.5


# ──────────────────────────────────────────────
# G — 신뢰도 게이트 (pLDDT 대응)
# ──────────────────────────────────────────────
def confidence_gate(confidence: str, policy: str = "block_low") -> bool:
    """발동 허용 여부. block_low: low면 차단(False), med/high 통과(True)."""
    if policy == "block_low":
        return confidence != "low"
    if policy == "high_only":
        return confidence == "high"
    return True


# ──────────────────────────────────────────────
# 통합 — 위험 점수 + 트리거 판정
# ──────────────────────────────────────────────
def compute_risk_score(
    *,
    rule_str: str,
    class_counts: dict | None,
    incidents: list[dict],
    today_weather: dict,
    today_store: dict,
    feature_stats: dict,
    confidence: str = "med",
    severity_weights: dict | None = None,
    thresholds: dict | None = None,
    weights: dict | None = None,
    gate_policy: str = "block_low",
    exclude_ids: set | None = None,
) -> dict[str, Any]:
    """4개 신호를 결합해 위험 점수와 트리거 발동 여부를 반환한다.

    Returns:
        {
          "risk_score": float,                 # 0~1
          "signals": {"S1":.., "S2":.., "S3":..},
          "confidence": str,
          "trigger": bool,                     # 점수>=θ_score AND 신뢰게이트
          "severity": "high"|"normal",         # 쿨다운 override 호환
          "reason": str,
        }
    """
    th = {**DEFAULT_THRESHOLDS, **(thresholds or {})}
    w = {**DEFAULT_WEIGHTS, **(weights or {})}
    tau = float(th.get("tau", 1.0))

    s1 = condition_risk(rule_str, class_counts)
    s2 = case_proximity(incidents, today_weather, today_store, feature_stats,
                        tau=tau, exclude_ids=exclude_ids)
    s3 = severity_mix(class_counts, severity_weights)

    score = w["S1"] * s1 + w["S2"] * s2 + w["S3"] * s3

    gate_ok = confidence_gate(confidence, gate_policy)
    theta_score = float(th["theta_score"])
    theta_high = float(th["theta_high"])

    trigger = bool(score >= theta_score and gate_ok)
    severity = "high" if (score >= theta_high and confidence == "high") else "normal"

    if not gate_ok:
        reason = f"gated:confidence={confidence}"
    elif trigger:
        reason = f"trigger:score={score:.3f}>=θ{theta_score:.2f},sev={severity}"
    else:
        reason = f"below:score={score:.3f}<θ{theta_score:.2f}"

    return {
        "risk_score": round(score, 4),
        "signals": {"S1": round(s1, 4), "S2": round(s2, 4), "S3": round(s3, 4)},
        "confidence": confidence,
        "trigger": trigger,
        "severity": severity,
        "reason": reason,
    }

"""
rule_matcher.py — 순수 Python 리프 노드 매칭 (sklearn 무의존)

Lambda에서 sklearn 없이 동작하기 위해 leaf_table.json의 규칙 문자열을
파싱하여 입력 피처와 매칭한다.

규칙 형식 (train.py가 생성):
  - "temperature_2m_min <= -0.5 & 평수 > 100.0"
  - "root" (루트 리프인 경우)
"""

from __future__ import annotations

import re
from typing import Any

# ──────────────────────────────────────────────
# 규칙 파싱
# ──────────────────────────────────────────────
# 조건 하나를 매칭하는 정규식: "feature_name op threshold"
# 피처명에 한글, 영문, 숫자, 밑줄, 괄호, ㎡ 등이 올 수 있음
_CONDITION_RE = re.compile(
    r"([A-Za-z0-9_가-힣()㎡]+)\s*(<=|>=|<|>)\s*(-?[\d.]+)"
)


def parse_rule(rule_str: str) -> list[tuple[str, str, float]]:
    """규칙 문자열을 (feature, operator, threshold) 튜플 리스트로 파싱.

    Args:
        rule_str: "feature <= 1.5 & feature2 > 3.0" 형태의 규칙 문자열.
                  "root" 또는 빈 문자열이면 빈 리스트 반환.

    Returns:
        [(feature_name, operator, threshold), ...] 리스트.
    """
    if not rule_str or rule_str.strip().lower() == "root":
        return []

    conditions = []
    for part in rule_str.split("&"):
        part = part.strip()
        if not part:
            continue
        m = _CONDITION_RE.match(part)
        if m:
            feature = m.group(1)
            op = m.group(2)
            threshold = float(m.group(3))
            conditions.append((feature, op, threshold))
    return conditions


# ──────────────────────────────────────────────
# 조건 평가
# ──────────────────────────────────────────────
def _evaluate_condition(value: float, op: str, threshold: float) -> bool:
    """단일 조건을 평가한다."""
    if op == "<=":
        return value <= threshold
    elif op == ">":
        return value > threshold
    elif op == "<":
        return value < threshold
    elif op == ">=":
        return value >= threshold
    return False


# ──────────────────────────────────────────────
# 리프 매칭
# ──────────────────────────────────────────────
def match_leaf(
    features: dict[str, float],
    leaf_table: dict[str, Any],
) -> tuple[str | None, dict | None]:
    """입력 피처를 모든 리프 규칙과 매칭하여 가장 구체적인 리프를 반환.

    Args:
        features: {"feature_name": float_value, ...} 형태의 입력 피처.
        leaf_table: leaf_table.json을 로드한 dict.

    Returns:
        (leaf_id, leaf_data) 튜플. 매칭 실패 시 (None, None).
    """
    best_id: str | None = None
    best_data: dict | None = None
    best_depth = -1  # 조건 수가 가장 많은(가장 구체적인) 리프 선택

    for leaf_id, leaf_data in leaf_table.items():
        rule_str = leaf_data.get("rule", "")
        conditions = parse_rule(rule_str)

        # 모든 조건 검사
        matched = True
        for feat_name, op, threshold in conditions:
            if feat_name not in features:
                matched = False
                break
            if not _evaluate_condition(features[feat_name], op, threshold):
                matched = False
                break

        if matched and len(conditions) > best_depth:
            best_depth = len(conditions)
            best_id = leaf_id
            best_data = leaf_data

    return best_id, best_data


# ──────────────────────────────────────────────
# Fallback 매칭
# ──────────────────────────────────────────────
def match_with_fallback(
    features: dict[str, float],
    leaf_table: dict[str, Any],
    siblings: dict[str, list[int]],
    metadata: dict[str, Any],
) -> tuple[str | None, dict | None, int]:
    """3단계 Fallback 매칭.

    Level 0: match_leaf로 직접 매칭
    Level 1: siblings에서 가장 작은 부모 노드의 자식 리프들을 병합
    Level 2: 글로벌 Fallback (전체 데이터 상위 50건)

    Args:
        features: 입력 피처 dict.
        leaf_table: leaf_table.json dict.
        siblings: siblings.json dict (부모 노드 → 자식 리프 리스트).
        metadata: metadata.json dict.

    Returns:
        (leaf_id, leaf_data, fallback_level) 튜플.
        fallback_level: 0=직접매칭, 1=siblings, 2=글로벌.
    """
    # ── Level 0: 직접 매칭 ──
    leaf_id, leaf_data = match_leaf(features, leaf_table)
    if leaf_id is not None:
        return leaf_id, leaf_data, 0

    # ── Level 1: Siblings Fallback ──
    # 가장 작은 부모 노드(자식 리프 수가 가장 적은)를 찾아 병합
    best_parent: str | None = None
    best_children: list[int] = []

    for parent_id, children in siblings.items():
        # 자식 리프 중 leaf_table에 존재하는 것만
        valid_children = [c for c in children if str(c) in leaf_table]
        if not valid_children:
            continue

        # 가장 작은 부모 선택 (자식 수가 적을수록 구체적)
        if best_parent is None or len(valid_children) < len(best_children):
            best_parent = parent_id
            best_children = valid_children

    if best_children:
        merged = _merge_leaves(leaf_table, best_children)
        return best_parent, merged, 1

    # ── Level 2: 글로벌 Fallback ──
    all_leaf_ids = list(leaf_table.keys())
    if all_leaf_ids:
        merged = _merge_leaves(leaf_table, [int(lid) for lid in all_leaf_ids])
        # incidents를 상위 50건으로 제한
        if merged and "incidents" in merged:
            merged["incidents"] = merged["incidents"][:50]
        return None, merged, 2

    return None, None, 2


def _merge_leaves(
    leaf_table: dict[str, Any],
    leaf_ids: list[int],
) -> dict:
    """여러 리프의 데이터를 병합한다."""
    merged_incidents: list[dict] = []
    merged_summary: dict[str, Any] = {"total": 0}

    for lid in leaf_ids:
        leaf_data = leaf_table.get(str(lid))
        if not leaf_data:
            continue

        summary = leaf_data.get("summary", {})
        merged_summary["total"] += summary.get("total", 0)

        # 라벨 분포 병합
        for key, val in summary.items():
            if key == "total":
                continue
            if isinstance(val, dict):
                if key not in merged_summary:
                    merged_summary[key] = {}
                for k, v in val.items():
                    merged_summary[key][k] = merged_summary[key].get(k, 0) + v

        merged_incidents.extend(leaf_data.get("incidents", []))

    return {
        "leaf_id": None,
        "source": leaf_table.get(str(leaf_ids[0]), {}).get("source", ""),
        "rule": "merged",
        "summary": merged_summary,
        "incidents": merged_incidents,
    }

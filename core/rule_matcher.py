"""
rule_matcher.py - exported Decision Tree rules executor.

Lambda uses this module without sklearn. The training script exports the
DecisionTreeClassifier structure as tree_rules.json, and runtime matching is
just repeated "feature <= threshold ? left : right" traversal.
"""

from __future__ import annotations

import math
import re
from typing import Any


_CONDITION_RE = re.compile(
    r"([A-Za-z0-9_가-힣()㎡]+)\s*(<=|>=|<|>)\s*(-?[\d.]+)"
)


def parse_rule(rule_str: str) -> list[tuple[str, str, float]]:
    """Parse a human-readable leaf rule string for enrichment code."""
    if not rule_str or rule_str.strip().lower() == "root":
        return []

    conditions = []
    for part in rule_str.split("&"):
        match = _CONDITION_RE.match(part.strip())
        if match:
            conditions.append((match.group(1), match.group(2), float(match.group(3))))
    return conditions


def compute_leaf_id(features: dict[str, float], tree_rules: dict[str, Any]) -> str:
    """Return the leaf_id reached by traversing exported tree rules."""
    nodes = tree_rules.get("nodes", {})
    node_id = str(tree_rules.get("root", 0))

    while True:
        node = nodes.get(node_id)
        if node is None:
            raise ValueError(f"tree_rules node not found: {node_id}")

        node_type = node.get("type")
        if node_type == "leaf":
            return str(node.get("leaf_id", node_id))
        if node_type != "split":
            raise ValueError(f"invalid tree_rules node type at {node_id}: {node_type}")

        feature = node["feature"]
        threshold = float(node["threshold"])
        value = float(features.get(feature, 0.0))
        node_id = str(node["left"] if value <= threshold else node["right"])


def match_leaf(
    features: dict[str, float],
    tree_rules: dict[str, Any],
    leaf_table: dict[str, Any],
) -> tuple[str | None, dict | None]:
    """Compute leaf_id and fetch corresponding leaf data."""
    leaf_id = compute_leaf_id(features, tree_rules)
    return leaf_id, leaf_table.get(str(leaf_id))


def _smallest_sibling_group(
    leaf_id: int,
    siblings: dict[str, list[int]],
    leaf_table: dict[str, Any],
) -> list[int]:
    """leaf_id를 포함하는 가장 작은 sibling 그룹(직계 형제)을 반환한다.

    siblings는 내부 노드별 자식 리프 매핑이므로, leaf_id를 포함하는 그룹 중
    가장 작은 것이 곧 직계 부모의 자식 리프 집합(= 직계 형제)이다.
    leaf_table에 존재하는 리프만 포함한다. 없으면 빈 리스트.
    """
    best_children: list[int] = []
    for children in siblings.values():
        valid_children = [int(c) for c in children if str(c) in leaf_table]
        if int(leaf_id) not in valid_children:
            continue
        if not best_children or len(valid_children) < len(best_children):
            best_children = valid_children
    return best_children


def match_with_fallback(
    features: dict[str, float],
    tree_rules: dict[str, Any],
    leaf_table: dict[str, Any],
    siblings: dict[str, list[int]] | None = None,
    metadata: dict[str, Any] | None = None,
) -> tuple[str | None, dict | None, int]:
    """Match a leaf by exported tree rules, with defensive fallbacks.

    Level 0: direct leaf lookup by computed leaf_id.
    Level 1: merge the smallest sibling group containing the computed leaf.
    Level 2: merge all leaves.
    """
    siblings = siblings or {}

    leaf_id = compute_leaf_id(features, tree_rules)
    leaf_data = leaf_table.get(str(leaf_id))
    if leaf_data is not None:
        return str(leaf_id), leaf_data, 0

    best_children = _smallest_sibling_group(int(leaf_id), siblings, leaf_table)
    if best_children:
        return str(leaf_id), _merge_leaves(leaf_table, best_children), 1

    all_leaf_ids = [int(lid) for lid in leaf_table.keys()]
    if all_leaf_ids:
        merged = _merge_leaves(leaf_table, all_leaf_ids)
        return str(leaf_id), merged, 2

    return str(leaf_id), None, 2


def _softmax_calibrated(class_counts: dict[str, int], T: float) -> dict[str, float]:
    """class_counts에 온도 스케일링을 적용한 softmax 확률을 반환한다 (순수 Python)."""
    eps = 1e-9
    total = sum(class_counts.values()) or 1
    log_scaled = {c: math.log(cnt / total + eps) / T for c, cnt in class_counts.items()}
    max_val = max(log_scaled.values())
    exp_vals = {c: math.exp(v - max_val) for c, v in log_scaled.items()}
    total_exp = sum(exp_vals.values()) or 1.0
    return {c: v / total_exp for c, v in exp_vals.items()}


def compute_confidence(
    fallback_level: int,
    leaf_samples: int,
    class_counts: dict[str, int] | None = None,
    calibration: dict | None = None,
) -> str:
    """신뢰도 라벨(high/med/low)을 반환한다.

    calibration이 유효하고 class_counts가 있으면:
      온도 스케일링 T + conformal q̂ → 예측집합 크기로 판정
        size 1   → high
        size 2-3 → med
        size 4+  → low
    아닌 경우 휴리스틱 fallback:
      level 2 → low
      level 1 + <10건 → low, ≥10건 → med
      level 0 + ≥15건 → high, <15건 → med
    """
    if (
        fallback_level == 0
        and class_counts
        and calibration
        and calibration.get("valid")
    ):
        T = float(calibration["temperature"])
        qhat = float(calibration["qhat"])
        softmax = _softmax_calibrated(class_counts, T)
        pred_set_size = sum(1 for p in softmax.values() if 1.0 - p <= qhat)
        if pred_set_size <= 1:
            return "high"
        if pred_set_size <= 3:
            return "med"
        return "low"

    # 휴리스틱 fallback
    if fallback_level >= 2:
        return "low"
    if fallback_level == 1:
        return "low" if leaf_samples < 10 else "med"
    return "high" if leaf_samples >= 15 else "med"


def _merge_leaves(leaf_table: dict[str, Any], leaf_ids: list[int]) -> dict:
    merged_incidents: list[dict] = []
    merged_summary: dict[str, Any] = {"total": 0}

    for leaf_id in leaf_ids:
        leaf_data = leaf_table.get(str(leaf_id))
        if not leaf_data:
            continue

        summary = leaf_data.get("summary", {})
        merged_summary["total"] += summary.get("total", 0)

        for key, value in summary.items():
            if key == "total":
                continue
            if isinstance(value, dict):
                bucket = merged_summary.setdefault(key, {})
                for label, count in value.items():
                    bucket[label] = bucket.get(label, 0) + count

        merged_incidents.extend(leaf_data.get("incidents", []))

    return {
        "leaf_id": None,
        "source": leaf_table.get(str(leaf_ids[0]), {}).get("source", ""),
        "rule": "merged",
        "summary": merged_summary,
        "incidents": merged_incidents,
    }


def expand_with_siblings(
    leaf_id: str | int,
    leaf_data: dict[str, Any],
    leaf_table: dict[str, Any],
    siblings: dict[str, list[int]] | None = None,
) -> dict[str, Any]:
    """cross-leaf 재정렬용: 직계 형제 리프의 사례를 후보 풀에 추가한 leaf_data 복사본을 반환한다.

    - summary / rule / leaf_id 는 **메인 리프 값을 그대로 유지**한다
      (신뢰도 게이팅·리프 위험 분석이 메인 분기 기준이어야 하므로).
    - incidents 만 [메인 + 직계 형제] 로 확장한다. 각 사례의 leaf_id 태그는
      원본이 유지되므로 rank_incidents()가 메인/형제를 구분해 보너스를 적용할 수 있다.
    - leaf_table은 런타임에 캐싱되므로 원본을 mutate하지 않고 얕은 복사본을 만든다.
    """
    siblings = siblings or {}
    group = _smallest_sibling_group(int(leaf_id), siblings, leaf_table)
    sibling_ids = [lid for lid in group if lid != int(leaf_id)]
    if not sibling_ids:
        return leaf_data

    expanded = dict(leaf_data)
    incidents = list(leaf_data.get("incidents", []))
    for sid in sibling_ids:
        incidents.extend(leaf_table.get(str(sid), {}).get("incidents", []))
    expanded["incidents"] = incidents
    return expanded

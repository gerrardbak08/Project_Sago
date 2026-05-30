"""
rule_matcher.py - exported Decision Tree rules executor.

Lambda uses this module without sklearn. The training script exports the
DecisionTreeClassifier structure as tree_rules.json, and runtime matching is
just repeated "feature <= threshold ? left : right" traversal.
"""

from __future__ import annotations

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

    best_children: list[int] = []
    for children in siblings.values():
        valid_children = [int(c) for c in children if str(c) in leaf_table]
        if int(leaf_id) not in valid_children:
            continue
        if not best_children or len(valid_children) < len(best_children):
            best_children = valid_children

    if best_children:
        return str(leaf_id), _merge_leaves(leaf_table, best_children), 1

    all_leaf_ids = [int(lid) for lid in leaf_table.keys()]
    if all_leaf_ids:
        merged = _merge_leaves(leaf_table, all_leaf_ids)
        return str(leaf_id), merged, 2

    return str(leaf_id), None, 2


def compute_confidence(fallback_level: int, leaf_samples: int) -> str:
    """fallback_level + leaf 표본 수로 신뢰도 라벨(high/med/low)을 반환한다.

    level 2 (전체 병합): 항상 low
    level 1 (sibling 병합): 10건 미만이면 low, 이상이면 med
    level 0 (직접 매칭): 15건 이상이면 high, 미만이면 med
    """
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

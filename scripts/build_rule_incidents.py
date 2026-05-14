#!/usr/bin/env python
"""
build_rule_incidents.py - 룰 기반 사고 검색용 인덱스 생성.

processed/incidents_{cust,emp}.csv를 Lambda가 바로 읽을 수 있는 JSON으로 변환해
models/{cust,emp}/rule_incidents.json에 저장한다.
"""

from __future__ import annotations

import json
import re
import sys
from collections import Counter
from pathlib import Path

import pandas as pd

ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "processed"
MODELS = ROOT / "models"

SCRIPTS_DIR = ROOT / "scripts"
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_dataset import (  # noqa: E402
    CUST_CASE_COLS,
    EMP_CASE_COLS,
    STORE_CAT_FEATURES,
    STORE_NUM_FEATURES,
    WEATHER_FEATURES,
)

_CONDITION_RE = re.compile(
    r"([A-Za-z0-9_가-힣()㎡]+)\s*(<=|>=|<|>)\s*(-?[\d.]+)"
)


def _format_num(value: float) -> str:
    text = f"{value:.4f}".rstrip("0").rstrip(".")
    return text if text else "0"


def _incident_text(incident: dict) -> str:
    return (
        incident.get("사고내용요약")
        or incident.get("사고 내용")
        or incident.get("사고내용")
        or ""
    )


def _collect_tree_thresholds(leaf_table: dict) -> dict[str, list[float]]:
    thresholds: dict[str, set[float]] = {}
    for leaf in leaf_table.values():
        rule = leaf.get("rule", "")
        for feature, _op, value in _CONDITION_RE.findall(rule):
            thresholds.setdefault(feature, set()).add(float(value))
    return {feature: sorted(values) for feature, values in thresholds.items()}


def _make_bucket_defs(thresholds: list[float]) -> list[tuple[str, dict]]:
    buckets: list[tuple[str, dict]] = []
    for index, threshold in enumerate(thresholds):
        if index == 0:
            label = f"<= {_format_num(threshold)}"
        else:
            previous = thresholds[index - 1]
            label = f"> {_format_num(previous)}~<= {_format_num(threshold)}"
        buckets.append((label, {"op": "<=", "val": threshold}))

    last = thresholds[-1]
    buckets.append((f"> {_format_num(last)}", {"op": ">", "val": last}))
    return buckets


def _classify_bucket_label(value: object, bucket_defs: list[tuple[str, dict]]) -> str | None:
    try:
        numeric = float(value)
    except (TypeError, ValueError):
        return None

    for label, info in bucket_defs:
        op = info["op"]
        threshold = float(info["val"])
        if op == "<=" and numeric <= threshold:
            return label
        if op == ">" and numeric > threshold:
            return label
    return None


def _build_bucket_risk(
    source: str,
    feature: str,
    label: str,
    incidents: list[dict],
    label_col: str,
) -> str:
    source_label = "고객" if source == "cust" else "직원"
    if not incidents:
        return f"{source_label} {feature} {label} 구간은 의사결정트리 분기 기준에서 분리된 유사 사례 검색 구간입니다."

    type_counts = Counter(
        inc.get(label_col)
        for inc in incidents
        if inc.get(label_col) is not None
    )
    dominant = type_counts.most_common(1)[0][0] if type_counts else "사고"
    examples = []
    for inc in incidents:
        text = _incident_text(inc).strip()
        if text:
            examples.append(text[:45])
        if len(examples) == 2:
            break

    if examples:
        return (
            f"{source_label} {feature} {label} 구간에서 {dominant} 사례가 주로 확인됩니다. "
            f"예: {' / '.join(examples)}"
        )
    return f"{source_label} {feature} {label} 구간에서 {dominant} 사례가 확인됩니다."


def build_feature_risk_thresholds_from_tree(
    source: str,
    leaf_table: dict,
    incidents: list[dict],
    label_col: str,
) -> dict:
    """Decision Tree 리프 규칙에 등장한 split threshold로 FEATURE_RISK_THRESHOLDS 형태의 기준표를 만든다."""
    result: dict[str, dict] = {}
    for feature, thresholds in _collect_tree_thresholds(leaf_table).items():
        if not thresholds:
            continue

        bucket_defs = _make_bucket_defs(thresholds)
        incidents_by_bucket: dict[str, list[dict]] = {label: [] for label, _ in bucket_defs}
        for incident in incidents:
            bucket_label = _classify_bucket_label(incident.get(feature), bucket_defs)
            if bucket_label:
                incidents_by_bucket[bucket_label].append(incident)

        feature_rules = {}
        for label, info in bucket_defs:
            rule_info = dict(info)
            rule_info["risk"] = _build_bucket_risk(
                source,
                feature,
                label,
                incidents_by_bucket.get(label, []),
                label_col,
            )
            feature_rules[label] = rule_info
        result[feature] = feature_rules

    return result


def _to_records(df: pd.DataFrame, cols: list[str]) -> list[dict]:
    records = []
    for row in df[cols].where(pd.notna(df[cols]), None).to_dict(orient="records"):
        records.append(row)
    return records


def _build_source(source: str) -> None:
    csv_path = PROCESSED / f"incidents_{source}.csv"
    if not csv_path.exists():
        raise FileNotFoundError(f"사고 CSV가 없습니다: {csv_path}")

    df = pd.read_csv(csv_path)
    if source == "cust":
        case_cols = CUST_CASE_COLS
        label_col = "사고유형"
    else:
        case_cols = EMP_CASE_COLS
        label_col = "재해 유형"

    cols = list(dict.fromkeys(
        ["incident_id"] + case_cols + WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES + ["image_url"]
    ))
    cols = [c for c in cols if c in df.columns]

    payload = {
        "source": source,
        "label_column": label_col,
        "total_incidents": int(len(df)),
        "incidents": _to_records(df, cols),
    }

    leaf_table_path = MODELS / source / "leaf_table.json"
    if leaf_table_path.exists():
        with open(leaf_table_path, "r", encoding="utf-8") as f:
            leaf_table = json.load(f)
        feature_risk_thresholds = build_feature_risk_thresholds_from_tree(
            source,
            leaf_table,
            payload["incidents"],
            label_col,
        )
        payload["feature_risk_thresholds"] = feature_risk_thresholds
        # 이전 커밋 호환용 alias. Lambda는 feature_risk_thresholds를 우선 사용한다.
        payload["feature_rules"] = feature_risk_thresholds

    out_dir = MODELS / source
    out_dir.mkdir(parents=True, exist_ok=True)
    if "feature_risk_thresholds" in payload:
        thresholds_path = out_dir / "feature_risk_thresholds.json"
        with open(thresholds_path, "w", encoding="utf-8") as f:
            json.dump(payload["feature_risk_thresholds"], f, ensure_ascii=False, indent=2)
        print(f"[OK] {thresholds_path} 생성")

    out_path = out_dir / "rule_incidents.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[OK] {out_path} 생성 ({len(df)}건)")


def main() -> None:
    for source in ["cust", "emp"]:
        _build_source(source)


if __name__ == "__main__":
    main()

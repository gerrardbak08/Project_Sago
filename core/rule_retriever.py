"""
rule_retriever.py - source별 룰 기준으로 유사 사고 사례를 검색한다.

Decision Tree 리프 매칭 대신 고객/직원별 기준표로 오늘 조건과 과거
사고 당시 조건을 같은 구간으로 분류하고, 구간을 많이 공유하는 사례를
LLM 컨텍스트 후보로 반환한다.
"""

from __future__ import annotations

import random
from collections import Counter
from datetime import datetime
from typing import Any

from core.rule_enrichment import classify_feature_bucket, get_feature_thresholds


WEATHER_FEATURES = [
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "snowfall_sum",
    "rain_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]

STORE_NUM_FEATURES = [
    "평수",
    "실평수",
    "진열평수",
    "창고",
    "계약면적(㎡)",
    "매장인원",
    "입고도우미PO",
    "일평균매출",
    "일평균물동량",
]

LABEL_COLS = {"cust": "사고유형", "emp": "재해 유형"}


def _context_features(store: dict, weather: dict) -> dict[str, Any]:
    features: dict[str, Any] = {}
    for feat in WEATHER_FEATURES:
        features[feat] = weather.get(feat)
    for feat in STORE_NUM_FEATURES:
        features[feat] = store.get(feat)
    return features


def _bucket_map(source: str, features: dict[str, Any]) -> dict[str, dict]:
    result: dict[str, dict] = {}
    for feature in get_feature_thresholds(source):
        if feature not in features:
            continue
        bucket = classify_feature_bucket(source, feature, features.get(feature))
        if bucket:
            result[feature] = bucket
    return result


def _parse_date(value: Any) -> datetime:
    if value is None:
        return datetime.min
    text = str(value).strip()
    for fmt in ("%Y-%m-%d", "%Y.%m.%d", "%Y/%m/%d", "%Y-%m-%d %H:%M:%S"):
        try:
            return datetime.strptime(text[:19], fmt)
        except ValueError:
            continue
    return datetime.min


def _matched_incident(
    source: str,
    incident: dict,
    today_buckets: dict[str, dict],
) -> dict | None:
    matched = []
    compared = 0
    for feature, today_bucket in today_buckets.items():
        inc_bucket = classify_feature_bucket(source, feature, incident.get(feature))
        if not inc_bucket:
            continue
        compared += 1
        if inc_bucket["label"] == today_bucket["label"]:
            matched.append({
                "feature": feature,
                "label": inc_bucket["label"],
                "risk": today_bucket["risk"],
            })

    if not matched:
        return None

    result = dict(incident)
    result["rule_match"] = {
        "matched_count": len(matched),
        "compared_count": compared,
        "matched_features": matched,
    }
    return result


def _select_incidents(
    incidents: list[dict],
    limit: int | None,
    strategy: str,
) -> list[dict]:
    if limit is None or limit <= 0:
        return incidents

    if strategy == "all":
        return incidents
    if strategy == "random":
        rng = random.Random(42)
        sample = list(incidents)
        rng.shuffle(sample)
        return sample[:limit]

    # 기본 recent: 유사도 우선, 같은 유사도 안에서는 최신 사고 우선
    sorted_incidents = sorted(
        incidents,
        key=lambda inc: (
            inc.get("rule_match", {}).get("matched_count", 0),
            _parse_date(inc.get("발생일시")),
        ),
        reverse=True,
    )
    return sorted_incidents[:limit]


def match_incidents_by_rules(
    source: str,
    store: dict,
    weather: dict,
    incidents: list[dict],
    limit: int | None = 50,
    strategy: str = "recent",
) -> dict:
    """오늘 조건과 같은 source별 룰 구간을 공유하는 사고 사례를 반환한다."""
    label_col = LABEL_COLS.get(source, "사고유형")
    today_buckets = _bucket_map(source, _context_features(store, weather))

    matched = []
    for incident in incidents:
        item = _matched_incident(source, incident, today_buckets)
        if item:
            matched.append(item)

    matched = sorted(
        matched,
        key=lambda inc: (
            inc.get("rule_match", {}).get("matched_count", 0),
            _parse_date(inc.get("발생일시")),
        ),
        reverse=True,
    )
    selected = _select_incidents(matched, limit, strategy)

    label_counts = Counter(
        inc.get(label_col)
        for inc in selected
        if inc.get(label_col) is not None
    )
    source_label = "고객" if source == "cust" else "직원"

    return {
        "leaf_id": None,
        "source": source,
        "rule": f"rule-based-{source}",
        "rule_context": {
            "source_label": source_label,
            "today_buckets": {
                feature: {
                    "label": bucket["label"],
                    "risk": bucket["risk"],
                    "value": bucket["value"],
                }
                for feature, bucket in today_buckets.items()
            },
            "strategy": strategy,
            "limit": limit,
        },
        "summary": {
            "total": len(selected),
            "matched_total": len(matched),
            "sampled": len(selected),
            label_col: dict(label_counts),
        },
        "incidents": selected,
    }

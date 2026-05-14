#!/usr/bin/env python
"""
train.py — Decision Tree 학습 + 리프 노드 사고 사례 테이블 생성

산출물 (models/{cust,emp}/):
  1. leaf_table.json  — 리프별 규칙 + 사고 통계 + 사례 리스트
  2. metadata.json    — 피처명, 총 사고 건수, 리프 통계, 하이퍼파라미터
  3. encoder_map.json — OrdinalEncoder 매핑
  4. siblings.json    — 부모 노드별 자식 리프 매핑 (Fallback Level 1)
  5. tree.pkl         — 학습된 DecisionTreeClassifier
  6. encoder.pkl      — 학습된 OrdinalEncoder
"""

from __future__ import annotations

import argparse
import json
import pickle
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.preprocessing import OrdinalEncoder
from sklearn.tree import DecisionTreeClassifier

# ──────────────────────────────────────────────
# build_dataset.py에서 피처 상수 import
# ──────────────────────────────────────────────
SCRIPTS_DIR = Path(__file__).resolve().parent
if str(SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(SCRIPTS_DIR))

from build_dataset import (
    WEATHER_FEATURES,
    STORE_NUM_FEATURES,
    STORE_CAT_FEATURES,
    TREE_FEATURES,
    CUST_CASE_COLS,
    EMP_CASE_COLS,
)

# ──────────────────────────────────────────────
# 경로
# ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
PROCESSED = ROOT / "processed"
MODELS = ROOT / "models"

# ──────────────────────────────────────────────
# 하이퍼파라미터
# ──────────────────────────────────────────────
TREE_PARAMS = dict(
    max_depth=12,
    min_samples_leaf=20,
    # min_impurity_decrease=0.005,
    class_weight="balanced",
    criterion="gini",
    random_state=42,
)

# ──────────────────────────────────────────────
# 범주형 인코딩 순서
# ──────────────────────────────────────────────
STORE_TYPE_ORDER = ["유통점", "유통행사", "직영점"]


# ──────────────────────────────────────────────
# JSON 직렬화 헬퍼 (numpy 타입 → Python 네이티브)
# ──────────────────────────────────────────────
def _to_native(obj):
    """numpy/pandas 타입을 JSON 직렬화 가능한 Python 네이티브로 변환."""
    if isinstance(obj, (np.integer,)):
        return int(obj)
    if isinstance(obj, (np.floating,)):
        v = float(obj)
        return None if np.isnan(v) else v
    if isinstance(obj, np.ndarray):
        return obj.tolist()
    if isinstance(obj, np.bool_):
        return bool(obj)
    if isinstance(obj, float) and np.isnan(obj):
        return None
    if pd.isna(obj):
        return None
    return obj


def _sanitize(obj):
    """재귀적으로 dict/list 내부의 numpy 타입을 변환."""
    if isinstance(obj, dict):
        return {k: _sanitize(v) for k, v in obj.items()}
    if isinstance(obj, list):
        return [_sanitize(v) for v in obj]
    return _to_native(obj)


def _dump_json(data, path: Path) -> None:
    """JSON 파일 저장 (numpy 타입 안전 변환)."""
    with open(path, "w", encoding="utf-8") as f:
        json.dump(_sanitize(data), f, ensure_ascii=False, indent=2)


# ──────────────────────────────────────────────
# 결측치 처리
# ──────────────────────────────────────────────
def _fill_missing(df: pd.DataFrame) -> pd.DataFrame:
    """결측치 처리 규칙 적용."""
    df = df.copy()

    # 강수/적설/강우: NaN → 0
    precip_cols = ["precipitation_sum", "snowfall_sum", "rain_sum"]
    for c in precip_cols:
        if c in df.columns:
            df[c] = df[c].fillna(0)

    # 기타 기상: ffill → bfill → 0
    other_weather = [c for c in WEATHER_FEATURES if c not in precip_cols]
    for c in other_weather:
        if c in df.columns:
            df[c] = df[c].ffill().bfill().fillna(0)

    # 매장 연속형: NaN → median
    for c in STORE_NUM_FEATURES:
        if c in df.columns:
            median_val = df[c].median()
            df[c] = df[c].fillna(median_val if pd.notna(median_val) else 0)

    # 나머지: 0
    for c in TREE_FEATURES:
        if c in df.columns and c not in STORE_CAT_FEATURES:
            df[c] = df[c].fillna(0)

    return df


# ──────────────────────────────────────────────
# 규칙 추출
# ──────────────────────────────────────────────
def _extract_rules(tree: DecisionTreeClassifier, feature_names: list[str]) -> dict[int, str]:
    """트리의 각 리프 노드에 도달하는 규칙을 추출."""
    tree_ = tree.tree_
    children_left = tree_.children_left
    children_right = tree_.children_right
    feature = tree_.feature
    threshold = tree_.threshold

    rules: dict[int, str] = {}

    def _recurse(node_id: int, path: list[str]) -> None:
        # 리프 노드: children_left == children_right
        if children_left[node_id] == children_right[node_id]:
            rules[node_id] = " & ".join(path) if path else "root"
            return

        feat_name = feature_names[feature[node_id]]
        thresh = round(float(threshold[node_id]), 4)

        # 왼쪽: feature <= threshold
        _recurse(
            children_left[node_id],
            path + [f"{feat_name} <= {thresh}"],
        )
        # 오른쪽: feature > threshold
        _recurse(
            children_right[node_id],
            path + [f"{feat_name} > {thresh}"],
        )

    _recurse(0, [])
    return rules


# ──────────────────────────────────────────────
# siblings 구축
# ──────────────────────────────────────────────
def _build_siblings(tree: DecisionTreeClassifier) -> dict[int, list[int]]:
    """부모 노드별 자식 리프 노드 매핑 (Fallback Level 1용)."""
    tree_ = tree.tree_
    children_left = tree_.children_left
    children_right = tree_.children_right

    siblings: dict[int, list[int]] = {}

    def _collect_leaves(node_id: int) -> list[int]:
        """재귀적으로 노드 아래의 모든 리프를 수집."""
        if children_left[node_id] == children_right[node_id]:
            return [node_id]

        leaves = []
        left_leaves = _collect_leaves(children_left[node_id])
        right_leaves = _collect_leaves(children_right[node_id])
        leaves = left_leaves + right_leaves

        # 내부 노드의 자식 리프 매핑 저장
        siblings[node_id] = leaves
        return leaves

    _collect_leaves(0)
    return siblings


# ──────────────────────────────────────────────
# leaf_table 구축
# ──────────────────────────────────────────────
def _stratified_sample_incidents(
    leaf_df: pd.DataFrame,
    label_col: str,
    incident_cols: list[str],
    max_size: int = 50,
) -> list[dict]:
    """사고유형 분포를 유지하면서 최대 max_size건을 샘플링한다.

    - 유형별 비례 할당. 각 유형 최소 1건 보장.
    - 유형 내 샘플링은 index 오름차순(결정론적).
    - 전체 건수가 max_size 이하면 전부 반환.
    """
    n = len(leaf_df)
    if n <= max_size:
        return [
            {c: row[c] for c in incident_cols}
            for _, row in leaf_df.iterrows()
        ]

    label_counts = leaf_df[label_col].value_counts()
    n_types = len(label_counts)

    # 각 유형 최소 1건, 나머지는 비례 할당
    quotas: dict[str, int] = {}
    remaining = max_size - n_types  # 유형당 1건씩 선할당 후 남는 slot
    for lbl, cnt in label_counts.items():
        quotas[lbl] = 1
    # 비례 분배
    for lbl, cnt in label_counts.items():
        add = int(round(remaining * cnt / n))
        quotas[lbl] += add

    # 반올림으로 인한 오차 보정
    total = sum(quotas.values())
    diff = max_size - total
    if diff != 0:
        # 큰 유형부터 오차만큼 가감
        sorted_lbls = list(label_counts.index)
        i = 0
        while diff != 0 and i < len(sorted_lbls) * 2:
            lbl = sorted_lbls[i % len(sorted_lbls)]
            if diff > 0:
                quotas[lbl] += 1
                diff -= 1
            elif diff < 0 and quotas[lbl] > 1:
                quotas[lbl] -= 1
                diff += 1
            i += 1

    # 유형별 샘플링 (index 오름차순)
    sampled_rows = []
    for lbl in label_counts.index:
        sub = leaf_df[leaf_df[label_col] == lbl].sort_index()
        take = min(quotas.get(lbl, 0), len(sub))
        sampled_rows.append(sub.head(take))

    sampled = pd.concat(sampled_rows).sort_index()
    return [
        {c: row[c] for c in incident_cols}
        for _, row in sampled.iterrows()
    ]


# ──────────────────────────────────────────────
# leaf_table 구축
# ──────────────────────────────────────────────
def _build_leaf_table(
    tree: DecisionTreeClassifier,
    df: pd.DataFrame,
    X: pd.DataFrame,
    label_col: str,
    case_cols: list[str],
    source: str,
    feature_names: list[str],
) -> dict:
    """리프별 규칙 + 사고 통계 + 사례 리스트 (사고유형 stratified 샘플링, 최대 50건)."""
    rules = _extract_rules(tree, feature_names)
    leaf_ids = tree.apply(X)

    # 사례에 포함할 컬럼
    # incident_id를 맨 앞에 두어 사례 식별이 명확하도록 함
    incident_cols = list(dict.fromkeys(
        ["incident_id"] + case_cols + WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
    ))
    # 실제 존재하는 컬럼만
    incident_cols = [c for c in incident_cols if c in df.columns]

    leaf_table = {}
    for leaf_id in sorted(set(leaf_ids)):
        mask = leaf_ids == leaf_id
        leaf_df = df[mask]

        # 라벨 분포
        label_counts = Counter(leaf_df[label_col].tolist())

        # 원인/장소 분포 (source별 다른 컬럼)
        distributions = {}
        if source == "cust":
            for dist_col in ["원인1", "장소"]:
                if dist_col in leaf_df.columns:
                    distributions[dist_col] = dict(
                        Counter(leaf_df[dist_col].dropna().tolist())
                    )
        elif source == "emp":
            for dist_col in ["기인물"]:
                if dist_col in leaf_df.columns:
                    distributions[dist_col] = dict(
                        Counter(leaf_df[dist_col].dropna().tolist())
                    )

        # 사례 리스트 — 사고유형 stratified 샘플링, 최대 50건
        incidents = _stratified_sample_incidents(
            leaf_df, label_col, incident_cols, max_size=50
        )

        leaf_table[str(leaf_id)] = {
            "leaf_id": int(leaf_id),
            "source": source,
            "rule": rules.get(leaf_id, ""),
            "summary": {
                "total": int(mask.sum()),
                "sampled": len(incidents),
                label_col: dict(label_counts),
                **distributions,
            },
            "incidents": incidents,
        }

    return leaf_table


# ──────────────────────────────────────────────
# leaf_type_counts 구축
# ──────────────────────────────────────────────
def _build_leaf_type_counts(
    leaf_table: dict,
    label_col: str,
) -> dict:
    """리프별 사고유형 카운트를 별도 JSON으로 요약.

    구조:
      {
        "label_column": "사고유형",
        "leaves": {
          "<leaf_id>": {
            "rule": "...",
            "total": int,
            "type_counts": {유형명: 건수, ...}
          }, ...
        }
      }
    """
    leaves: dict[str, Any] = {}
    for lid, data in leaf_table.items():
        summary = data.get("summary", {})
        leaves[lid] = {
            "rule": data.get("rule", ""),
            "total": summary.get("total", 0),
            "type_counts": dict(summary.get(label_col, {})),
        }

    return {
        "label_column": label_col,
        "leaves": leaves,
    }


# ──────────────────────────────────────────────
# metadata 구축
# ──────────────────────────────────────────────
def _build_metadata(
    tree: DecisionTreeClassifier,
    df: pd.DataFrame,
    label_col: str,
    feature_names: list[str],
    leaf_table: dict,
) -> dict:
    """피처명, 총 사고 건수, 리프 통계, 하이퍼파라미터, 라벨 분포."""
    label_dist = dict(Counter(df[label_col].tolist()))
    leaf_sizes = [v["summary"]["total"] for v in leaf_table.values()]

    return {
        "feature_names": feature_names,
        "total_incidents": int(len(df)),
        "n_leaves": len(leaf_table),
        "leaf_min_samples": int(min(leaf_sizes)) if leaf_sizes else 0,
        "leaf_max_samples": int(max(leaf_sizes)) if leaf_sizes else 0,
        "tree_depth": int(tree.get_depth()),
        "hyperparameters": TREE_PARAMS,
        "label_column": label_col,
        "label_distribution": label_dist,
    }


# ──────────────────────────────────────────────
# 학습 파이프라인
# ──────────────────────────────────────────────
def train_source(source: str) -> None:
    """단일 소스(cust/emp) 학습 + 산출물 생성."""
    print(f"\n{'='*60}")
    print(f"  [{source.upper()}] Decision Tree 학습 시작")
    print(f"{'='*60}")

    # ── 데이터 로드 ──
    csv_path = PROCESSED / f"incidents_{source}.csv"
    if not csv_path.exists():
        print(f"  ❌ {csv_path} 없음 → 스킵")
        return

    df = pd.read_csv(csv_path)
    print(f"  데이터 로드: {len(df)}건, {len(df.columns)}컬럼")

    # ── 라벨/사례 컬럼 설정 ──
    if source == "cust":
        label_col = "사고유형"
        case_cols = CUST_CASE_COLS
    else:
        label_col = "재해 유형"
        case_cols = EMP_CASE_COLS

    # ── 라벨 정제 (공백 제거) ──
    df[label_col] = df[label_col].astype(str).str.strip()

    # ── 결측치 처리 ──
    df = _fill_missing(df)

    # ── 범주형 인코딩 ──
    encoder = OrdinalEncoder(
        categories=[STORE_TYPE_ORDER],
        handle_unknown="use_encoded_value",
        unknown_value=-1,
    )
    df["형태"] = df["형태"].astype(str).str.strip()
    df[["형태"]] = encoder.fit_transform(df[["형태"]])

    # 피처 행렬 구성
    feature_names = WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
    X = df[feature_names].copy()
    y = df[label_col]

    print(f"  피처: {len(feature_names)}개, 라벨: {label_col} ({y.nunique()}종)")
    print(f"  라벨 분포: {dict(Counter(y.tolist()))}")

    # ── Decision Tree 학습 ──
    tree = DecisionTreeClassifier(**TREE_PARAMS)
    tree.fit(X, y)

    depth = tree.get_depth()
    n_leaves = tree.get_n_leaves()
    print(f"  트리 학습 완료: depth={depth}, leaves={n_leaves}")

    # ── 산출물 디렉토리 ──
    out_dir = MODELS / source
    out_dir.mkdir(parents=True, exist_ok=True)

    # ── 1. leaf_table.json ──
    leaf_table = _build_leaf_table(
        tree, df, X, label_col, case_cols, source, feature_names,
    )
    _dump_json(leaf_table, out_dir / "leaf_table.json")
    print(f"  → leaf_table.json ({len(leaf_table)} 리프)")

    # ── 2. metadata.json ──
    metadata = _build_metadata(tree, df, label_col, feature_names, leaf_table)
    _dump_json(metadata, out_dir / "metadata.json")
    print(f"  → metadata.json")

    # ── 3. encoder_map.json ──
    encoder_map = {
        "형태": {cat: int(i) for i, cat in enumerate(STORE_TYPE_ORDER)}
    }
    _dump_json(encoder_map, out_dir / "encoder_map.json")
    print(f"  → encoder_map.json")

    # ── 4. siblings.json ──
    siblings_raw = _build_siblings(tree)
    siblings = {str(k): [int(v) for v in vs] for k, vs in siblings_raw.items()}
    _dump_json(siblings, out_dir / "siblings.json")
    print(f"  → siblings.json ({len(siblings)} 내부 노드)")

    # ── 5. leaf_type_counts.json ──
    leaf_type_counts = _build_leaf_type_counts(leaf_table, label_col)
    _dump_json(leaf_type_counts, out_dir / "leaf_type_counts.json")
    print(f"  → leaf_type_counts.json")

    # ── 6. tree.pkl ──
    with open(out_dir / "tree.pkl", "wb") as f:
        pickle.dump(tree, f)
    print(f"  → tree.pkl")

    # ── 7. encoder.pkl ──
    with open(out_dir / "encoder.pkl", "wb") as f:
        pickle.dump(encoder, f)
    print(f"  → encoder.pkl")

    # ── 검증 ──
    print(f"\n  [검증]")
    print(f"    트리 깊이: {depth} (max_depth={TREE_PARAMS['max_depth']})")
    min_samples = min(v["summary"]["total"] for v in leaf_table.values())
    max_samples = max(v["summary"]["total"] for v in leaf_table.values())
    print(f"    리프 사례 수: 최소 {min_samples} / 최대 {max_samples}")
    incident_sizes = [len(v["incidents"]) for v in leaf_table.values()]
    print(f"    incidents 크기(샘플링 후): 최소 {min(incident_sizes)} / 최대 {max(incident_sizes)}")
    has_incidents = all(s > 0 for s in incident_sizes)
    print(f"    모든 리프에 incidents 포함: {has_incidents}")
    assert depth <= TREE_PARAMS["max_depth"], f"트리 깊이 초과: {depth}"
    # EMP는 데이터량(약 448건) 제약으로 리프 최소 15건까지 허용
    min_required = 15 if source == "emp" else TREE_PARAMS["min_samples_leaf"]
    assert min_samples >= min_required, (
        f"최소 사례 수 미달: {min_samples} (기대: {min_required}, 소스: {source})"
    )
    assert has_incidents, "incidents 누락 리프 존재"
    assert max(incident_sizes) <= 50, (
        f"incidents 크기 상한 초과: {max(incident_sizes)} (기대: 50 이하)"
    )
    # 리프 수 목표 범위 확인 (실패해도 경고만)
    if not (10 <= n_leaves <= 60):
        print(f"  ⚠️ 리프 수 {n_leaves} — 목표 범위(10~60) 밖. max_depth 재조정 고려.")

    print(f"\n  ✅ [{source.upper()}] 학습 + 산출물 생성 완료")


# ──────────────────────────────────────────────
# CLI
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="다이소 안전사고 예방 AI — Decision Tree 학습"
    )
    parser.add_argument(
        "--source",
        choices=["cust", "emp"],
        default=None,
        help="학습 대상 (cust/emp). 생략 시 모두 학습.",
    )
    args = parser.parse_args()

    sources = [args.source] if args.source else ["cust", "emp"]
    for src in sources:
        train_source(src)

    print(f"\n{'='*60}")
    print("  🎉 전체 학습 완료")
    print(f"{'='*60}")


if __name__ == "__main__":
    main()

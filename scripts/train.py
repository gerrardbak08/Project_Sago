#!/usr/bin/env python
"""
train.py — Decision Tree 학습 + 리프 노드 사고 사례 테이블 생성

산출물 (models/{cust,emp}/):
  1. leaf_table.json     — 리프별 규칙 + 사고 통계 + 사례 리스트
  2. metadata.json       — 피처명, 총 사고 건수, 리프 통계, 튜닝 결과
  3. encoder_map.json    — OrdinalEncoder 매핑
  4. siblings.json       — 부모 노드별 자식 리프 매핑 (Fallback Level 1)
  5. tree_rules.json     — sklearn 없이 실행 가능한 트리 분기 구조
  6. calibration.json    — 온도 스케일링 T + conformal q̂ (신뢰도 보정)
"""

from __future__ import annotations

import argparse
import json
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.metrics import accuracy_score, balanced_accuracy_score, f1_score
from sklearn.model_selection import ParameterGrid, train_test_split
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
TREE_VERSION = "2026-05-tree-rules-v1"

BASE_TREE_PARAMS = dict(
    class_weight="balanced",
    random_state=42,
)

PARAM_GRID = {
    "criterion": ["gini", "entropy"],
    "max_depth": [15, 20, 25],
    "min_samples_leaf": [15, 20],
}

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
        json.dump(_sanitize(data), f, ensure_ascii=False, indent=2, allow_nan=False)


def _clean_incident_value(key: str, value):
    if pd.isna(value):
        if key == "image_url":
            return ""
        return None
    return _to_native(value)


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


def _export_tree_rules(
    tree: DecisionTreeClassifier,
    feature_names: list[str],
    source: str,
    selected_params: dict,
    validation_metrics: dict,
) -> dict:
    """sklearn 없이 실행 가능한 트리 분기 구조를 JSON dict로 변환한다."""
    tree_ = tree.tree_
    nodes: dict[str, dict] = {}

    for node_id in range(tree_.node_count):
        left = int(tree_.children_left[node_id])
        right = int(tree_.children_right[node_id])
        if left == right:
            nodes[str(node_id)] = {
                "type": "leaf",
                "leaf_id": int(node_id),
                "samples": int(tree_.n_node_samples[node_id]),
            }
            continue

        nodes[str(node_id)] = {
            "type": "split",
            "feature": feature_names[int(tree_.feature[node_id])],
            "threshold": float(tree_.threshold[node_id]),
            "left": left,
            "right": right,
            "samples": int(tree_.n_node_samples[node_id]),
        }

    return {
        "tree_version": TREE_VERSION,
        "source": source,
        "root": 0,
        "feature_names": feature_names,
        "selected_params": selected_params,
        "validation_metrics": validation_metrics,
        "nodes": nodes,
    }


# ──────────────────────────────────────────────
def _incident_records(leaf_df: pd.DataFrame, incident_cols: list[str]) -> list[dict]:
    """리프에 속한 전체 사고 사례를 결정론적 순서로 직렬화한다."""
    return [
        {c: _clean_incident_value(c, row[c]) for c in incident_cols}
        for _, row in leaf_df.sort_index().iterrows()
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
    """리프별 규칙 + 사고 통계 + 전체 사례 리스트."""
    rules = _extract_rules(tree, feature_names)
    leaf_ids = tree.apply(X)

    # 사례에 포함할 컬럼
    # incident_id를 맨 앞에 두어 사례 식별이 명확하도록 함
    incident_cols = list(dict.fromkeys(
        ["incident_id"]
        + case_cols
        + WEATHER_FEATURES
        + STORE_NUM_FEATURES
        + STORE_CAT_FEATURES
        + ["image_url"]
    ))
    # 실제 존재하는 컬럼만
    incident_cols = [c for c in incident_cols if c in df.columns]

    leaf_table = {}
    for leaf_id in sorted(set(leaf_ids)):
        mask = leaf_ids == leaf_id
        leaf_df = df[mask].copy()
        leaf_df["leaf_id"] = int(leaf_id)
        leaf_df["tree_version"] = TREE_VERSION

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

        # 사례 리스트 — LLM 컨텍스트 후보로 사용할 리프 내 전체 사고
        sample_cols = list(dict.fromkeys(["leaf_id", "tree_version"] + incident_cols))
        incidents = _incident_records(leaf_df, sample_cols)

        leaf_table[str(leaf_id)] = {
            "leaf_id": int(leaf_id),
            "source": source,
            "tree_version": TREE_VERSION,
            "rule": rules.get(leaf_id, ""),
            "summary": {
                "total": int(mask.sum()),
                label_col: dict(label_counts),
                **distributions,
            },
            "incidents": incidents,
        }

    return leaf_table


def _tune_tree(X: pd.DataFrame, y: pd.Series) -> tuple[dict, dict, pd.DataFrame, pd.Series]:
    """train/test split으로 후보 하이퍼파라미터를 평가하고 최적 파라미터를 반환.

    Returns:
        (best_params, validation_metrics, X_cal, y_cal)
        X_cal/y_cal은 _calibrate()에서 conformal 보정에 사용하는 held-out 분할.
    """
    label_counts = y.value_counts()
    stratify = y if label_counts.min() >= 2 else None
    X_train, X_test, y_train, y_test = train_test_split(
        X,
        y,
        test_size=0.2,
        random_state=42,
        stratify=stratify,
    )

    best: dict | None = None
    results = []
    for params in ParameterGrid(PARAM_GRID):
        candidate_params = {**BASE_TREE_PARAMS, **params}
        tree = DecisionTreeClassifier(**candidate_params)
        tree.fit(X_train, y_train)
        pred = tree.predict(X_test)
        per_class_f1 = f1_score(y_test, pred, average=None, zero_division=0, labels=list(tree.classes_))
        metrics = {
            "accuracy": float(accuracy_score(y_test, pred)),
            "balanced_accuracy": float(balanced_accuracy_score(y_test, pred)),
            "f1_macro": float(f1_score(y_test, pred, average="macro", zero_division=0)),
            "f1_per_class": {
                str(cls): float(score)
                for cls, score in zip(tree.classes_, per_class_f1)
            },
            "tree_depth": int(tree.get_depth()),
            "n_leaves": int(tree.get_n_leaves()),
        }
        record = {"params": candidate_params, "metrics": metrics}
        results.append(record)

        sort_key = (
            metrics["f1_macro"],
            metrics["accuracy"],
            -abs(metrics["n_leaves"] - 30),
            -metrics["tree_depth"],
        )
        if best is None or sort_key > best["sort_key"]:
            best = {**record, "sort_key": sort_key}

    assert best is not None, "하이퍼파라미터 후보가 없습니다."
    return (
        best["params"],
        {
            "split": {"test_size": 0.2, "random_state": 42, "stratified": stratify is not None},
            "best": {"params": best["params"], "metrics": best["metrics"]},
            "candidates": results,
        },
        X_test,
        y_test,
    )


# ──────────────────────────────────────────────
# 온도 스케일링 + conformal 캘리브레이션
# ──────────────────────────────────────────────
def _calibrate(
    tree: DecisionTreeClassifier,
    X_cal: pd.DataFrame,
    y_cal: pd.Series,
    leaf_table: dict,
    label_col: str,
    alpha: float = 0.1,
) -> dict:
    """온도 스케일링 T와 conformal q̂를 계산해 calibration.json 내용을 반환한다.

    leaf_table의 실제 raw 클래스 카운트를 사용해 클래스 확률을 계산한다.
    캘리브레이션 세트가 30건 미만이면 valid=False를 반환한다.
    """
    n_cal = len(y_cal)
    MIN_CAL = 30

    if n_cal < MIN_CAL:
        print(f"  ⚠️  캘리브레이션 세트 {n_cal}건 < {MIN_CAL} — calibration.json valid=False")
        return {"valid": False, "n_calibration": n_cal, "reason": "insufficient_samples"}

    classes = sorted({str(c) for leaf in leaf_table.values()
                      for c in leaf.get("summary", {}).get(label_col, {})})
    if not classes:
        classes = sorted(str(c) for c in tree.classes_)
    class_to_idx = {c: i for i, c in enumerate(classes)}
    n_classes = len(classes)
    eps = 1e-9

    # 각 캘리브레이션 샘플의 리프 → leaf_table raw 카운트로 클래스 확률 계산
    leaf_ids = tree.apply(X_cal.values)
    probs_cal = np.zeros((n_cal, n_classes), dtype=float)
    for i, lid in enumerate(leaf_ids):
        label_dist = leaf_table.get(str(lid), {}).get("summary", {}).get(label_col, {})
        total = sum(label_dist.values()) or 1.0
        for cls, cnt in label_dist.items():
            idx = class_to_idx.get(str(cls))
            if idx is not None:
                probs_cal[i, idx] = cnt / total

    y_indices = np.array([class_to_idx.get(str(yv), 0) for yv in y_cal.tolist()])

    # 온도 스케일링 — NLL 최소화 grid search (T ∈ [0.5, 5.0] step 0.1)
    best_T, best_nll = 1.0, float("inf")
    for T_int in range(5, 51):
        T = T_int / 10.0
        log_p = np.log(probs_cal + eps) / T
        log_p -= log_p.max(axis=1, keepdims=True)
        sm = np.exp(log_p) / np.exp(log_p).sum(axis=1, keepdims=True)
        nll = float(-np.mean(np.log(sm[np.arange(n_cal), y_indices] + eps)))
        if nll < best_nll:
            best_nll, best_T = nll, T

    # Conformal q̂ — (1-alpha) 커버리지 보장 quantile
    log_p = np.log(probs_cal + eps) / best_T
    log_p -= log_p.max(axis=1, keepdims=True)
    sm_cal = np.exp(log_p) / np.exp(log_p).sum(axis=1, keepdims=True)
    scores = 1.0 - sm_cal[np.arange(n_cal), y_indices]
    q_level = float(min(np.ceil((n_cal + 1) * (1 - alpha)) / n_cal, 1.0))
    qhat = float(np.quantile(scores, q_level))

    print(f"  캘리브레이션: n={n_cal}, T={best_T:.1f}, q̂={qhat:.4f} (alpha={alpha})")
    return {
        "valid": True,
        "temperature": float(best_T),
        "qhat": float(qhat),
        "coverage_target": float(1 - alpha),
        "n_calibration": int(n_cal),
        "n_classes": int(n_classes),
        "classes": classes,
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
    selected_params: dict,
    validation_metrics: dict,
) -> dict:
    """피처명, 총 사고 건수, 리프 통계, 하이퍼파라미터, 라벨 분포."""
    label_dist = dict(Counter(df[label_col].tolist()))
    leaf_sizes = [v["summary"]["total"] for v in leaf_table.values()]

    # 피처별 분위수/IQR — llm.py rank_incidents() kNN 정규화 기준
    feature_stats: dict[str, dict] = {}
    for feat in feature_names:
        if feat == "형태" or feat not in df.columns:
            continue
        col = df[feat].dropna()
        if len(col) == 0:
            continue
        q1 = float(col.quantile(0.25))
        q3 = float(col.quantile(0.75))
        iqr = q3 - q1
        feature_stats[feat] = {
            "q1": q1,
            "q3": q3,
            "iqr": iqr if iqr > 0 else max(float(col.std()), 1.0),
            "median": float(col.median()),
        }

    return {
        "feature_names": feature_names,
        "total_incidents": int(len(df)),
        "n_leaves": len(leaf_table),
        "leaf_min_samples": int(min(leaf_sizes)) if leaf_sizes else 0,
        "leaf_max_samples": int(max(leaf_sizes)) if leaf_sizes else 0,
        "tree_depth": int(tree.get_depth()),
        "tree_version": TREE_VERSION,
        "hyperparameters": selected_params,
        "validation": validation_metrics,
        "label_column": label_col,
        "label_distribution": label_dist,
        "feature_stats": feature_stats,
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
    type_mapping = {cat: i for i, cat in enumerate(STORE_TYPE_ORDER)}
    df["형태"] = df["형태"].astype(str).str.strip()
    df["형태"] = df["형태"].map(type_mapping).fillna(-1).astype(float)

    # 피처 행렬 구성
    feature_names = WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
    X = df[feature_names].copy()
    y = df[label_col]

    print(f"  피처: {len(feature_names)}개, 라벨: {label_col} ({y.nunique()}종)")
    print(f"  라벨 분포: {dict(Counter(y.tolist()))}")

    # ── Decision Tree 튜닝 + 최종 학습 ──
    selected_params, validation_metrics, X_cal, y_cal = _tune_tree(X, y)
    print(f"  선택 하이퍼파라미터: {selected_params}")
    print(f"  검증 지표: {validation_metrics['best']['metrics']}")

    tree = DecisionTreeClassifier(**selected_params)
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
    metadata = _build_metadata(
        tree,
        df,
        label_col,
        feature_names,
        leaf_table,
        selected_params,
        validation_metrics,
    )
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

    # ── 5. tree_rules.json ──
    tree_rules = _export_tree_rules(
        tree,
        feature_names,
        source,
        selected_params,
        validation_metrics["best"]["metrics"],
    )
    _dump_json(tree_rules, out_dir / "tree_rules.json")
    print(f"  → tree_rules.json")

    # ── 6. calibration.json ──
    calibration = _calibrate(tree, X_cal, y_cal, leaf_table, label_col)
    _dump_json(calibration, out_dir / "calibration.json")
    print(f"  → calibration.json (valid={calibration['valid']})")

    # ── 검증 ──
    print(f"\n  [검증]")
    print(f"    트리 깊이: {depth} (max_depth={selected_params['max_depth']})")
    min_samples = min(v["summary"]["total"] for v in leaf_table.values())
    max_samples = max(v["summary"]["total"] for v in leaf_table.values())
    print(f"    리프 사례 수: 최소 {min_samples} / 최대 {max_samples}")
    incident_sizes = [len(v["incidents"]) for v in leaf_table.values()]
    print(f"    incidents 크기: 최소 {min(incident_sizes)} / 최대 {max(incident_sizes)}")
    has_incidents = all(s > 0 for s in incident_sizes)
    print(f"    모든 리프에 incidents 포함: {has_incidents}")
    assert depth <= selected_params["max_depth"], f"트리 깊이 초과: {depth}"
    # EMP는 데이터량(약 448건) 제약으로 리프 최소 15건까지 허용
    min_required = 15 if source == "emp" else selected_params["min_samples_leaf"]
    assert min_samples >= min_required, (
        f"최소 사례 수 미달: {min_samples} (기대: {min_required}, 소스: {source})"
    )
    assert has_incidents, "incidents 누락 리프 존재"
    assert all(
        data["summary"]["total"] == len(data["incidents"])
        for data in leaf_table.values()
    ), "leaf_table incidents가 전체 사고 수와 일치하지 않음"
    assert set(str(k) for k in leaf_table.keys()) == {
        node_id
        for node_id, node in tree_rules["nodes"].items()
        if node.get("type") == "leaf"
    }, "leaf_table과 tree_rules 리프 불일치"
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

#!/usr/bin/env python
"""
simulate_triggers.py — 위험 점수 트리거 오프라인 시뮬레이션 + 임계 산정

processed CSV의 실제 사고 조건으로 risk_score 분포를 만들어:
  1. θ_score=P70, θ_high=P90 산정 → models/{source}/risk_policy.json
  2. retrospective 변별력: 실제 사고일 조건 vs weather-셔플 대조의 AUC
     (사고가 특정 기상과 연관됐다면 실제 조건 점수 > 셔플 점수)
  3. 제안 θ에서 발동률(사고 조건 기준 recall) + 신뢰 게이트 효과

네트워크-free (CSV·models JSON만 사용). processed CSV 무수정(읽기 전용).
런타임과 동일한 core/risk_score.compute_risk_score 를 사용해 일관성 보장.

사용:
  python3 scripts/simulate_triggers.py           # cust+emp, risk_policy.json 생성
  python3 scripts/simulate_triggers.py --dry-run # 산정만, JSON 미생성
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd

from core.rule_matcher import (
    match_with_fallback,
    expand_with_siblings,
    compute_confidence,
)
from core.risk_score import compute_risk_score

PROCESSED = ROOT / "processed"
MODELS = ROOT / "models"
SOURCES = ["cust", "emp"]
LABEL_COLS = {"cust": "사고유형", "emp": "재해 유형"}
STORE_TYPE_ORDER = ["유통점", "유통행사", "직영점"]

WEATHER_FEATS = [
    "temperature_2m_min", "temperature_2m_max", "precipitation_sum",
    "snowfall_sum", "rain_sum", "wind_speed_10m_max",
    "relative_humidity_2m_mean", "soil_temperature_0_to_7cm_mean",
]
STORE_NUM_FEATS = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]

P_SCORE = 0.70   # θ_score 분위수
P_HIGH = 0.90    # θ_high 분위수


# ──────────────────────────────────────────────
# 순수 Python 통계
# ──────────────────────────────────────────────
def _quantile(xs: list[float], q: float) -> float:
    if not xs:
        return 0.0
    s = sorted(xs)
    if len(s) == 1:
        return s[0]
    idx = q * (len(s) - 1)
    lo = int(idx)
    frac = idx - lo
    if lo + 1 < len(s):
        return s[lo] * (1 - frac) + s[lo + 1] * frac
    return s[lo]


def _auc(pos: list[float], neg: list[float]) -> float:
    """Mann-Whitney U 기반 AUC = P(점수_pos > 점수_neg). 순수 Python."""
    if not pos or not neg:
        return float("nan")
    combined = sorted([(v, 1) for v in pos] + [(v, 0) for v in neg])
    # 평균 순위 (동점 처리)
    ranks = [0.0] * len(combined)
    i = 0
    while i < len(combined):
        j = i
        while j + 1 < len(combined) and combined[j + 1][0] == combined[i][0]:
            j += 1
        avg_rank = (i + j) / 2.0 + 1.0
        for kk in range(i, j + 1):
            ranks[kk] = avg_rank
        i = j + 1
    rank_sum_pos = sum(ranks[idx] for idx, (_, lab) in enumerate(combined) if lab == 1)
    n_pos, n_neg = len(pos), len(neg)
    u = rank_sum_pos - n_pos * (n_pos + 1) / 2.0
    return u / (n_pos * n_neg)


# ──────────────────────────────────────────────
# 모델 로드 + 피처 구성
# ──────────────────────────────────────────────
def _load_models(source: str) -> dict:
    d = MODELS / source
    out = {}
    for name in ["tree_rules", "leaf_table", "metadata", "siblings", "calibration", "severity_weights"]:
        p = d / f"{name}.json"
        out[name] = json.loads(p.read_text(encoding="utf-8")) if p.exists() else {}
    return out


def _row_features(row: pd.Series) -> tuple[dict, dict, dict]:
    """CSV row → (트리매칭 features, today_weather, today_store). 형태는 int 인코딩."""
    weather = {f: row[f] for f in WEATHER_FEATS if f in row and pd.notna(row[f])}
    store = {f: row[f] for f in STORE_NUM_FEATS if f in row and pd.notna(row[f])}
    type_str = str(row.get("형태", "")).strip()
    type_code = STORE_TYPE_ORDER.index(type_str) if type_str in STORE_TYPE_ORDER else -1
    store["형태"] = float(type_code)
    features = {**{f: float(weather.get(f, 0.0)) for f in WEATHER_FEATS},
                **{f: float(store.get(f, 0.0)) for f in STORE_NUM_FEATS},
                "형태": float(type_code)}
    return features, weather, store


def _score_one(features, weather, store, models) -> dict | None:
    """단일 조건의 위험 점수 (런타임과 동일 경로). thresholds=default로 점수만 사용."""
    leaf_id, leaf_data, fallback = match_with_fallback(
        features, models["tree_rules"], models["leaf_table"], models["siblings"], models["metadata"]
    )
    if leaf_data is None:
        return None
    label_col = LABEL_COLS.get(models.get("_source", "cust"))
    summary = leaf_data.get("summary", {})
    class_counts = summary.get(label_col) if fallback == 0 else None
    confidence = compute_confidence(
        fallback, summary.get("total", 0), class_counts, models["calibration"]
    )
    if fallback == 0:
        leaf_data = expand_with_siblings(leaf_id, leaf_data, models["leaf_table"], models["siblings"])
    feature_stats = models["metadata"].get("feature_stats", {})
    sev_weights = models["severity_weights"].get("weights", {})
    return compute_risk_score(
        rule_str=leaf_data.get("rule", ""),
        class_counts=summary.get(label_col),
        incidents=leaf_data.get("incidents", []),
        today_weather=weather, today_store=store,
        feature_stats=feature_stats, confidence=confidence,
        severity_weights=sev_weights, thresholds=None,
    )


# ──────────────────────────────────────────────
# 시뮬레이션
# ──────────────────────────────────────────────
def simulate(source: str, dry_run: bool = False) -> None:
    csv = PROCESSED / f"incidents_{source}.csv"
    if not csv.exists():
        print(f"  ❌ {csv} 없음 → 스킵")
        return
    models = _load_models(source)
    models["_source"] = source
    if not models["tree_rules"]:
        print(f"  ❌ models/{source} 산출물 없음 → train.py 먼저 실행")
        return

    df = pd.read_csv(csv)
    print(f"\n{'='*60}\n  [{source.upper()}] 트리거 시뮬레이션 ({len(df)}건)\n{'='*60}")

    # 양성: 실제 사고일 조건. 대조: weather를 셔플(매장-기상 매칭 파괴)
    rng = random.Random(42)
    shuffle_idx = list(range(len(df)))
    rng.shuffle(shuffle_idx)

    pos_scores, neg_scores = [], []
    pos_results = []
    for i in range(len(df)):
        feat, weather, store = _row_features(df.iloc[i])
        r = _score_one(feat, weather, store, models)
        if r:
            pos_scores.append(r["risk_score"])
            pos_results.append(r)
        # 대조: 같은 매장 store + 다른 row의 weather
        feat_s, weather_s, _ = _row_features(df.iloc[shuffle_idx[i]])
        feat_mix = {**feat}
        for f in WEATHER_FEATS:
            feat_mix[f] = feat_s[f]
        rn = _score_one(feat_mix, weather_s, store, models)
        if rn:
            neg_scores.append(rn["risk_score"])

    if not pos_scores:
        print("  ❌ 점수 계산 실패")
        return

    theta_score = _quantile(pos_scores, P_SCORE)
    theta_high = _quantile(pos_scores, P_HIGH)
    auc = _auc(pos_scores, neg_scores)

    # 제안 θ에서 발동률(사고 조건 기준) + 게이트 효과
    triggered = sum(1 for r in pos_results
                    if r["risk_score"] >= theta_score and r["confidence"] != "low")
    gated_low = sum(1 for r in pos_results if r["confidence"] == "low")
    n = len(pos_results)

    print(f"  점수 분포: min={min(pos_scores):.3f} P50={_quantile(pos_scores,0.5):.3f} "
          f"P70={theta_score:.3f} P90={theta_high:.3f} max={max(pos_scores):.3f}")
    print(f"  θ_score={theta_score:.3f}, θ_high={theta_high:.3f}")
    print(f"  변별력 AUC(실제 사고일 vs weather셔플) = {auc:.3f}  (0.5=무변별, 1.0=완벽)")
    print(f"  제안 θ 발동률(사고 조건): {triggered}/{n} = {triggered/n*100:.0f}%")
    print(f"  신뢰게이트 차단(confidence=low): {gated_low}/{n} = {gated_low/n*100:.0f}%")

    policy = {
        "version": "2026-05-risk-policy-v1",
        "source": source,
        "theta_score": round(theta_score, 4),
        "theta_high": round(theta_high, 4),
        "tau": 1.0,
        "weights": {"S1": 0.30, "S2": 0.45, "S3": 0.25},
        "derived_from_quantile": {"theta_score": P_SCORE, "theta_high": P_HIGH},
        "n_samples": n,
        "validation": {"auc_vs_weather_shuffle": round(auc, 4),
                       "trigger_rate_on_incidents": round(triggered / n, 4)},
    }
    if dry_run:
        print(f"  (dry-run) risk_policy.json 미생성")
    else:
        out = MODELS / source / "risk_policy.json"
        out.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {out.relative_to(ROOT)}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--dry-run", action="store_true", help="산정만, JSON 미생성")
    ap.add_argument("--source", choices=SOURCES, help="특정 소스만")
    args = ap.parse_args()
    targets = [args.source] if args.source else SOURCES
    for src in targets:
        simulate(src, dry_run=args.dry_run)
    print(f"\n  🎉 시뮬레이션 완료")


if __name__ == "__main__":
    main()

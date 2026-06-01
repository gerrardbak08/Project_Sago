#!/usr/bin/env python
"""
fit_risk_weights.py — 위험 점수 가중치 재학습 (2단계)

1단계 진단에서 S2(사례 근접도)는 AUC 0.84로 강한 변별력을 보였으나, 고정 가중치
(0.45·S2 + 0.30·S1 + 0.25·S3)는 S1의 역변별·S3 무변별이 S2를 희석해 score AUC가
0.57에 그쳤다. 이 스크립트는 양성(사고)+음성(비사고) 라벨로 **로지스틱 회귀**를 학습해
S1/S2/S3 가중치를 데이터에 맞게 재산정하고, train/test 분리로 과적합을 점검한다.

학습된 가중치·임계는 models/{source}/risk_policy.json 에 반영된다. 런타임
core.risk_score.compute_risk_score 는 weights/thresholds 를 주입받으므로 코드는 불변.

선행: scripts/build_non_incidents.py 로 data/non_incidents_{source}.csv 생성.
오프라인 전용(sklearn 사용). processed/*.csv 읽기 전용.

사용:
  python3 scripts/fit_risk_weights.py --source cust
  python3 scripts/fit_risk_weights.py --source cust --dry-run  # 학습만, JSON 미반영
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import train_test_split
from sklearn.metrics import roc_auc_score

from scripts.simulate_triggers import (
    _load_models, _row_features, _score_one, _quantile, _auc,
    PROCESSED, DATA, MODELS,
)

P_SCORE = 0.70
P_HIGH = 0.90


def _collect_signals(df, models, leave_one_out: bool) -> list[list[float]]:
    """각 row의 [S1, S2, S3] 신호 벡터를 수집."""
    out = []
    for i in range(len(df)):
        feat, w, st = _row_features(df.iloc[i])
        excl = {str(df.iloc[i].get("incident_id"))} if leave_one_out else None
        r = _score_one(feat, w, st, models, exclude_ids=excl)
        if r:
            s = r["signals"]
            out.append([s["S1"], s["S2"], s["S3"]])
    return out


def fit(source: str, dry_run: bool) -> None:
    neg_csv = DATA / f"non_incidents_{source}.csv"
    if not neg_csv.exists():
        print(f"  ❌ {neg_csv} 없음 → build_non_incidents.py 먼저 실행")
        return
    models = _load_models(source)
    models["_source"] = source
    if not models["tree_rules"]:
        print(f"  ❌ models/{source} 산출물 없음")
        return

    dfp = pd.read_csv(PROCESSED / f"incidents_{source}.csv")
    dfn = pd.read_csv(neg_csv)
    neg_stores = set(dfn["매장"].unique())
    dfp = dfp[dfp["매장"].isin(neg_stores)].reset_index(drop=True)  # 공정 비교

    print(f"\n{'='*60}\n  [{source.upper()}] 가중치 재학습 (양성 {len(dfp)} / 음성 {len(dfn)})\n{'='*60}")

    Xp = _collect_signals(dfp, models, leave_one_out=True)   # 양성: 자기 누수 차단
    Xn = _collect_signals(dfn, models, leave_one_out=False)
    X = np.array(Xp + Xn)
    y = np.array([1] * len(Xp) + [0] * len(Xn))

    # train/test 분리 — 과적합 점검
    Xtr, Xte, ytr, yte = train_test_split(X, y, test_size=0.3, random_state=42, stratify=y)
    clf = LogisticRegression(max_iter=1000, class_weight="balanced")
    clf.fit(Xtr, ytr)
    auc_tr = roc_auc_score(ytr, clf.decision_function(Xtr))
    auc_te = roc_auc_score(yte, clf.decision_function(Xte))
    coef = clf.coef_[0]
    print(f"  학습 가중치: S1={coef[0]:+.3f}  S2={coef[1]:+.3f}  S3={coef[2]:+.3f}")
    print(f"  AUC: train={auc_tr:.3f}  test={auc_te:.3f}  (test가 train과 비슷하면 과적합 적음)")

    # 전체로 최종 fit (배포용 가중치)
    clf_full = LogisticRegression(max_iter=1000, class_weight="balanced").fit(X, y)
    c = clf_full.coef_[0]
    weights = {"S1": float(c[0]), "S2": float(c[1]), "S3": float(c[2])}

    # 학습 가중치로 양성 score 분포 → θ 재산정 (발동률 통제 일관성)
    pos_scores = [weights["S1"] * r[0] + weights["S2"] * r[1] + weights["S3"] * r[2] for r in Xp]
    theta_score = _quantile(pos_scores, P_SCORE)
    theta_high = _quantile(pos_scores, P_HIGH)
    full_auc = _auc(
        pos_scores,
        [weights["S1"] * r[0] + weights["S2"] * r[1] + weights["S3"] * r[2] for r in Xn],
    )
    print(f"  재학습 score AUC(전체) = {full_auc:.3f}  (고정가중 0.572 → 개선폭 확인)")
    print(f"  θ_score={theta_score:.3f}, θ_high={theta_high:.3f}")

    policy_path = MODELS / source / "risk_policy.json"
    policy = json.loads(policy_path.read_text(encoding="utf-8")) if policy_path.exists() else {}
    policy.update({
        "version": "2026-06-risk-policy-v2-learned",
        "source": source,
        "weights": weights,
        "theta_score": round(theta_score, 4),
        "theta_high": round(theta_high, 4),
        "tau": policy.get("tau", 1.0),
        "fit": {
            "method": "logistic_regression_balanced",
            "n_pos": len(Xp), "n_neg": len(Xn),
            "auc_train": round(float(auc_tr), 4),
            "auc_test": round(float(auc_te), 4),
            "auc_full": round(float(full_auc), 4),
            "neg_stores": len(neg_stores),
        },
    })
    if dry_run:
        print("  (dry-run) risk_policy.json 미반영")
    else:
        policy_path.write_text(json.dumps(policy, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  → {policy_path.relative_to(ROOT)} 갱신")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", required=True, choices=["cust", "emp"])
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()
    fit(args.source, args.dry_run)
    print("\n  🎯 재학습 완료")


if __name__ == "__main__":
    main()

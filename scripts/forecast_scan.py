#!/usr/bin/env python3
"""
forecast_scan.py — 기상예보 기반 '선제(preemptive)' 위험 스캔  [MVP 축3: 적시성]

오늘만 보는 배치와 달리, 향후 N일 예보로 매장별 위험을 미리 계산해
"3일 후 강수+저온 → 낙상 위험" 같은 선제 알림 후보를 뽑는다.

· 런타임과 동일한 core/risk_score.compute_risk_score 사용 (일관성)
· get_weather_range 로 매장당 1회 호출(N일) → 효율적
· 오프라인 분석 전용 — 발송 경로 비변경. processed CSV 읽기전용.

사용:
  python3 scripts/forecast_scan.py --days 5 --limit 30
  python3 scripts/forecast_scan.py --days 7 --limit 50 --source emp --out /tmp/forecast.json
"""
from __future__ import annotations

import argparse
import json
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd

from core.weather import get_weather_range
from core.rule_matcher import match_with_fallback, expand_with_siblings, compute_confidence
from core.risk_score import compute_risk_score
from simulate_triggers import (
    _load_models, WEATHER_FEATS, STORE_NUM_FEATS, STORE_TYPE_ORDER, LABEL_COLS,
)

PROCESSED = ROOT / "processed"
SOURCES = ["cust", "emp"]


def _store_features(store_row: pd.Series, weather: dict) -> tuple[dict, dict, dict]:
    """매장 row + 예보 weather → (트리매칭 features, weather, store). 형태 int 인코딩."""
    w = {f: float(weather[f]) for f in WEATHER_FEATS if weather.get(f) is not None}
    store = {f: float(store_row[f]) for f in STORE_NUM_FEATS
             if f in store_row and pd.notna(store_row[f])}
    type_str = str(store_row.get("형태", "")).strip()
    type_code = STORE_TYPE_ORDER.index(type_str) if type_str in STORE_TYPE_ORDER else -1
    store["형태"] = float(type_code)
    feats = {**{f: w.get(f, 0.0) for f in WEATHER_FEATS},
             **{f: store.get(f, 0.0) for f in STORE_NUM_FEATS},
             "형태": float(type_code)}
    return feats, w, store


def _dominant_type(leaf_data: dict, label_col: str) -> str:
    cc = (leaf_data.get("summary", {}) or {}).get(label_col) or {}
    return max(cc, key=cc.get) if cc else ""


def score_day(store_row, weather, models, source) -> dict | None:
    """매장×하루 위험 점수 (런타임 경로 재현, dominant 포함)."""
    feats, w, store = _store_features(store_row, weather)
    leaf_id, leaf_data, fallback = match_with_fallback(
        feats, models["tree_rules"], models["leaf_table"], models["siblings"], models["metadata"])
    if leaf_data is None:
        return None
    label_col = LABEL_COLS[source]
    summary = leaf_data.get("summary", {})
    class_counts = summary.get(label_col) if fallback == 0 else None
    confidence = compute_confidence(fallback, summary.get("total", 0), class_counts, models["calibration"])
    dom = _dominant_type(leaf_data, label_col)
    if fallback == 0:
        leaf_data = expand_with_siblings(leaf_id, leaf_data, models["leaf_table"], models["siblings"])
    policy = models.get("risk_policy", {})
    th = None
    if policy.get("theta_score") is not None:
        th = {"theta_score": policy["theta_score"],
              "theta_high": policy.get("theta_high", policy["theta_score"]),
              "tau": policy.get("tau", 1.0)}
    r = compute_risk_score(
        rule_str=leaf_data.get("rule", ""), class_counts=summary.get(label_col),
        incidents=leaf_data.get("incidents", []), today_weather=w, today_store=store,
        feature_stats=models["metadata"].get("feature_stats", {}), confidence=confidence,
        severity_weights=models["severity_weights"].get("weights", {}), thresholds=th,
        weights=policy.get("weights"))
    r["dominant_type"] = dom
    return r


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=5, help="앞으로 며칠 예보 스캔")
    ap.add_argument("--limit", type=int, default=30, help="스캔할 매장 수(샘플)")
    ap.add_argument("--source", choices=["cust", "emp", "both"], default="both")
    ap.add_argument("--out", default="", help="결과 JSON 경로(옵션)")
    a = ap.parse_args()

    stores = pd.read_csv(PROCESSED / "stores.csv")
    stores = stores[stores["위도"].notna() & stores["경도"].notna()].head(a.limit)
    sources = SOURCES if a.source == "both" else [a.source]
    models = {s: {**_load_models(s), "_source": s} for s in sources}

    start = (date.today() + timedelta(days=1)).strftime("%Y-%m-%d")
    end = (date.today() + timedelta(days=a.days)).strftime("%Y-%m-%d")
    print(f"[forecast] {start} ~ {end} · 매장 {len(stores)}개 · source={a.source}")

    candidates = []
    for _, row in stores.iterrows():
        wr = get_weather_range(float(row["위도"]), float(row["경도"]), start, end)
        if not wr:
            continue
        peak = None
        for day, weather in sorted(wr.items()):
            for src in sources:
                r = score_day(row, weather, models[src], src)
                if r is None:
                    continue
                cand = {"score": r["risk_score"], "day": day, "source": src,
                        "trigger": r["trigger"], "severity": r["severity"],
                        "dominant": r["dominant_type"], "signals": r["signals"]}
                if peak is None or cand["score"] > peak["score"]:
                    peak = cand
        if peak:
            lead = (datetime.strptime(peak["day"], "%Y-%m-%d").date() - date.today()).days
            candidates.append({
                "store_code": str(row["매장"]), "store_name": str(row.get("매장명", "")),
                "region": str(row.get("지역", "")), "lead_days": lead, **peak})

    candidates.sort(key=lambda c: c["score"], reverse=True)
    triggered = [c for c in candidates if c["trigger"]]

    print(f"\n[선제 알림 후보 — 위험 점수 順] (트리거 {len(triggered)}/{len(candidates)})\n")
    print(f"{'매장':<14}{'지역':<10}{'D+':<4}{'점수':<8}{'유형':<10}{'발동'}")
    print("─" * 60)
    for c in candidates[:20]:
        flag = "🔴발동" if c["trigger"] else ("🟠" if c["severity"] == "high" else "")
        print(f"{c['store_name'][:12]:<14}{c['region'][:8]:<10}{c['lead_days']:<4}"
              f"{c['score']:<8.3f}{c['dominant'][:8]:<10}{flag}")

    if a.out:
        Path(a.out).write_text(json.dumps(candidates, ensure_ascii=False, indent=1), encoding="utf-8")
        print(f"\n저장: {a.out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

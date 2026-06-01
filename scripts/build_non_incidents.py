#!/usr/bin/env python
"""
build_non_incidents.py — 비사고(negative) 데이터 구축

processed/incidents_{source}.csv 의 각 매장 사고일을 기준으로, **같은 매장·같은 계절
(사고일 ±45일 윈도우)** 의 비사고일을 골라 그날의 실제 기상을 Open-Meteo archive에서
수집한다. 매장 환경 피처(평수/인원/매출/형태 등)는 그 매장 고정값을 결합한다.

목적: 사고 예측 변별력(AUC)을 진짜로 측정하려면 "사고 안 난 날"의 음성 샘플이 필요한데,
현재 데이터엔 사고 기록(양성)만 있다. 비사고일은 *실제로 존재*하고 그날 기상도 *실재*하므로
랜덤 생성이 아니라 archive에서 수집한다.

공정성: 같은 매장·같은 계절에서만 음성을 뽑아 "계절 맞히기" 가짜 변별을 차단한다.

산출: data/non_incidents_{source}.csv (사고 CSV와 동일 피처 스키마 + label=0)
processed/*.csv 는 읽기 전용. 네트워크 1회성 — 산출 CSV를 커밋해 재현.

사용:
  python3 scripts/build_non_incidents.py            # cust+emp
  python3 scripts/build_non_incidents.py --source cust --k 3 --window 45
  python3 scripts/build_non_incidents.py --limit 20 # 매장 20개만(테스트)
"""

from __future__ import annotations

import argparse
import random
import sys
import time
from datetime import date, datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

import pandas as pd

from core.weather import get_weather_range
from scripts.simulate_triggers import WEATHER_FEATS, STORE_NUM_FEATS

PROCESSED = ROOT / "processed"
DATA = ROOT / "data"
SOURCES = ["cust", "emp"]
CARRY_COLS = STORE_NUM_FEATS + ["형태", "매장명", "지역", "위도", "경도"]


def _parse_date(s) -> date | None:
    try:
        return datetime.strptime(str(s)[:10], "%Y-%m-%d").date()
    except (ValueError, TypeError):
        return None


def build(source: str, k: int, window: int, sleep_s: float, limit: int | None,
          resume: bool = False) -> None:
    csv = PROCESSED / f"incidents_{source}.csv"
    if not csv.exists():
        print(f"  ❌ {csv} 없음 → 스킵")
        return
    df = pd.read_csv(csv)
    df["_d"] = df["발생일시"].map(_parse_date)
    df = df[df["_d"].notna()]
    yesterday = date.today() - timedelta(days=1)

    # resume: 기존 산출물의 이미 수집된 매장은 건너뛰고 누락분만 이어서 수집
    out_path = DATA / f"non_incidents_{source}.csv"
    prev_rows: list[dict] = []
    done_stores: set = set()
    if resume and out_path.exists():
        prev = pd.read_csv(out_path)
        prev_rows = prev.to_dict("records")
        done_stores = set(prev["매장"].unique())
        print(f"  [resume] 기존 {len(prev_rows)}건 / {len(done_stores)}매장 유지, 누락분만 수집")

    stores = list(df.groupby("매장"))
    if limit:
        stores = stores[:limit]
    stores = [(sc, g) for sc, g in stores if sc not in done_stores]
    print(f"\n{'='*60}\n  [{source.upper()}] 비사고 수집 — {len(stores)}개 매장(잔여)\n{'='*60}")

    rng = random.Random(42)
    rows: list[dict] = list(prev_rows)
    ok, skip = 0, 0
    for n, (store_code, g) in enumerate(stores, 1):
        incident_dates = set(g["_d"].tolist())
        first = g.iloc[0]
        carry = {c: first[c] for c in CARRY_COLS if c in g.columns}

        d_lo = min(incident_dates) - timedelta(days=window)
        d_hi = min(max(incident_dates) + timedelta(days=window), yesterday)
        if d_lo > d_hi:
            skip += 1
            continue

        wmap = get_weather_range(float(first["위도"]), float(first["경도"]),
                                 d_lo.isoformat(), d_hi.isoformat())
        if not wmap:
            skip += 1
            continue

        # 비사고일 후보(같은 계절 윈도우, 사고일 제외) → 매장 전체에서 중복 없이 K*사고일수 만큼
        chosen: set[str] = set()
        for d in incident_dates:
            lo, hi = d - timedelta(days=window), d + timedelta(days=window)
            cands = [
                day for day in wmap
                if (dd := _parse_date(day)) and lo <= dd <= hi
                and dd not in incident_dates and day not in chosen
            ]
            rng.shuffle(cands)
            for day in cands[:k]:
                chosen.add(day)

        for day in chosen:
            w = wmap[day]
            if any(w.get(p) is None for p in WEATHER_FEATS):
                continue
            rows.append({
                **{p: w[p] for p in WEATHER_FEATS},
                **carry,
                "매장": store_code,
                "발생일시": day,
                "incident_id": f"NEG-{store_code}-{day}",
                "label": 0,
            })
        ok += 1
        if n % 50 == 0:
            print(f"    {n}/{len(stores)} 매장 처리 (수집 {len(rows)}건) — 중간 저장")
            DATA.mkdir(exist_ok=True)
            pd.DataFrame(rows).to_csv(out_path, index=False, encoding="utf-8-sig")
        time.sleep(sleep_s)

    DATA.mkdir(exist_ok=True)
    pd.DataFrame(rows).to_csv(out_path, index=False, encoding="utf-8-sig")
    print(f"  ✅ {ok}개 매장 성공 / {skip}개 스킵 → {out_path.relative_to(ROOT)} ({len(rows)}건)")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--source", choices=SOURCES)
    ap.add_argument("--k", type=int, default=3, help="사고일당 비사고 샘플 수")
    ap.add_argument("--window", type=int, default=45, help="같은 계절 윈도우(±일)")
    ap.add_argument("--sleep", type=float, default=0.3, help="매장간 대기(초, rate-limit)")
    ap.add_argument("--limit", type=int, help="매장 수 제한(테스트)")
    ap.add_argument("--resume", action="store_true", help="기존 산출물의 누락 매장만 이어서 수집")
    args = ap.parse_args()
    targets = [args.source] if args.source else SOURCES
    for src in targets:
        build(src, args.k, args.window, args.sleep, args.limit, args.resume)
    print("\n  🎉 비사고 수집 완료")


if __name__ == "__main__":
    main()

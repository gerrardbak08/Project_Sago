#!/usr/bin/env python
"""
build_rule_incidents.py - 룰 기반 사고 검색용 인덱스 생성.

processed/incidents_{cust,emp}.csv를 Lambda가 바로 읽을 수 있는 JSON으로 변환해
models/{cust,emp}/rule_incidents.json에 저장한다.
"""

from __future__ import annotations

import json
import sys
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

    out_dir = MODELS / source
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / "rule_incidents.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)

    print(f"[OK] {out_path} 생성 ({len(df)}건)")


def main() -> None:
    for source in ["cust", "emp"]:
        _build_source(source)


if __name__ == "__main__":
    main()

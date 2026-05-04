#!/usr/bin/env python3
"""
xlsx → JSON 변환 스크립트
입력: data/*.xlsx
출력: proj/src/data/raw/*.json
"""

import json
import math
import os
from datetime import datetime

import pandas as pd

# ── 경로 설정 ──────────────────────────────────────────────────────────────────
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(BASE_DIR, "data")
OUT_DIR  = os.path.join(BASE_DIR, "proj", "src", "data", "raw")
os.makedirs(OUT_DIR, exist_ok=True)

# ── 정규화 테이블 ──────────────────────────────────────────────────────────────
DEPT_NORMALIZE = {
    "관악/수원/용인영업부": "관악/평택/안산영업부",
    "평택/안산영업부":      "관악/평택/안산영업부",
    "경남영업부문":         "경남영업부",
    "강원영업부, 경기강원영업부": "강원영업부",
    "오픈지원부":           "기타",
    "정보 없음":            "기타",
}

TYPE_NORMALIZE = {
    " 재물": "재물",
    " 클레임": "클레임",
    " 자상": "자상",
    " 낙상": "낙상",
    " 충돌": "충돌",
    "추락": "낙상",
    "중돌": "충돌",
}


# ── 공통 유틸 ──────────────────────────────────────────────────────────────────
def _safe(val):
    """pandas 값을 JSON 직렬화 가능한 Python 기본 타입으로 변환."""
    import datetime as dt
    if val is None:
        return None
    # NaT / NaN (float)
    if isinstance(val, float) and math.isnan(val):
        return None
    # pandas Timestamp
    if isinstance(val, pd.Timestamp):
        return val.isoformat() if not pd.isnull(val) else None
    # datetime.datetime (must come before date check)
    if isinstance(val, dt.datetime):
        return val.isoformat()
    # datetime.date
    if isinstance(val, dt.date):
        return val.isoformat()
    # datetime.time  (예: 발생시간 컬럼)
    if isinstance(val, dt.time):
        return val.strftime("%H:%M:%S")
    # pandas NA / NaT
    try:
        if pd.isnull(val):
            return None
    except (TypeError, ValueError):
        pass
    # numpy int / float
    if hasattr(val, "item"):
        return val.item()
    return val


def df_to_records(df: pd.DataFrame) -> list:
    """DataFrame → list[dict], 모든 값을 JSON 안전 타입으로 변환."""
    records = []
    for row in df.to_dict(orient="records"):
        records.append({k: _safe(v) for k, v in row.items()})
    return records


def save_json(path: str, records: list):
    payload = {
        "generated_at": datetime.now().isoformat(),
        "count": len(records),
        "data": records,
    }
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    size_kb = os.path.getsize(path) / 1024
    print(f"  → 저장 완료: {path}  ({size_kb:.1f} KB)")


# ── 1. 직원사고DB ──────────────────────────────────────────────────────────────
def convert_accidents():
    print("\n[1/3] 직원사고DB 변환 중...")
    src = os.path.join(DATA_DIR, "직원사고DB.xlsx")
    df = pd.read_excel(src, sheet_name="Sheet3", engine="openpyxl")
    print(f"  읽기 완료: {len(df)}행 × {len(df.columns)}열")

    # 부서명 정규화
    if "부서" in df.columns:
        df["부서"] = df["부서"].map(lambda x: DEPT_NORMALIZE.get(str(x).strip(), x) if pd.notna(x) else x)

    records = df_to_records(df)
    out = os.path.join(OUT_DIR, "accidents.json")
    save_json(out, records)
    print(f"  건수: {len(records)}")

    # 정규화 후 부서명 목록
    if "부서" in df.columns:
        depts = sorted(df["부서"].dropna().unique().tolist())
        print(f"  정규화 후 부서명 목록: {depts}")

    # 첫 번째 레코드 키 목록
    print(f"  첫 번째 레코드 키: {list(records[0].keys())}")
    return records


# ── 2. 고객사고DB ──────────────────────────────────────────────────────────────
def convert_customer_accidents():
    print("\n[2/3] 고객사고DB 변환 중...")
    src = os.path.join(DATA_DIR, "고객사고DB.xlsx")
    df = pd.read_excel(src, sheet_name="고객사고DB", engine="openpyxl")
    print(f"  읽기 완료: {len(df)}행 × {len(df.columns)}열")

    # 사고유형 정규화
    if "사고유형" in df.columns:
        def norm_type(val):
            if pd.isna(val):
                return val
            s = str(val).strip()
            return TYPE_NORMALIZE.get(s, s)
        df["사고유형"] = df["사고유형"].map(norm_type)

    # 공백 제거 컬럼
    for col in ["처리과정", "장소", "원인1"]:
        if col in df.columns:
            df[col] = df[col].map(lambda x: str(x).strip() if pd.notna(x) else x)

    records = df_to_records(df)
    out = os.path.join(OUT_DIR, "customer_accidents.json")
    save_json(out, records)
    print(f"  건수: {len(records)}")

    # 정규화 후 사고유형 목록
    if "사고유형" in df.columns:
        types = sorted(df["사고유형"].dropna().unique().tolist())
        print(f"  정규화 후 사고유형 목록: {types}")

    # 첫 번째 레코드 키 목록
    print(f"  첫 번째 레코드 키: {list(records[0].keys())}")
    return records


# ── 3. 매장리스트 ──────────────────────────────────────────────────────────────
def convert_stores():
    print("\n[3/3] 매장리스트 변환 중...")
    src = os.path.join(DATA_DIR, "매장리스트_260408.xlsx")
    df = pd.read_excel(src, sheet_name="매장현황", engine="openpyxl")
    print(f"  읽기 완료: {len(df)}행 × {len(df.columns)}열")

    records = df_to_records(df)
    out = os.path.join(OUT_DIR, "stores.json")
    save_json(out, records)
    print(f"  건수: {len(records)}")

    # 첫 번째 레코드 키 목록
    print(f"  첫 번째 레코드 키: {list(records[0].keys())}")
    return records


# ── 메인 ───────────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    print("=" * 60)
    print("xlsx → JSON 변환 시작")
    print(f"출력 디렉터리: {OUT_DIR}")
    print("=" * 60)

    acc_records  = convert_accidents()
    cust_records = convert_customer_accidents()
    store_records = convert_stores()

    print("\n" + "=" * 60)
    print("변환 완료 요약")
    print("=" * 60)
    print(f"  accidents.json          : {len(acc_records):>5}건")
    print(f"  customer_accidents.json : {len(cust_records):>5}건")
    print(f"  stores.json             : {len(store_records):>5}건")
    print("=" * 60)

#!/usr/bin/env python
"""
build_dataset.py — 다이소 매장 안전사고 예방 AI 전처리 파이프라인

4단계:
  Step 1: 매장 지오코딩 + 인원현황/매출 통합 → stores.csv
  Step 2: 사고 데이터 정제 + 매장 매칭 → incidents_cust.csv, incidents_emp.csv
  Step 3: 기상 데이터 수집 → incidents CSV에 기상 컬럼 추가
  Step 4: 핵심 피처만 남기고 정리
"""

from __future__ import annotations

import argparse
import os
import re
import time
from pathlib import Path

import numpy as np
import pandas as pd
import requests

# ──────────────────────────────────────────────
# 경로
# ──────────────────────────────────────────────
ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
OUT = ROOT / "processed"
OUT.mkdir(parents=True, exist_ok=True)

# ──────────────────────────────────────────────
# 전역 상수 — 핵심 피처 정의
# ──────────────────────────────────────────────
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

STORE_CAT_FEATURES = ["형태"]

TREE_FEATURES = WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES

CUST_CASE_COLS = [
    "매장",
    "매장명",
    "지역",
    "발생일시",
    "사고유형",
    "장소",
    "원인1",
    "원인2",
    "원인3",
    "사고내용요약",
]

EMP_CASE_COLS = [
    "매장",
    "매장명",
    "지역",
    "발생일시",
    "재해 종류",
    "재해 유형",
    "기인물",
    "상병명",
    "사고 내용",
]

CUST_TYPE_FIX = {"중돌": "충돌", "낙성": "낙상", "추락": "낙상"}

# Open-Meteo Historical API에서 수집할 전체 기상 변수
OPEN_METEO_DAILY_VARS = [
    "weather_code",
    "temperature_2m_max",
    "temperature_2m_min",
    "temperature_2m_mean",
    "apparent_temperature_max",
    "apparent_temperature_min",
    "apparent_temperature_mean",
    "precipitation_sum",
    "rain_sum",
    "snowfall_sum",
    "precipitation_hours",
    "wind_speed_10m_max",
    "wind_gusts_10m_max",
    "wind_direction_10m_dominant",
    "shortwave_radiation_sum",
    "et0_fao_evapotranspiration",
    "daylight_duration",
    "sunshine_duration",
    "relative_humidity_2m_mean",
    "relative_humidity_2m_max",
    "relative_humidity_2m_min",
    "dew_point_2m_mean",
    "dew_point_2m_max",
    "dew_point_2m_min",
    "pressure_msl_mean",
    "soil_temperature_0_to_7cm_mean",
]


# ──────────────────────────────────────────────
# 유틸리티
# ──────────────────────────────────────────────
def _is_store_row(code) -> bool:
    """매장 행 필터: 조직코드 5자리, 50000 아니고 57xxx(부서/팀) 아닌 행."""
    try:
        c = int(float(code))
    except (ValueError, TypeError):
        return False
    s = str(c)
    if len(s) != 5:
        return False
    if c == 50000:
        return False
    if s.startswith("57"):
        return False
    return True


def _kakao_geocode(address: str, api_key: str) -> tuple[float | None, float | None]:
    """카카오 REST API로 주소 → 위경도 변환."""
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {api_key}"}
    try:
        resp = requests.get(url, headers=headers, params={"query": address}, timeout=5)
        resp.raise_for_status()
        docs = resp.json().get("documents", [])
        if docs:
            return float(docs[0]["y"]), float(docs[0]["x"])
    except Exception:
        pass
    return None, None


# ──────────────────────────────────────────────
# Step 1: 매장 마스터 구축
# ──────────────────────────────────────────────
def step1_build_stores() -> pd.DataFrame:
    """매장리스트 + 인원현황 + 일매출 → stores.csv"""
    print("[Step 1] 매장 마스터 구축 시작")

    # 1-a. 매장리스트 로드
    stores = pd.read_excel(DATA / "매장리스트_260408.xlsx")
    stores["매장"] = stores["매장"].astype(int)
    print(f"  매장리스트 로드: {len(stores)}건")

    # 1-b. 기존 stores.csv에서 위경도 복원 (증분 처리)
    old_path = OUT / "stores.csv"
    if old_path.exists():
        old = pd.read_csv(old_path)
        if "위도" in old.columns and "경도" in old.columns:
            geo = old[["매장", "위도", "경도"]].dropna(subset=["위도", "경도"])
            geo["매장"] = geo["매장"].astype(int)
            stores = stores.merge(geo, on="매장", how="left")
            restored = stores["위도"].notna().sum()
            print(f"  기존 위경도 복원: {restored}건")

    # 1-c. 카카오 지오코딩 (환경변수 있을 때만)
    api_key = os.environ.get("KAKAO_REST_API_KEY")
    if api_key and "위도" in stores.columns:
        need_geo = stores[stores["위도"].isna() & stores["신주소"].notna()]
        if len(need_geo) > 0:
            print(f"  지오코딩 대상: {len(need_geo)}건")
            for idx in need_geo.index:
                addr = stores.at[idx, "신주소"]
                lat, lng = _kakao_geocode(str(addr), api_key)
                if lat is not None:
                    stores.at[idx, "위도"] = lat
                    stores.at[idx, "경도"] = lng
                time.sleep(0.05)
            geocoded = stores["위도"].notna().sum() - restored
            print(f"  신규 지오코딩: {geocoded}건")
    elif api_key and "위도" not in stores.columns:
        # 위경도 컬럼이 아예 없는 경우 (최초 실행)
        stores["위도"] = np.nan
        stores["경도"] = np.nan
        need_geo = stores[stores["신주소"].notna()]
        print(f"  지오코딩 대상 (최초): {len(need_geo)}건")
        for idx in need_geo.index:
            addr = stores.at[idx, "신주소"]
            lat, lng = _kakao_geocode(str(addr), api_key)
            if lat is not None:
                stores.at[idx, "위도"] = lat
                stores.at[idx, "경도"] = lng
            time.sleep(0.05)
        print(f"  지오코딩 완료: {stores['위도'].notna().sum()}건")
    else:
        if "위도" not in stores.columns:
            stores["위도"] = np.nan
            stores["경도"] = np.nan
        print("  KAKAO_REST_API_KEY 없음 → 지오코딩 스킵")

    # 1-d. 직영점 인원현황 로드
    #   Row 0: 그룹 헤더, Row 1: 컬럼 헤더 → header=None, skiprows 후 수동 지정
    jy_raw = pd.read_excel(
        DATA / "직영점_인원현황DB.xlsx",
        sheet_name="직영점",
        header=None,
        skiprows=2,
    )
    jy_cols = [
        "조직코드", "조직명", "오픈일", "실평수", "매장등급",
        "목표", "실적", "달성률", "전년동월", "신장률",
        "TO", "합산PO", "GAP", "입고도우미PO", "매장PO",
        "정규", "임시", "파트",
    ]
    jy_raw.columns = jy_cols
    jy = jy_raw[jy_raw["조직코드"].apply(_is_store_row)].copy()
    jy["매장"] = jy["조직코드"].astype(float).astype(int)
    jy["합산PO"] = pd.to_numeric(jy["합산PO"], errors="coerce")
    jy["입고도우미PO"] = pd.to_numeric(jy["입고도우미PO"], errors="coerce")
    print(f"  직영점 인원현황: {len(jy)}건")

    # 1-e. 유통점 인원현황 로드
    #   Row 0-2: 헤더 → header=None, skiprows=3
    yt_raw = pd.read_excel(
        DATA / "유통점_인원현황DB.xlsx",
        sheet_name="유통점",
        header=None,
        skiprows=3,
    )
    yt_cols = [
        "조직코드", "조직명", "조직형태", "매장구분", "오픈일", "평수", "거래선",
        "단품관리", "TO", "합산PO", "GAP", "입고도우미PO", "매장PO",
        "정규_4년미만", "정규_4_6", "정규_6_8", "정규_8_10", "정규_10이상",
        "정규계", "임시", "파트",
    ]
    yt_raw.columns = yt_cols
    yt = yt_raw[yt_raw["조직코드"].apply(_is_store_row)].copy()
    yt["매장"] = yt["조직코드"].astype(float).astype(int)
    yt["합산PO"] = pd.to_numeric(yt["합산PO"], errors="coerce")
    yt["입고도우미PO"] = pd.to_numeric(yt["입고도우미PO"], errors="coerce")
    print(f"  유통점 인원현황: {len(yt)}건")

    # 인원현황 통합 (직영+유통)
    staff = pd.concat(
        [
            jy[["매장", "합산PO", "입고도우미PO"]],
            yt[["매장", "합산PO", "입고도우미PO"]],
        ],
        ignore_index=True,
    )
    staff = staff.rename(columns={"합산PO": "매장인원"})
    stores = stores.merge(staff, on="매장", how="left")
    merged_staff = stores["매장인원"].notna().sum()
    print(f"  인원현황 매칭: {merged_staff}건")

    # 1-f. 직영점 일매출 로드
    sales = pd.read_excel(DATA / "직영점_일매출_평균.xlsx", sheet_name="raw")
    sales = sales.rename(columns={"코드": "매장", "매장": "매장명_sales"})
    sales["매장"] = pd.to_numeric(sales["매장"], errors="coerce")
    sales = sales.dropna(subset=["매장"])
    sales["매장"] = sales["매장"].astype(int)

    # 일평균매출 = 누적실적 / 일수 (직접 계산)
    sales["누적실적"] = pd.to_numeric(sales["누적실적"], errors="coerce")
    sales["일수"] = pd.to_numeric(sales["일수"], errors="coerce")
    sales["배송일자"] = pd.to_numeric(sales["배송일자"], errors="coerce")
    sales["일평균매출"] = sales["누적실적"] / sales["일수"]
    # 일평균물동량 = round(0.00002 * (6/배송일자) * 일평균매출, 0)
    sales["일평균물동량"] = np.round(
        0.00002 * (6 / sales["배송일자"]) * sales["일평균매출"], 0
    )
    stores = stores.merge(
        sales[["매장", "일평균매출", "일평균물동량"]], on="매장", how="left"
    )
    merged_sales = stores["일평균매출"].notna().sum()
    print(f"  일매출 매칭: {merged_sales}건 (유통점은 NaN 허용)")

    # 저장
    stores.to_csv(OUT / "stores.csv", index=False)
    print(f"  → {OUT / 'stores.csv'} 저장 ({len(stores)}건, {len(stores.columns)}컬럼)")
    return stores


# ──────────────────────────────────────────────
# Step 2: 사고 데이터 정제 + 매장 매칭
# ──────────────────────────────────────────────
def step2_build_incidents(stores: pd.DataFrame) -> None:
    """고객/직원 사고 DB → 매장 매칭 → incidents CSV 생성."""
    print("\n[Step 2] 사고 데이터 정제 시작")

    # 매장 매칭용 키 준비 (매장명 기준)
    store_cols = [
        "매장", "매장명", "지역", "형태", "평수", "실평수", "창고",
        "계약면적(㎡)", "진열평수", "위도", "경도",
    ]
    # 인원/매출 컬럼이 있으면 포함
    for c in ["매장인원", "입고도우미PO", "일평균매출", "일평균물동량"]:
        if c in stores.columns:
            store_cols.append(c)
    store_lookup = stores[store_cols].copy()

    # ── 고객사고 ──
    cust = pd.read_excel(DATA / "고객사고DB.xlsx")
    print(f"  고객사고 로드: {len(cust)}건")

    cust = cust.merge(store_lookup, on="매장명", how="left")
    before = len(cust)
    cust = cust.dropna(subset=["위도", "경도"])
    print(f"  위경도 매칭 후: {len(cust)}건 (제거: {before - len(cust)}건)")

    # 사고유형 정제
    cust["사고유형"] = cust["사고유형"].astype(str).str.strip()
    cust["사고유형"] = cust["사고유형"].replace(CUST_TYPE_FIX)
    cust["source"] = "cust"

    # 발생일시를 날짜 형식으로 통일
    cust["발생일시"] = pd.to_datetime(cust["발생일시"], errors="coerce").dt.strftime(
        "%Y-%m-%d"
    )

    cust.to_csv(OUT / "incidents_cust.csv", index=False)
    print(f"  → {OUT / 'incidents_cust.csv'} 저장 ({len(cust)}건)")

    # ── 직원사고 ──
    emp = pd.read_excel(DATA / "직원사고DB.xlsx")
    print(f"  직원사고 로드: {len(emp)}건")

    # 재해일자 → 발생일시 로 rename
    emp = emp.rename(columns={"재해일자": "발생일시"})

    emp = emp.merge(store_lookup, on="매장명", how="left")
    before = len(emp)
    emp = emp.dropna(subset=["위도", "경도"])
    print(f"  위경도 매칭 후: {len(emp)}건 (제거: {before - len(emp)}건)")

    emp["source"] = "emp"

    # 발생일시를 날짜 형식으로 통일
    emp["발생일시"] = pd.to_datetime(emp["발생일시"], errors="coerce").dt.strftime(
        "%Y-%m-%d"
    )

    emp.to_csv(OUT / "incidents_emp.csv", index=False)
    print(f"  → {OUT / 'incidents_emp.csv'} 저장 ({len(emp)}건)")


# ──────────────────────────────────────────────
# Step 3: 기상 데이터 수집
# ──────────────────────────────────────────────
def _fetch_weather(lat: float, lon: float, date: str) -> dict | None:
    """Open-Meteo Historical API에서 일별 기상 데이터 수집. 429 시 지수 백오프."""
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": round(lat, 4),
        "longitude": round(lon, 4),
        "start_date": date,
        "end_date": date,
        "daily": ",".join(OPEN_METEO_DAILY_VARS),
        "timezone": "Asia/Seoul",
    }
    for attempt in range(4):  # 최초 + 최대 3회 재시도
        try:
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code == 429:
                wait = 2 ** (attempt + 1)
                print(f"    429 Too Many Requests → {wait}초 대기 후 재시도")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            daily = resp.json().get("daily", {})
            if not daily:
                return None
            row = {}
            for var in OPEN_METEO_DAILY_VARS:
                vals = daily.get(var, [None])
                row[var] = vals[0] if vals else None
            return row
        except Exception as e:
            if attempt < 3:
                time.sleep(2 ** (attempt + 1))
            else:
                print(f"    기상 수집 실패 ({lat},{lon},{date}): {e}")
    return None


def step3_collect_weather() -> None:
    """incidents CSV의 (위도, 경도, 발생일) 조합별 기상 데이터 수집."""
    print("\n[Step 3] 기상 데이터 수집 시작")

    # 기존 weather.csv 로드 (증분 처리용)
    weather_path = OUT / "weather.csv"
    if weather_path.exists():
        weather_df = pd.read_csv(weather_path)
        existing_keys = set(
            zip(
                weather_df["위도"].round(4),
                weather_df["경도"].round(4),
                weather_df["date"],
            )
        )
        print(f"  기존 기상 데이터: {len(weather_df)}건")
    else:
        weather_df = pd.DataFrame()
        existing_keys = set()

    # incidents에서 수집 대상 추출
    targets = []
    for csv_name in ["incidents_cust.csv", "incidents_emp.csv"]:
        csv_path = OUT / csv_name
        if not csv_path.exists():
            continue
        df = pd.read_csv(csv_path)
        if "위도" in df.columns and "경도" in df.columns and "발생일시" in df.columns:
            sub = df[["위도", "경도", "발생일시"]].dropna()
            sub = sub.rename(columns={"발생일시": "date"})
            # 날짜만 추출 (시간 제거)
            sub["date"] = pd.to_datetime(sub["date"], errors="coerce").dt.strftime(
                "%Y-%m-%d"
            )
            targets.append(sub)

    if not targets:
        print("  수집 대상 없음")
        return

    all_targets = pd.concat(targets, ignore_index=True).drop_duplicates()
    all_targets["위도"] = all_targets["위도"].round(4)
    all_targets["경도"] = all_targets["경도"].round(4)

    # 이미 수집된 건 제외
    need = []
    for _, row in all_targets.iterrows():
        key = (row["위도"], row["경도"], row["date"])
        if key not in existing_keys:
            need.append(row)

    print(f"  전체 대상: {len(all_targets)}건, 신규 수집 필요: {len(need)}건")

    if not need:
        print("  모든 기상 데이터 수집 완료 상태")
    else:
        new_rows = []
        for i, row in enumerate(need):
            result = _fetch_weather(row["위도"], row["경도"], row["date"])
            if result is not None:
                result["위도"] = row["위도"]
                result["경도"] = row["경도"]
                result["date"] = row["date"]
                new_rows.append(result)
            if (i + 1) % 50 == 0:
                print(f"    {i + 1}/{len(need)} 수집 완료")
            time.sleep(0.3)  # rate limit 방지

        if new_rows:
            new_df = pd.DataFrame(new_rows)
            weather_df = pd.concat([weather_df, new_df], ignore_index=True)
            print(f"  신규 수집: {len(new_rows)}건")

    # weather.csv 저장
    weather_df.to_csv(weather_path, index=False)
    print(f"  → {weather_path} 저장 ({len(weather_df)}건)")

    # incidents CSV에 기상 컬럼 병합
    weather_df["위도"] = weather_df["위도"].round(4)
    weather_df["경도"] = weather_df["경도"].round(4)
    weather_cols = [c for c in weather_df.columns if c not in ("위도", "경도", "date")]

    for csv_name in ["incidents_cust.csv", "incidents_emp.csv"]:
        csv_path = OUT / csv_name
        if not csv_path.exists():
            continue
        df = pd.read_csv(csv_path)

        # 기존 기상 컬럼 제거 (재병합)
        drop_cols = [c for c in weather_cols if c in df.columns]
        if drop_cols:
            df = df.drop(columns=drop_cols)

        df["_위도r"] = df["위도"].round(4)
        df["_경도r"] = df["경도"].round(4)
        df["_date"] = pd.to_datetime(df["발생일시"], errors="coerce").dt.strftime(
            "%Y-%m-%d"
        )

        weather_merge = weather_df.rename(
            columns={"위도": "_위도r", "경도": "_경도r", "date": "_date"}
        )
        df = df.merge(weather_merge, on=["_위도r", "_경도r", "_date"], how="left")
        df = df.drop(columns=["_위도r", "_경도r", "_date"])

        df.to_csv(csv_path, index=False)
        print(f"  → {csv_path} 기상 병합 완료 ({len(df)}건, {len(df.columns)}컬럼)")


# ──────────────────────────────────────────────
# Step 4: 핵심 피처만 남기고 정리
# ──────────────────────────────────────────────
def step4_cleanup() -> None:
    """incidents/stores CSV에서 핵심 피처만 남김."""
    print("\n[Step 4] 핵심 피처 정리 시작")

    # ── incidents_cust.csv 정리 ──
    cust_path = OUT / "incidents_cust.csv"
    if cust_path.exists():
        df = pd.read_csv(cust_path)
        keep = []
        for c in TREE_FEATURES + CUST_CASE_COLS + ["source", "위도", "경도"]:
            if c in df.columns and c not in keep:
                keep.append(c)
        df_clean = df[keep].copy()
        df_clean.to_csv(cust_path, index=False)
        print(
            f"  incidents_cust.csv: {df.shape[1]}컬럼 → {df_clean.shape[1]}컬럼 "
            f"({len(df_clean)}건)"
        )

    # ── incidents_emp.csv 정리 ──
    emp_path = OUT / "incidents_emp.csv"
    if emp_path.exists():
        df = pd.read_csv(emp_path)
        keep = []
        for c in TREE_FEATURES + EMP_CASE_COLS + ["source", "위도", "경도"]:
            if c in df.columns and c not in keep:
                keep.append(c)
        df_clean = df[keep].copy()
        df_clean.to_csv(emp_path, index=False)
        print(
            f"  incidents_emp.csv: {df.shape[1]}컬럼 → {df_clean.shape[1]}컬럼 "
            f"({len(df_clean)}건)"
        )

    # ── stores.csv 정리 ──
    stores_path = OUT / "stores.csv"
    if stores_path.exists():
        df = pd.read_csv(stores_path)
        store_keep = [
            "매장", "매장명", "지역", "형태", "폐점여부", "오픈일",
            "평수", "실평수", "창고", "계약면적(㎡)", "진열평수",
            "신주소", "위도", "경도",
            "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
        ]
        keep = [c for c in store_keep if c in df.columns]
        df_clean = df[keep].copy()
        df_clean.to_csv(stores_path, index=False)
        print(
            f"  stores.csv: {df.shape[1]}컬럼 → {df_clean.shape[1]}컬럼 "
            f"({len(df_clean)}건)"
        )

    print("  정리 완료")


# ──────────────────────────────────────────────
# main
# ──────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(
        description="다이소 안전사고 예방 AI — 전처리 파이프라인"
    )
    parser.add_argument(
        "--step",
        type=int,
        choices=[1, 2, 3, 4],
        default=None,
        help="특정 단계만 실행 (1~4). 생략 시 전체 실행.",
    )
    args = parser.parse_args()

    if args.step is None or args.step == 1:
        stores = step1_build_stores()
    else:
        stores = None

    if args.step is None or args.step == 2:
        if stores is None:
            stores_path = OUT / "stores.csv"
            if stores_path.exists():
                stores = pd.read_csv(stores_path)
            else:
                print("[Step 2] stores.csv 없음 → Step 1을 먼저 실행하세요.")
                return
        step2_build_incidents(stores)

    if args.step is None or args.step == 3:
        step3_collect_weather()

    if args.step is None or args.step == 4:
        step4_cleanup()

    print("\n✅ 파이프라인 완료")


if __name__ == "__main__":
    main()

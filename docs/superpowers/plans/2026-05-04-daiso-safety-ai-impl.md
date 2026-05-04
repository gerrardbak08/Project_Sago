# 다이소 매장 안전사고 예방 AI 시스템 — 구현 플랜

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 기상 + 과거 사고 데이터 기반 선제적 안전 알림 시스템 구축 (오프라인 파이프라인 → 서빙 로직 → Lambda → 프론트엔드 → 인프라)

**Architecture:** 오프라인에서 엑셀 데이터를 전처리하여 CSV 생성 후 Decision Tree 학습. 리프 노드별 사고 사례 테이블(JSON)을 구축하고, Lambda에서 순수 Python rule_matcher로 매칭 후 Bedrock LLM으로 안전 가이드 생성. EventBridge cron으로 매일 배치 실행, SES로 이메일 발송.

**Tech Stack:** Python 3.12, pandas, scikit-learn, boto3, Open-Meteo API, 카카오 지오코딩 API, AWS Lambda/API Gateway/S3/SES/EventBridge, Terraform, 바닐라 HTML/CSS/JS

**Spec:** `2026-04-28-daiso-safety-ai-design.md`

**Conda 환경:** `daiso` (`/opt/anaconda3/envs/daiso/bin/python`)

---

## 파일 구조

```
unicorn_gym_v4/
├── data/                              # 원본 엑셀 (git 추적 안 함)
│   └── processed/                     # 전처리 결과 CSV
├── models/
│   ├── cust/                          # CUST Decision Tree 산출물
│   │   ├── leaf_table.json
│   │   ├── metadata.json
│   │   ├── encoder_map.json
│   │   ├── siblings.json
│   │   ├── tree.pkl
│   │   └── encoder.pkl
│   └── emp/                           # EMP Decision Tree 산출물 (동일 구조)
├── scripts/
│   ├── build_dataset.py               # 전처리 파이프라인 (4단계)
│   └── train.py                       # Decision Tree 학습 + 산출물 생성
├── core/
│   ├── __init__.py
│   ├── rule_matcher.py                # 리프 노드 매칭 (순수 Python, sklearn 무의존)
│   ├── weather.py                     # Open-Meteo API 클라이언트
│   ├── risk.py                        # 위험도 산출
│   └── llm.py                         # Bedrock LLM 호출 + Mock
├── lambdas/
│   ├── simulate/handler.py            # POST /api/simulate
│   └── batch/handler.py               # EventBridge 배치 오케스트레이터
├── frontend/
│   ├── index.html                     # 메인 UI (2탭: 모니터링 + 수동 알림)
│   ├── css/style.css
│   └── js/app.js
├── infra/
│   └── main.tf                        # Terraform
├── local_server.py                    # 로컬 개발 서버
├── tests/
│   ├── test_build_dataset.py
│   ├── test_train.py
│   ├── test_rule_matcher.py
│   ├── test_weather.py
│   ├── test_risk.py
│   ├── test_llm.py
│   └── test_simulate.py
└── requirements.txt
```

---

## Task 1: 프로젝트 초기 설정 (requirements.txt + 디렉토리 구조)

**Files:**
- Create: `requirements.txt`
- Create: `core/__init__.py`
- Create: `scripts/__init__.py` (없어도 되지만 import 편의)
- Create: `models/cust/.gitkeep`
- Create: `models/emp/.gitkeep`
- Create: `lambdas/simulate/__init__.py`
- Create: `lambdas/batch/__init__.py`
- Create: `tests/__init__.py`

- [ ] **Step 1: requirements.txt 생성**

```
pandas>=2.0
openpyxl>=3.1
scikit-learn>=1.4
requests>=2.31
boto3>=1.34
```

- [ ] **Step 2: 디렉토리 구조 생성**

빈 `__init__.py` 파일과 `.gitkeep` 파일을 생성하여 디렉토리 구조를 확보한다.

```python
# core/__init__.py
# Core modules for Daiso Safety AI
```

```python
# scripts/__init__.py
```

```python
# lambdas/simulate/__init__.py
```

```python
# lambdas/batch/__init__.py
```

```python
# tests/__init__.py
```

`models/cust/.gitkeep`, `models/emp/.gitkeep` — 빈 파일.

- [ ] **Step 3: conda 환경에 패키지 설치**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/pip install -r requirements.txt
```

- [ ] **Step 4: Commit**

```bash
git add requirements.txt core/ scripts/ lambdas/ tests/ models/
git commit -m "chore: 프로젝트 초기 설정 — requirements.txt + 디렉토리 구조"
```

---

## Task 2: build_dataset.py — Step 1: 매장 지오코딩 + 인원현황/매출 통합

**Files:**
- Create: `scripts/build_dataset.py`

이 태스크에서는 build_dataset.py의 Step 1만 구현한다. 매장리스트 엑셀에서 stores.csv를 생성하고, 인원현황/매출 데이터를 조인한다.

- [ ] **Step 1: build_dataset.py 기본 구조 + Step 1 함수 작성**

```python
"""
build_dataset.py — 다이소 안전사고 AI 전처리 파이프라인

4단계:
  Step 1: 매장 지오코딩 + 인원현황/매출 통합 → stores.csv
  Step 2: 사고 데이터 정제 + 매장 매칭 → incidents_cust.csv, incidents_emp.csv
  Step 3: 기상 데이터 수집 → incidents CSV에 기상 컬럼 추가
  Step 4: 핵심 피처만 남기고 정리

사용법:
  python scripts/build_dataset.py          # 전체 파이프라인
  python scripts/build_dataset.py --step 1 # Step 1만 실행
"""

import os
import sys
import time
import argparse
import requests
import pandas as pd
import numpy as np
from pathlib import Path

# 프로젝트 루트
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
PROCESSED_DIR.mkdir(parents=True, exist_ok=True)

# ─── 핵심 피처 정의 ───

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
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]

STORE_CAT_FEATURES = ["형태"]

TREE_FEATURES = WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES

# CUST 사고 사례 표시용 컬럼 (트리 피처 외에 leaf_table.json에 저장할 컬럼)
CUST_CASE_COLS = [
    "매장", "매장명", "지역", "발생일시", "사고유형", "장소",
    "원인1", "원인2", "원인3", "사고내용요약",
]

# EMP 사고 사례 표시용 컬럼
EMP_CASE_COLS = [
    "매장", "매장명", "지역", "발생일시", "재해 종류", "재해 유형",
    "기인물", "상병명", "사고 내용",
]

# CUST 오타 정제 매핑
CUST_TYPE_FIX = {
    "중돌": "충돌",
    "낙성": "낙상",
    "추락": "낙상",
}


# ═══════════════════════════════════════════
# Step 1: 매장 지오코딩 + 인원현황/매출 통합
# ═══════════════════════════════════════════

def geocode_address(address: str, api_key: str) -> tuple[float | None, float | None]:
    """카카오 지오코딩 API로 주소 → 위도/경도 변환."""
    url = "https://dapi.kakao.com/v2/local/search/address.json"
    headers = {"Authorization": f"KakaoAK {api_key}"}
    params = {"query": address}
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=5)
        resp.raise_for_status()
        docs = resp.json().get("documents", [])
        if docs:
            return float(docs[0]["y"]), float(docs[0]["x"])
    except Exception as e:
        print(f"  [WARN] 지오코딩 실패: {address} → {e}")
    return None, None


def load_staff_direct() -> pd.DataFrame:
    """직영점_인원현황DB.xlsx → 매장별 인원 데이터.

    엑셀 구조 (row 0: 그룹 헤더, row 1: 컬럼 헤더):
      조직코드 | 조직명 | 오픈일 | 실평수 | 매장등급 | 목표 | 실적 | 달성률 |
      전년동월 | 신장률 | TO | 합산 PO | GAP | 입고도우미PO | 매장 PO | 정규 | 임시 | 파트

    매장 행: 조직코드가 5자리 숫자이고 50000이 아닌 행.
    """
    path = DATA_DIR / "직영점_인원현황DB.xlsx"
    df = pd.read_excel(path, sheet_name="직영점", header=None, skiprows=2)
    df.columns = [
        "조직코드", "조직명", "오픈일", "실평수", "매장등급",
        "목표", "실적", "달성률", "전년동월", "신장률",
        "TO", "합산PO", "GAP", "입고도우미PO", "매장PO",
        "정규", "임시", "파트",
    ]
    # 매장 행만 필터 (5자리 숫자, 50000 제외)
    df["조직코드"] = df["조직코드"].astype(str).str.strip()
    df = df[df["조직코드"].str.match(r"^\d{5}$")]
    df = df[df["조직코드"] != "50000"]
    # 부서/팀 집계 행 제외 (57xxx)
    df = df[~df["조직코드"].str.startswith("57")]
    df["매장"] = df["조직코드"].astype(int)
    # 필요 컬럼만
    df["매장인원"] = pd.to_numeric(df["합산PO"], errors="coerce")
    df["입고도우미PO"] = pd.to_numeric(df["입고도우미PO"], errors="coerce")
    return df[["매장", "매장인원", "입고도우미PO"]].copy()


def load_staff_franchise() -> pd.DataFrame:
    """유통점_인원현황DB.xlsx → 매장별 인원 데이터.

    엑셀 구조 (row 0: 그룹 헤더, row 1: 컬럼 헤더, row 2: 정규 연차별 서브헤더):
      조직코드 | 조직명 | 조직형태 | 매장구분 | 오픈일 | 평수 | 거래선 | 단품관리 |
      TO | 합산 PO | GAP | 입고도우미PO | 매장 PO |
      정규 연차별(4년미만|4~6|6~8|8~10|10+|정규계) | 임시 | 파트

    매장 행: 조직코드가 5자리 숫자이고 50000이 아닌 행, 57xxx(부서/팀) 제외.
    """
    path = DATA_DIR / "유통점_인원현황DB.xlsx"
    df = pd.read_excel(path, sheet_name="유통점", header=None, skiprows=3)
    # 21개 컬럼
    df.columns = [
        "조직코드", "조직명", "조직형태", "매장구분", "오픈일", "평수", "거래선", "단품관리",
        "TO", "합산PO", "GAP", "입고도우미PO", "매장PO",
        "정규_4년미만", "정규_4_6", "정규_6_8", "정규_8_10", "정규_10이상", "정규계",
        "임시", "파트",
    ]
    df["조직코드"] = df["조직코드"].astype(str).str.strip()
    df = df[df["조직코드"].str.match(r"^\d{5}$")]
    df = df[df["조직코드"] != "50000"]
    df = df[~df["조직코드"].str.startswith("57")]
    df["매장"] = df["조직코드"].astype(int)
    df["매장인원"] = pd.to_numeric(df["합산PO"], errors="coerce")
    df["입고도우미PO"] = pd.to_numeric(df["입고도우미PO"], errors="coerce")
    return df[["매장", "매장인원", "입고도우미PO"]].copy()


def load_daily_sales() -> pd.DataFrame:
    """직영점_일매출_평균.xlsx → 매장별 일평균매출, 일평균물동량.

    엑셀 구조 (row 0: 헤더):
      no. | 코드 | 매장 | 지역 | 구분 | 누적실적 | 일수 | 일평균 | 배송일자 | 배송 박스 수(추정)

    일평균 = 누적실적 / 일수 (엑셀 수식이므로 openpyxl data_only로 읽거나 직접 계산)
    배송 박스 수 = ROUND(0.00002 * (6/배송일자) * 일평균, 0) (엑셀 수식)
    """
    path = DATA_DIR / "직영점_일매출_평균.xlsx"
    df = pd.read_excel(path, sheet_name="raw", header=0)
    df.columns = [
        "no", "코드", "매장명", "지역", "구분",
        "누적실적", "일수", "일평균", "배송일자", "배송박스수",
    ]
    df["매장"] = pd.to_numeric(df["코드"], errors="coerce")
    df = df.dropna(subset=["매장"])
    df["매장"] = df["매장"].astype(int)
    # 일평균 계산 (엑셀 수식이 값으로 안 읽힐 수 있으므로 직접 계산)
    df["일평균매출"] = pd.to_numeric(df["누적실적"], errors="coerce") / pd.to_numeric(df["일수"], errors="coerce")
    # 배송 박스 수 계산
    배송일자 = pd.to_numeric(df["배송일자"], errors="coerce")
    df["일평균물동량"] = np.where(
        배송일자 > 0,
        np.round(0.00002 * (6 / 배송일자) * df["일평균매출"], 0),
        0,
    )
    return df[["매장", "일평균매출", "일평균물동량"]].copy()


def step1_build_stores() -> pd.DataFrame:
    """Step 1: 매장리스트 + 지오코딩 + 인원현황 + 매출 → stores.csv"""
    print("=" * 60)
    print("Step 1: 매장 지오코딩 + 인원현황/매출 통합")
    print("=" * 60)

    stores_path = PROCESSED_DIR / "stores.csv"

    # 1-1. 매장리스트 로드
    raw = pd.read_excel(DATA_DIR / "매장리스트_260408.xlsx")
    print(f"  매장리스트 로드: {len(raw)}건")

    # 기존 stores.csv가 있으면 증분 처리
    if stores_path.exists():
        existing = pd.read_csv(stores_path)
        print(f"  기존 stores.csv 로드: {len(existing)}건")
        # 위경도가 이미 있는 매장은 스킵
        geocoded_stores = set(existing.loc[existing["위도"].notna(), "매장"].values)
    else:
        existing = None
        geocoded_stores = set()

    # 1-2. 지오코딩
    api_key = os.environ.get("KAKAO_REST_API_KEY", "")
    if not api_key:
        print("  [WARN] KAKAO_REST_API_KEY 미설정 — 지오코딩 스킵")

    stores = raw.copy()
    stores["위도"] = np.nan
    stores["경도"] = np.nan

    # 기존 데이터에서 위경도 복원
    if existing is not None:
        coord_map = existing.set_index("매장")[["위도", "경도"]].to_dict("index")
        for idx, row in stores.iterrows():
            code = row["매장"]
            if code in coord_map:
                stores.at[idx, "위도"] = coord_map[code]["위도"]
                stores.at[idx, "경도"] = coord_map[code]["경도"]

    # 새로 지오코딩할 매장
    if api_key:
        need_geocode = stores[stores["위도"].isna() & stores["신주소"].notna()]
        print(f"  지오코딩 대상: {len(need_geocode)}건")
        for idx, row in need_geocode.iterrows():
            lat, lng = geocode_address(row["신주소"], api_key)
            if lat is not None:
                stores.at[idx, "위도"] = lat
                stores.at[idx, "경도"] = lng
            time.sleep(0.1)  # API rate limit

    # 1-3. 인원현황 조인
    print("  인원현황 데이터 로드...")
    staff_direct = load_staff_direct()
    staff_franchise = load_staff_franchise()
    staff = pd.concat([staff_direct, staff_franchise], ignore_index=True)
    staff = staff.drop_duplicates(subset=["매장"], keep="first")
    print(f"  인원현황: 직영 {len(staff_direct)}건 + 유통 {len(staff_franchise)}건 = {len(staff)}건")

    stores = stores.merge(staff, on="매장", how="left")

    # 1-4. 일매출 조인
    print("  일매출 데이터 로드...")
    sales = load_daily_sales()
    print(f"  일매출: {len(sales)}건 (직영점만)")
    stores = stores.merge(sales, on="매장", how="left")

    # 1-5. 저장
    stores.to_csv(stores_path, index=False)
    print(f"  stores.csv 저장: {len(stores)}건")
    print(f"  위경도 확보율: {stores['위도'].notna().mean():.1%}")
    print(f"  매장인원 확보율: {stores['매장인원'].notna().mean():.1%}")
    print(f"  일평균매출 확보율: {stores['일평균매출'].notna().mean():.1%}")

    return stores
```

- [ ] **Step 2: 실행 테스트 (Step 1만)**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/python scripts/build_dataset.py --step 1
```

Expected: stores.csv 생성, 인원현황/매출 컬럼 포함 확인.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_dataset.py
git commit -m "feat: build_dataset.py Step 1 — 매장 지오코딩 + 인원현황/매출 통합"
```

---

## Task 3: build_dataset.py — Step 2: 사고 데이터 정제 + 매장 매칭

**Files:**
- Modify: `scripts/build_dataset.py`

- [ ] **Step 1: step2_build_incidents 함수 추가**

`scripts/build_dataset.py`에 아래 함수를 추가한다.

```python
# ═══════════════════════════════════════════
# Step 2: 사고 데이터 정제 + 매장 매칭
# ═══════════════════════════════════════════

def step2_build_incidents(stores: pd.DataFrame | None = None):
    """Step 2: 사고 엑셀 → 매장 매칭 → incidents CSV 생성."""
    print("=" * 60)
    print("Step 2: 사고 데이터 정제 + 매장 매칭")
    print("=" * 60)

    if stores is None:
        stores = pd.read_csv(PROCESSED_DIR / "stores.csv")

    # 매장 정보 (조인용)
    store_info_cols = [
        "매장", "매장명", "지역", "형태", "평수", "실평수", "창고",
        "계약면적(㎡)", "진열평수", "위도", "경도",
        "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
    ]
    store_info = stores[[c for c in store_info_cols if c in stores.columns]].copy()

    # ── CUST (고객사고) ──
    print("  고객사고DB 로드...")
    cust = pd.read_excel(DATA_DIR / "고객사고DB.xlsx")
    print(f"  원본: {len(cust)}건")

    # 사고유형 공백 제거 + 오타 정제
    cust["사고유형"] = cust["사고유형"].astype(str).str.strip()
    cust["사고유형"] = cust["사고유형"].replace(CUST_TYPE_FIX)

    # 매장 매칭 (매장명 기준)
    cust = cust.merge(store_info, left_on="매장명", right_on="매장명", how="left")
    # 위경도 없는 건 제거
    before = len(cust)
    cust = cust.dropna(subset=["위도"])
    print(f"  매장 매칭 후: {len(cust)}건 (위경도 없어 {before - len(cust)}건 제거)")

    cust["source"] = "cust"
    cust.to_csv(PROCESSED_DIR / "incidents_cust.csv", index=False)
    print(f"  incidents_cust.csv 저장: {len(cust)}건")

    # ── EMP (직원사고) ──
    print("  직원사고DB 로드...")
    emp = pd.read_excel(DATA_DIR / "직원사고DB.xlsx")
    print(f"  원본: {len(emp)}건")

    # 매장 매칭 (매장명 기준)
    emp = emp.merge(store_info, left_on="매장명", right_on="매장명", how="left")
    before = len(emp)
    emp = emp.dropna(subset=["위도"])
    print(f"  매장 매칭 후: {len(emp)}건 (위경도 없어 {before - len(emp)}건 제거)")

    emp["source"] = "emp"
    emp.to_csv(PROCESSED_DIR / "incidents_emp.csv", index=False)
    print(f"  incidents_emp.csv 저장: {len(emp)}건")

    return cust, emp
```

- [ ] **Step 2: 실행 테스트 (Step 2만)**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/python scripts/build_dataset.py --step 2
```

Expected: incidents_cust.csv, incidents_emp.csv 생성. 매장인원/입고도우미PO/일평균매출/일평균물동량 컬럼 포함.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_dataset.py
git commit -m "feat: build_dataset.py Step 2 — 사고 데이터 정제 + 매장 매칭"
```

---

## Task 4: build_dataset.py — Step 3: 기상 데이터 수집

**Files:**
- Modify: `scripts/build_dataset.py`

- [ ] **Step 1: step3_collect_weather 함수 추가**

```python
# ═══════════════════════════════════════════
# Step 3: 기상 데이터 수집
# ═══════════════════════════════════════════

OPEN_METEO_DAILY_PARAMS = [
    "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "rain_sum", "snowfall_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]


def fetch_weather(lat: float, lon: float, date: str, retries: int = 3) -> dict | None:
    """Open-Meteo Historical API로 특정 날짜의 기상 데이터 조회.

    Args:
        lat: 위도
        lon: 경도
        date: 날짜 (YYYY-MM-DD)
        retries: 429 응답 시 재시도 횟수

    Returns:
        기상 데이터 dict 또는 None (실패 시)
    """
    url = "https://archive-api.open-meteo.com/v1/archive"
    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": date,
        "end_date": date,
        "daily": ",".join(OPEN_METEO_DAILY_PARAMS),
        "timezone": "Asia/Seoul",
    }
    for attempt in range(retries):
        try:
            resp = requests.get(url, params=params, timeout=10)
            if resp.status_code == 429:
                wait = 2 ** attempt
                print(f"    [429] Rate limited, waiting {wait}s...")
                time.sleep(wait)
                continue
            resp.raise_for_status()
            data = resp.json()
            daily = data.get("daily", {})
            result = {}
            for param in OPEN_METEO_DAILY_PARAMS:
                values = daily.get(param, [None])
                result[param] = values[0] if values else None
            return result
        except Exception as e:
            if attempt < retries - 1:
                time.sleep(2 ** attempt)
            else:
                print(f"    [ERR] 기상 조회 실패: ({lat},{lon},{date}) → {e}")
    return None


def step3_collect_weather():
    """Step 3: incidents CSV에 기상 데이터 추가."""
    print("=" * 60)
    print("Step 3: 기상 데이터 수집")
    print("=" * 60)

    for source in ["cust", "emp"]:
        path = PROCESSED_DIR / f"incidents_{source}.csv"
        df = pd.read_csv(path)
        print(f"  [{source.upper()}] {len(df)}건 로드")

        # 이미 기상 데이터가 있는 행 스킵
        has_weather = df["temperature_2m_max"].notna() if "temperature_2m_max" in df.columns else pd.Series([False] * len(df))
        need_weather = df[~has_weather]
        print(f"  기상 수집 대상: {len(need_weather)}건 (이미 수집: {has_weather.sum()}건)")

        if len(need_weather) == 0:
            print(f"  [{source.upper()}] 모든 건에 기상 데이터 있음 — 스킵")
            continue

        # 기상 컬럼 초기화 (없으면)
        for col in OPEN_METEO_DAILY_PARAMS:
            if col not in df.columns:
                df[col] = np.nan

        # 발생일시에서 날짜 추출
        date_col = "발생일시"
        df["_date"] = pd.to_datetime(df[date_col], errors="coerce").dt.strftime("%Y-%m-%d")

        # (위도, 경도, 날짜) 유니크 조합별로 한 번만 호출
        unique_keys = df.loc[~has_weather, ["위도", "경도", "_date"]].drop_duplicates()
        print(f"  유니크 (위도,경도,날짜) 조합: {len(unique_keys)}건")

        weather_cache = {}
        for i, (_, row) in enumerate(unique_keys.iterrows()):
            key = (row["위도"], row["경도"], row["_date"])
            if pd.isna(key[0]) or pd.isna(key[2]):
                continue
            result = fetch_weather(key[0], key[1], key[2])
            if result:
                weather_cache[key] = result
            if (i + 1) % 50 == 0:
                print(f"    진행: {i+1}/{len(unique_keys)}")
            time.sleep(0.3)  # rate limit 방지

        # 캐시 결과를 DataFrame에 반영
        for idx in df.index:
            if has_weather.get(idx, False):
                continue
            key = (df.at[idx, "위도"], df.at[idx, "경도"], df.at[idx, "_date"])
            if key in weather_cache:
                for col, val in weather_cache[key].items():
                    df.at[idx, col] = val

        df = df.drop(columns=["_date"])
        df.to_csv(path, index=False)
        filled = df["temperature_2m_max"].notna().sum()
        print(f"  [{source.upper()}] 기상 데이터 확보율: {filled}/{len(df)} ({filled/len(df):.1%})")
```

- [ ] **Step 2: 실행 테스트 (Step 3만)**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/python scripts/build_dataset.py --step 3
```

Expected: incidents CSV에 기상 8개 컬럼 추가. 이미 수집된 건은 스킵.

주의: Open-Meteo API 호출이 많으므로 시간이 걸릴 수 있음. 기존 processed CSV에 이미 기상 데이터가 있으면 대부분 스킵됨.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_dataset.py
git commit -m "feat: build_dataset.py Step 3 — 기상 데이터 수집 (Open-Meteo)"
```

---

## Task 5: build_dataset.py — Step 4: 핵심 피처만 남기고 정리 + main 함수

**Files:**
- Modify: `scripts/build_dataset.py`

- [ ] **Step 1: step4_cleanup + main 함수 추가**

```python
# ═══════════════════════════════════════════
# Step 4: 핵심 피처만 남기고 정리
# ═══════════════════════════════════════════

def step4_cleanup():
    """Step 4: 최종 CSV에서 핵심 피처 + 사례 표시용 컬럼만 남김."""
    print("=" * 60)
    print("Step 4: 핵심 피처만 남기고 정리")
    print("=" * 60)

    for source, case_cols, label_col in [
        ("cust", CUST_CASE_COLS, "사고유형"),
        ("emp", EMP_CASE_COLS, "재해 유형"),
    ]:
        path = PROCESSED_DIR / f"incidents_{source}.csv"
        df = pd.read_csv(path)
        print(f"  [{source.upper()}] 원본 컬럼 수: {len(df.columns)}")

        # 유지할 컬럼: 트리 피처 + 라벨 + 사례 표시용 + source + 위경도
        keep_cols = list(set(
            TREE_FEATURES + [label_col] + case_cols + ["source", "위도", "경도"]
        ))
        # 실제 존재하는 컬럼만
        keep_cols = [c for c in keep_cols if c in df.columns]

        df = df[keep_cols]
        df.to_csv(path, index=False)
        print(f"  [{source.upper()}] 정리 후 컬럼 수: {len(df.columns)}")
        print(f"  [{source.upper()}] 행 수: {len(df)}")

    # stores.csv도 정리
    stores_path = PROCESSED_DIR / "stores.csv"
    stores = pd.read_csv(stores_path)
    store_keep = [
        "매장", "매장명", "지역", "형태", "폐점여부", "구분", "오픈일",
        "평수", "실평수", "창고", "계약면적(㎡)", "진열평수",
        "신주소", "위도", "경도",
        "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
    ]
    store_keep = [c for c in store_keep if c in stores.columns]
    stores = stores[store_keep]
    stores.to_csv(stores_path, index=False)
    print(f"  stores.csv 정리 후 컬럼 수: {len(stores.columns)}")


# ═══════════════════════════════════════════
# Main
# ═══════════════════════════════════════════

def main():
    parser = argparse.ArgumentParser(description="다이소 안전사고 AI 전처리 파이프라인")
    parser.add_argument("--step", type=int, choices=[1, 2, 3, 4], help="특정 단계만 실행")
    args = parser.parse_args()

    if args.step is None or args.step == 1:
        stores = step1_build_stores()
    else:
        stores = None

    if args.step is None or args.step == 2:
        step2_build_incidents(stores)

    if args.step is None or args.step == 3:
        step3_collect_weather()

    if args.step is None or args.step == 4:
        step4_cleanup()

    print("\n✅ 전처리 완료!")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Step 4 단독 실행 테스트**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/python scripts/build_dataset.py --step 4
```

Expected: incidents CSV 컬럼 수가 줄어들고, 핵심 피처 + 사례 표시용 컬럼만 남음.

- [ ] **Step 3: Commit**

```bash
git add scripts/build_dataset.py
git commit -m "feat: build_dataset.py Step 4 + main — 핵심 피처 정리 + CLI 완성"
```

---

## Task 6: train.py — Decision Tree 학습 + 산출물 생성

**Files:**
- Create: `scripts/train.py`

- [ ] **Step 1: train.py 작성**

```python
"""
train.py — Decision Tree 학습 + 리프 노드 사고 사례 테이블 생성

사용법:
  python scripts/train.py                # CUST + EMP 모두 학습
  python scripts/train.py --source cust  # CUST만 학습

산출물 (models/{cust,emp}/):
  - leaf_table.json: 리프별 규칙 + 사고 통계 + 사례 리스트
  - metadata.json: 피처명, 총 사고 건수, 리프 통계
  - encoder_map.json: 범주형 피처 인코딩 매핑
  - siblings.json: 부모 노드 롤업용 형제 리프 매핑
  - tree.pkl: 학습된 트리 (평가용)
  - encoder.pkl: 인코더 (평가용)
"""

import json
import pickle
import argparse
import numpy as np
import pandas as pd
from pathlib import Path
from sklearn.tree import DecisionTreeClassifier
from sklearn.preprocessing import OrdinalEncoder

# build_dataset.py에서 피처 정의 재사용
import sys
sys.path.insert(0, str(Path(__file__).resolve().parent))
from build_dataset import (
    WEATHER_FEATURES, STORE_NUM_FEATURES, STORE_CAT_FEATURES,
    TREE_FEATURES, CUST_CASE_COLS, EMP_CASE_COLS,
)

ROOT = Path(__file__).resolve().parent.parent
PROCESSED_DIR = ROOT / "data" / "processed"
MODELS_DIR = ROOT / "models"

# 하이퍼파라미터
TREE_PARAMS = dict(
    max_depth=5,
    min_samples_leaf=5,
    min_impurity_decrease=0.01,
    class_weight="balanced",
    criterion="gini",
    random_state=42,
)

# 범주형 인코딩 순서
STORE_TYPE_ORDER = ["유통점", "유통행사", "직영점"]


def extract_rules(tree, feature_names: list[str]) -> dict[int, str]:
    """트리의 각 리프 노드에 도달하는 규칙을 추출한다.

    Returns:
        {leaf_id: "feature < threshold & feature >= threshold & ..."}
    """
    tree_ = tree.tree_
    feature_name = [
        feature_names[i] if i != -2 else "undefined"
        for i in tree_.feature
    ]

    rules = {}

    def recurse(node_id, rule_parts):
        # 리프 노드
        if tree_.children_left[node_id] == tree_.children_right[node_id]:
            rules[node_id] = " & ".join(rule_parts) if rule_parts else "전체"
            return

        name = feature_name[node_id]
        threshold = tree_.threshold[node_id]

        # 왼쪽: feature <= threshold
        recurse(
            tree_.children_left[node_id],
            rule_parts + [f"{name} <= {threshold:.2f}"],
        )
        # 오른쪽: feature > threshold
        recurse(
            tree_.children_right[node_id],
            rule_parts + [f"{name} > {threshold:.2f}"],
        )

    recurse(0, [])
    return rules


def build_siblings(tree) -> dict[str, list[int]]:
    """부모 노드별 자식 리프 노드 매핑 (Fallback Level 1용).

    Returns:
        {"parent_node_id": [leaf_id_1, leaf_id_2, ...]}
    """
    tree_ = tree.tree_
    siblings = {}

    def recurse(node_id):
        left = tree_.children_left[node_id]
        right = tree_.children_right[node_id]

        if left == right:  # 리프
            return [node_id]

        left_leaves = recurse(left)
        right_leaves = recurse(right)
        all_leaves = left_leaves + right_leaves

        siblings[str(node_id)] = all_leaves
        return all_leaves

    recurse(0)
    return siblings


def train_single(source: str):
    """단일 소스(cust/emp) Decision Tree 학습."""
    print(f"\n{'='*60}")
    print(f"Training: {source.upper()}")
    print(f"{'='*60}")

    # 데이터 로드
    df = pd.read_csv(PROCESSED_DIR / f"incidents_{source}.csv")
    print(f"  데이터: {len(df)}건")

    # 라벨
    label_col = "사고유형" if source == "cust" else "재해 유형"
    case_cols = CUST_CASE_COLS if source == "cust" else EMP_CASE_COLS

    # 피처 준비
    feature_cols = [c for c in TREE_FEATURES if c in df.columns]
    X = df[feature_cols].copy()
    y = df[label_col].copy()

    # 범주형 인코딩
    encoder = OrdinalEncoder(
        categories=[STORE_TYPE_ORDER],
        handle_unknown="use_encoded_value",
        unknown_value=-1,
    )
    if "형태" in X.columns:
        X["형태"] = encoder.fit_transform(X[["형태"]])

    # 결측치 처리
    for col in WEATHER_FEATURES:
        if col in X.columns:
            if col in ["precipitation_sum", "snowfall_sum", "rain_sum"]:
                X[col] = X[col].fillna(0)
            else:
                X[col] = X[col].ffill().bfill().fillna(0)

    for col in STORE_NUM_FEATURES:
        if col in X.columns:
            X[col] = X[col].fillna(X[col].median())

    # NaN이 남아있으면 0으로
    X = X.fillna(0)

    print(f"  피처: {len(feature_cols)}개 — {feature_cols}")
    print(f"  라벨 분포:\n{y.value_counts().to_string()}")

    # 학습
    tree = DecisionTreeClassifier(**TREE_PARAMS)
    tree.fit(X, y)

    leaf_ids = tree.apply(X)
    n_leaves = tree.get_n_leaves()
    print(f"  리프 수: {n_leaves}")
    print(f"  트리 깊이: {tree.get_depth()}")

    # 리프별 사례 수 분포
    unique_leaves, leaf_counts = np.unique(leaf_ids, return_counts=True)
    print(f"  리프별 사례 수: min={leaf_counts.min()}, max={leaf_counts.max()}, "
          f"mean={leaf_counts.mean():.1f}, median={np.median(leaf_counts):.1f}")

    # ── 산출물 생성 ──
    out_dir = MODELS_DIR / source
    out_dir.mkdir(parents=True, exist_ok=True)

    # 1. leaf_table.json
    rules = extract_rules(tree, feature_cols)
    leaf_table = {}
    for leaf_id in unique_leaves:
        mask = leaf_ids == leaf_id
        leaf_df = df[mask]

        # 사고유형 분포
        type_dist = leaf_df[label_col].value_counts().to_dict()

        # 사고 사례 리스트
        incidents = []
        available_case_cols = [c for c in case_cols if c in leaf_df.columns]
        available_weather = [c for c in WEATHER_FEATURES if c in leaf_df.columns]
        available_store = [c for c in STORE_NUM_FEATURES + STORE_CAT_FEATURES if c in leaf_df.columns]
        all_case_fields = available_case_cols + available_weather + available_store

        for _, row in leaf_df.iterrows():
            case = {}
            for col in all_case_fields:
                val = row[col]
                if pd.isna(val):
                    case[col] = None
                elif isinstance(val, (np.integer,)):
                    case[col] = int(val)
                elif isinstance(val, (np.floating,)):
                    case[col] = float(val)
                else:
                    case[col] = val
                    
            incidents.append(case)

        # 원인/장소 분포 (CUST만)
        summary = {
            "total": int(mask.sum()),
            label_col: type_dist,
        }
        if source == "cust":
            if "원인1" in leaf_df.columns:
                summary["원인1"] = leaf_df["원인1"].value_counts().head(5).to_dict()
            if "장소" in leaf_df.columns:
                summary["장소"] = leaf_df["장소"].value_counts().head(5).to_dict()
        elif source == "emp":
            if "기인물" in leaf_df.columns:
                summary["기인물"] = leaf_df["기인물"].value_counts().head(5).to_dict()

        leaf_table[str(leaf_id)] = {
            "leaf_id": int(leaf_id),
            "source": source,
            "rule": rules.get(leaf_id, ""),
            "summary": summary,
            "incidents": incidents,
        }

    with open(out_dir / "leaf_table.json", "w", encoding="utf-8") as f:
        json.dump(leaf_table, f, ensure_ascii=False, indent=2)
    print(f"  leaf_table.json 저장: {len(leaf_table)} 리프")

    # 2. metadata.json
    metadata = {
        "source": source,
        "feature_names": feature_cols,
        "label_col": label_col,
        "total_incidents": len(df),
        "n_leaves": n_leaves,
        "tree_depth": tree.get_depth(),
        "tree_params": TREE_PARAMS,
        "leaf_sizes": {str(lid): int(cnt) for lid, cnt in zip(unique_leaves, leaf_counts)},
        "label_distribution": y.value_counts().to_dict(),
    }
    with open(out_dir / "metadata.json", "w", encoding="utf-8") as f:
        json.dump(metadata, f, ensure_ascii=False, indent=2)
    print(f"  metadata.json 저장")

    # 3. encoder_map.json
    encoder_map = {
        "형태": {cat: int(i) for i, cat in enumerate(STORE_TYPE_ORDER)},
    }
    with open(out_dir / "encoder_map.json", "w", encoding="utf-8") as f:
        json.dump(encoder_map, f, ensure_ascii=False, indent=2)
    print(f"  encoder_map.json 저장")

    # 4. siblings.json
    sibs = build_siblings(tree)
    with open(out_dir / "siblings.json", "w", encoding="utf-8") as f:
        json.dump(sibs, f, ensure_ascii=False, indent=2)
    print(f"  siblings.json 저장: {len(sibs)} 내부 노드")

    # 5. tree.pkl, encoder.pkl (평가용)
    with open(out_dir / "tree.pkl", "wb") as f:
        pickle.dump(tree, f)
    with open(out_dir / "encoder.pkl", "wb") as f:
        pickle.dump(encoder, f)
    print(f"  tree.pkl, encoder.pkl 저장")

    return tree, leaf_table


def main():
    parser = argparse.ArgumentParser(description="Decision Tree 학습")
    parser.add_argument("--source", choices=["cust", "emp"], help="특정 소스만 학습")
    args = parser.parse_args()

    sources = [args.source] if args.source else ["cust", "emp"]
    for source in sources:
        train_single(source)

    print("\n✅ 학습 완료!")


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: 실행 테스트**

Run:
```bash
/opt/anaconda3/envs/daiso/bin/python scripts/train.py
```

Expected:
- `models/cust/` 와 `models/emp/` 에 leaf_table.json, metadata.json, encoder_map.json, siblings.json, tree.pkl, encoder.pkl 생성
- 리프 노드 최소 사례 수 ≥ 5
- 트리 깊이 ≤ 5

- [ ] **Step 3: Commit**

```bash
git add scripts/train.py
git commit -m "feat: train.py — Decision Tree 학습 + 리프 노드 사고 사례 테이블 생성"
```

---

## Task 7: core/rule_matcher.py — 순수 Python 리프 노드 매칭

**Files:**
- Create: `core/rule_matcher.py`

rule_matcher는 Lambda에서 sklearn 없이 동작해야 한다. leaf_table.json의 규칙 문자열을 파싱하여 입력 피처와 매칭한다.

- [ ] **Step 1: rule_matcher.py 작성**

```python
"""
rule_matcher.py — 순수 Python 리프 노드 매칭

sklearn 의존성 없이 leaf_table.json의 규칙 문자열을 파싱하여
입력 피처 벡터가 어떤 리프에 해당하는지 매칭한다.

규칙 형식: "feature <= threshold & feature > threshold & ..."
"""

import json
import re
from pathlib import Path
from typing import Any


def parse_rule(rule_str: str) -> list[tuple[str, str, float]]:
    """규칙 문자열을 (feature, operator, threshold) 튜플 리스트로 파싱.

    예: "temperature_2m_min <= -0.50 & 평수 > 100.00"
    → [("temperature_2m_min", "<=", -0.5), ("평수", ">", 100.0)]
    """
    if not rule_str or rule_str == "전체":
        return []

    conditions = []
    parts = rule_str.split(" & ")
    for part in parts:
        # "feature <= 1.23" 또는 "feature > -4.56"
        match = re.match(r"^(.+?)\s*(<=|>=|<|>)\s*(-?[\d.]+)$", part.strip())
        if match:
            feature = match.group(1).strip()
            op = match.group(2)
            threshold = float(match.group(3))
            conditions.append((feature, op, threshold))
    return conditions


def evaluate_condition(value: float, op: str, threshold: float) -> bool:
    """단일 조건 평가."""
    if value is None:
        return False
    if op == "<=":
        return value <= threshold
    elif op == ">":
        return value > threshold
    elif op == "<":
        return value < threshold
    elif op == ">=":
        return value >= threshold
    return False


def match_leaf(
    features: dict[str, float],
    leaf_table: dict[str, dict],
) -> tuple[str | None, dict | None]:
    """입력 피처를 leaf_table의 모든 리프 규칙과 매칭.

    Args:
        features: {"feature_name": value, ...}
        leaf_table: leaf_table.json 내용

    Returns:
        (leaf_id, leaf_data) 또는 (None, None)
    """
    best_leaf_id = None
    best_leaf_data = None
    best_conditions = -1

    for leaf_id, leaf_data in leaf_table.items():
        rule_str = leaf_data.get("rule", "")
        conditions = parse_rule(rule_str)

        # 모든 조건을 만족하는지 확인
        all_match = True
        for feature, op, threshold in conditions:
            value = features.get(feature)
            if value is None or not evaluate_condition(float(value), op, threshold):
                all_match = False
                break

        if all_match:
            # 조건이 더 많은 (더 구체적인) 리프를 우선
            if len(conditions) > best_conditions:
                best_conditions = len(conditions)
                best_leaf_id = leaf_id
                best_leaf_data = leaf_data

    return best_leaf_id, best_leaf_data


def match_with_fallback(
    features: dict[str, float],
    leaf_table: dict[str, dict],
    siblings: dict[str, list[int]],
    metadata: dict,
) -> tuple[str | None, dict | None, int]:
    """Fallback 전략 포함 매칭.

    Returns:
        (leaf_id, leaf_data_or_merged, fallback_level)
        - Level 0: 리프 직접 매칭
        - Level 1: 부모 노드 롤업 (형제 리프 사례 병합)
        - Level 2: 글로벌 Fallback
    """
    # Level 0: 직접 매칭
    leaf_id, leaf_data = match_leaf(features, leaf_table)
    if leaf_id is not None:
        return leaf_id, leaf_data, 0

    # Level 1: 부모 노드 롤업
    # siblings에서 가장 작은 부모 노드(가장 구체적인)를 찾아 자식 리프들을 병합
    for parent_id, child_leaves in sorted(siblings.items(), key=lambda x: len(x[1])):
        child_leaf_ids = [str(lid) for lid in child_leaves]
        # 자식 리프 중 하나라도 leaf_table에 있으면 병합
        merged_incidents = []
        merged_summary = {"total": 0}
        label_col = metadata.get("label_col", "사고유형")
        type_dist = {}

        for clid in child_leaf_ids:
            if clid in leaf_table:
                ld = leaf_table[clid]
                merged_incidents.extend(ld.get("incidents", []))
                merged_summary["total"] += ld["summary"]["total"]
                for t, cnt in ld["summary"].get(label_col, {}).items():
                    type_dist[t] = type_dist.get(t, 0) + cnt

        if merged_incidents:
            merged_summary[label_col] = type_dist
            merged_data = {
                "leaf_id": f"parent_{parent_id}",
                "source": metadata.get("source", ""),
                "rule": f"부모 노드 {parent_id} 롤업",
                "summary": merged_summary,
                "incidents": merged_incidents,
            }
            return f"parent_{parent_id}", merged_data, 1

    # Level 2: 글로벌 Fallback
    all_incidents = []
    global_summary = {"total": 0}
    label_col = metadata.get("label_col", "사고유형")
    global_type_dist = {}

    for leaf_data in leaf_table.values():
        all_incidents.extend(leaf_data.get("incidents", []))
        global_summary["total"] += leaf_data["summary"]["total"]
        for t, cnt in leaf_data["summary"].get(label_col, {}).items():
            global_type_dist[t] = global_type_dist.get(t, 0) + cnt

    global_summary[label_col] = global_type_dist
    global_data = {
        "leaf_id": "global",
        "source": metadata.get("source", ""),
        "rule": "글로벌 Fallback (전체 데이터)",
        "summary": global_summary,
        "incidents": all_incidents[:50],  # 상위 50건만
    }
    return "global", global_data, 2
```

- [ ] **Step 2: 매칭 검증 테스트**

학습 데이터 전수를 sklearn tree.apply()와 rule_matcher로 비교하여 동일한 리프에 매칭되는지 확인한다.

```bash
/opt/anaconda3/envs/daiso/bin/python -c "
import json, pickle, pandas as pd, sys
sys.path.insert(0, 'scripts')
sys.path.insert(0, '.')
from build_dataset import TREE_FEATURES, WEATHER_FEATURES, STORE_NUM_FEATURES, STORE_CAT_FEATURES
from core.rule_matcher import match_leaf

for source in ['cust', 'emp']:
    df = pd.read_csv(f'data/processed/incidents_{source}.csv')
    with open(f'models/{source}/leaf_table.json') as f:
        leaf_table = json.load(f)
    with open(f'models/{source}/tree.pkl', 'rb') as f:
        tree = pickle.load(f)
    with open(f'models/{source}/encoder.pkl', 'rb') as f:
        encoder = pickle.load(f)
    with open(f'models/{source}/encoder_map.json') as f:
        encoder_map = json.load(f)

    feature_cols = [c for c in TREE_FEATURES if c in df.columns]
    X = df[feature_cols].copy()
    if '형태' in X.columns:
        X['형태'] = encoder.transform(X[['형태']])
    for col in WEATHER_FEATURES:
        if col in X.columns:
            if col in ['precipitation_sum', 'snowfall_sum', 'rain_sum']:
                X[col] = X[col].fillna(0)
            else:
                X[col] = X[col].ffill().bfill().fillna(0)
    for col in STORE_NUM_FEATURES:
        if col in X.columns:
            X[col] = X[col].fillna(X[col].median())
    X = X.fillna(0)

    sklearn_leaves = tree.apply(X)
    match_count = 0
    for i in range(len(df)):
        features = {col: float(X.iloc[i][col]) for col in feature_cols}
        lid, _ = match_leaf(features, leaf_table)
        if lid is not None and int(lid) == sklearn_leaves[i]:
            match_count += 1
    print(f'{source.upper()}: {match_count}/{len(df)} matched ({match_count/len(df):.1%})')
"
```

Expected: CUST와 EMP 모두 100% 매칭 (또는 매우 높은 비율).

- [ ] **Step 3: Commit**

```bash
git add core/rule_matcher.py
git commit -m "feat: rule_matcher.py — 순수 Python 리프 노드 매칭 (sklearn 무의존)"
```

---

## Task 8: core/weather.py — Open-Meteo API 클라이언트

**Files:**
- Create: `core/weather.py`

- [ ] **Step 1: weather.py 작성**

```python
"""
weather.py — Open-Meteo API 클라이언트

과거 날짜: Historical API
오늘/미래 날짜: Forecast API
"""

import requests
from datetime import date, datetime

DAILY_PARAMS = [
    "temperature_2m_max", "temperature_2m_min",
    "precipitation_sum", "rain_sum", "snowfall_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]


def get_weather(lat: float, lon: float, target_date: str) -> dict | None:
    """특정 위치/날짜의 기상 데이터를 조회한다.

    Args:
        lat: 위도
        lon: 경도
        target_date: 날짜 (YYYY-MM-DD)

    Returns:
        {"temperature_2m_max": 25.3, ...} 또는 None
    """
    try:
        d = datetime.strptime(target_date, "%Y-%m-%d").date()
    except ValueError:
        return None

    today = date.today()

    if d < today:
        # Historical API
        url = "https://archive-api.open-meteo.com/v1/archive"
    else:
        # Forecast API
        url = "https://api.open-meteo.com/v1/forecast"

    params = {
        "latitude": lat,
        "longitude": lon,
        "start_date": target_date,
        "end_date": target_date,
        "daily": ",".join(DAILY_PARAMS),
        "timezone": "Asia/Seoul",
    }

    try:
        resp = requests.get(url, params=params, timeout=10)
        resp.raise_for_status()
        data = resp.json()
        daily = data.get("daily", {})
        result = {}
        for param in DAILY_PARAMS:
            values = daily.get(param, [None])
            result[param] = values[0] if values else None
        return result
    except Exception as e:
        print(f"[weather] Error: {e}")
        return None
```

- [ ] **Step 2: 간단한 동작 테스트**

```bash
/opt/anaconda3/envs/daiso/bin/python -c "
from core.weather import get_weather
# 서울, 과거 날짜
result = get_weather(37.5665, 126.9780, '2025-01-15')
print(result)
assert result is not None
assert 'temperature_2m_min' in result
print('OK')
"
```

- [ ] **Step 3: Commit**

```bash
git add core/weather.py
git commit -m "feat: weather.py — Open-Meteo API 클라이언트 (Historical + Forecast)"
```

---

## Task 9: core/risk.py — 위험도 산출

**Files:**
- Create: `core/risk.py`

- [ ] **Step 1: risk.py 작성**

```python
"""
risk.py — 위험도 산출

리프 노드의 사고 건수와 사고유형 집중도를 기반으로 위험도를 산출한다.
"""


def calculate_risk(
    leaf_summary: dict,
    total_incidents: int,
    label_col: str = "사고유형",
) -> dict:
    """위험도 점수 및 등급 산출.

    Args:
        leaf_summary: 리프 노드의 summary dict
        total_incidents: 전체 사고 건수 (해당 소스)
        label_col: 라벨 컬럼명

    Returns:
        {
            "score": 0~100,
            "grade": "high" | "medium" | "low",
            "frequency_score": float,
            "concentration_score": float,
            "dominant_type": str,
            "dominant_ratio": float,
        }
    """
    leaf_count = leaf_summary.get("total", 0)
    type_dist = leaf_summary.get(label_col, {})

    # frequency_score: 해당 리프의 사고 빈도 (0~1)
    if total_incidents > 0:
        frequency_score = leaf_count / total_incidents
    else:
        frequency_score = 0

    # concentration_score: 상위 유형 비율 (0~1)
    if leaf_count > 0 and type_dist:
        dominant_type = max(type_dist, key=type_dist.get)
        dominant_count = type_dist[dominant_type]
        concentration_score = dominant_count / leaf_count
    else:
        dominant_type = "알 수 없음"
        concentration_score = 0

    dominant_ratio = concentration_score

    # 종합 위험도 (0~100)
    # frequency 가중치 0.4, concentration 가중치 0.6
    raw_score = (frequency_score * 0.4 + concentration_score * 0.6) * 100
    score = min(100, max(0, round(raw_score)))

    # 등급
    if score >= 70:
        grade = "high"
    elif score >= 50:
        grade = "medium"
    else:
        grade = "low"

    return {
        "score": score,
        "grade": grade,
        "frequency_score": round(frequency_score, 4),
        "concentration_score": round(concentration_score, 4),
        "dominant_type": dominant_type,
        "dominant_ratio": round(dominant_ratio, 4),
    }
```

- [ ] **Step 2: Commit**

```bash
git add core/risk.py
git commit -m "feat: risk.py — 위험도 산출 (frequency + concentration)"
```

---

## Task 10: core/llm.py — Bedrock LLM 호출 + Mock

**Files:**
- Create: `core/llm.py`

- [ ] **Step 1: llm.py 작성**

```python
"""
llm.py — Bedrock LLM 호출 + Mock 모드

환경변수 USE_MOCK_LLM=true 또는 Bedrock 자격증명 없으면 Mock 자동 전환.
"""

import os
import json


SYSTEM_PROMPT = """당신은 다이소 매장 안전관리 전문가입니다.
주어진 기상 조건, 매장 정보, 과거 사고 사례를 바탕으로 매장 안전 가이드를 작성합니다.

규칙:
1. 모든 수치와 통계는 제공된 데이터에서만 인용하세요. 창작하지 마세요.
2. 과거 사고 사례를 구체적으로 언급하세요.
3. 실행 가능한 안전 수칙 3~5개를 제시하세요.
4. 반드시 JSON 형식으로 응답하세요.

응답 JSON 스키마:
{
  "위험_요약": "한 줄 요약",
  "주요_위험유형": "낙상 등",
  "안전_수칙": ["수칙1", "수칙2", ...],
  "과거_사례_인용": "유사 조건에서 발생한 사고 요약",
  "추가_참고": "선택적 추가 정보"
}
"""


def build_prompt(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> str:
    """LLM에 전달할 사용자 프롬프트를 구성한다."""
    # 대표 사례 (최대 5건)
    incidents = leaf_data.get("incidents", [])[:5]
    incidents_text = json.dumps(incidents, ensure_ascii=False, indent=2)

    summary = leaf_data.get("summary", {})

    prompt = f"""## 매장 정보
- 매장명: {store_info.get('매장명', 'N/A')}
- 지역: {store_info.get('지역', 'N/A')}
- 형태: {store_info.get('형태', 'N/A')}
- 평수: {store_info.get('평수', 'N/A')}
- 매장인원: {store_info.get('매장인원', 'N/A')}

## 오늘 기상
{json.dumps(weather, ensure_ascii=False, indent=2)}

## 매칭된 사고 패턴
- 규칙: {leaf_data.get('rule', 'N/A')}
- 총 사고 건수: {summary.get('total', 0)}
- 사고유형 분포: {json.dumps(summary.get(risk_info.get('label_col', '사고유형'), summary.get('사고유형', {})), ensure_ascii=False)}
- 위험도: {risk_info.get('score', 0)}점 ({risk_info.get('grade', 'low')})
- 주요 위험유형: {risk_info.get('dominant_type', 'N/A')} ({risk_info.get('dominant_ratio', 0):.0%})

## 대표 과거 사고 사례
{incidents_text}

위 정보를 바탕으로 오늘 이 매장의 안전 가이드를 JSON 형식으로 작성해주세요.
"""
    return prompt


def generate_guide_mock(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> dict:
    """Mock 모드: LLM 없이 규칙 기반으로 안전 가이드 생성."""
    summary = leaf_data.get("summary", {})
    dominant_type = risk_info.get("dominant_type", "사고")
    grade = risk_info.get("grade", "low")

    # 기상 기반 기본 수칙
    safety_tips = []
    temp_min = weather.get("temperature_2m_min", 10)
    precip = weather.get("precipitation_sum", 0)
    snow = weather.get("snowfall_sum", 0)
    wind = weather.get("wind_speed_10m_max", 0)

    if temp_min is not None and temp_min < 0:
        safety_tips.append("매장 입구와 주차장에 제설제를 살포하고 결빙 상태를 수시 점검하세요")
        safety_tips.append("출입구 미끄럼방지 매트를 배치하세요")
    if precip is not None and precip > 0:
        safety_tips.append("매장 바닥 물기를 수시로 제거하고 '바닥 주의' 표지판을 설치하세요")
    if snow is not None and snow > 0:
        safety_tips.append("적설로 인한 배송 지연에 대비하여 입고 작업 일정을 조정하세요")
    if wind is not None and wind > 10:
        safety_tips.append("강풍에 대비하여 외부 간판과 적재물을 고정하세요")

    if not safety_tips:
        safety_tips = [
            "매장 내 통로를 정리하고 장애물을 제거하세요",
            "무거운 물건은 2인 이상이 함께 운반하세요",
            "안전 장비(안전화, 장갑 등)를 착용하세요",
        ]

    # 대표 사례 인용
    incidents = leaf_data.get("incidents", [])
    if incidents:
        first = incidents[0]
        case_text = first.get("사고내용요약", first.get("사고 내용", "유사 조건에서 사고 발생"))
    else:
        case_text = "유사 기상 조건에서 과거 사고가 발생한 이력이 있습니다"

    return {
        "위험_요약": f"오늘 {store_info.get('매장명', '매장')}은(는) {dominant_type} 위험이 {grade} 수준입니다",
        "주요_위험유형": dominant_type,
        "안전_수칙": safety_tips,
        "과거_사례_인용": case_text,
        "추가_참고": f"과거 유사 조건에서 총 {summary.get('total', 0)}건의 사고가 발생했습니다",
    }


def generate_guide(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> dict:
    """안전 가이드 생성. Bedrock 사용 가능하면 LLM, 아니면 Mock."""
    use_mock = os.environ.get("USE_MOCK_LLM", "").lower() == "true"

    if not use_mock:
        try:
            import boto3
            client = boto3.client("bedrock-runtime", region_name="us-east-1")

            prompt = build_prompt(store_info, weather, leaf_data, risk_info)

            response = client.converse(
                modelId="us.anthropic.claude-sonnet-4-20250514-v1:0",
                messages=[{"role": "user", "content": [{"text": prompt}]}],
                system=[{"text": SYSTEM_PROMPT}],
                inferenceConfig={"maxTokens": 1024, "temperature": 0.3},
            )

            output_text = response["output"]["message"]["content"][0]["text"]

            # JSON 파싱 시도
            # LLM이 ```json ... ``` 으로 감쌀 수 있으므로 추출
            if "```json" in output_text:
                json_str = output_text.split("```json")[1].split("```")[0]
            elif "```" in output_text:
                json_str = output_text.split("```")[1].split("```")[0]
            else:
                json_str = output_text

            return json.loads(json_str.strip())

        except Exception as e:
            print(f"[llm] Bedrock 호출 실패, Mock 전환: {e}")

    return generate_guide_mock(store_info, weather, leaf_data, risk_info)
```

- [ ] **Step 2: Mock 모드 테스트**

```bash
USE_MOCK_LLM=true /opt/anaconda3/envs/daiso/bin/python -c "
from core.llm import generate_guide
result = generate_guide(
    store_info={'매장명': '테스트점', '지역': '강북팀', '형태': '직영점', '평수': 180, '매장인원': 10},
    weather={'temperature_2m_min': -3, 'temperature_2m_max': 2, 'precipitation_sum': 5, 'snowfall_sum': 2, 'rain_sum': 0, 'wind_speed_10m_max': 5, 'relative_humidity_2m_mean': 72, 'soil_temperature_0_to_7cm_mean': -1},
    leaf_data={'rule': '영하+적설', 'summary': {'total': 25, '사고유형': {'낙상': 12, '재물': 8}}, 'incidents': [{'사고내용요약': '매장 입구 결빙으로 고객 미끄러짐'}]},
    risk_info={'score': 72, 'grade': 'high', 'dominant_type': '낙상', 'dominant_ratio': 0.48, 'label_col': '사고유형'},
)
import json
print(json.dumps(result, ensure_ascii=False, indent=2))
assert '안전_수칙' in result
print('OK')
"
```

- [ ] **Step 3: Commit**

```bash
git add core/llm.py
git commit -m "feat: llm.py — Bedrock LLM 안전 가이드 생성 + Mock 모드"
```

---

## Task 11: lambdas/simulate/handler.py — simulate Lambda 핸들러

**Files:**
- Create: `lambdas/simulate/handler.py`

- [ ] **Step 1: handler.py 작성**

```python
"""
simulate Lambda 핸들러

POST /api/simulate
Body: { "store_code": 1234, "date": "2026-04-28" }

1. stores.json에서 매장 정보 조회
2. Open-Meteo API로 기상 데이터 조회
3. rule_matcher로 leaf_table.json 매칭
4. 위험도 산출
5. LLM으로 안전 가이드 생성
6. 응답 반환
"""

import os
import json
import boto3

# Lambda Layer에서 core 모듈 import
from core.weather import get_weather
from core.rule_matcher import match_with_fallback
from core.risk import calculate_risk
from core.llm import generate_guide

# S3 캐싱
_cache = {}
S3_BUCKET = os.environ.get("MODELS_BUCKET", "daiso-safety-models")


def _load_from_s3(key: str) -> dict:
    """S3에서 JSON 로드 (메모리 캐싱)."""
    if key in _cache:
        return _cache[key]

    try:
        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=S3_BUCKET, Key=key)
        data = json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        # 로컬 개발: 파일시스템에서 로드
        local_path = os.path.join(os.path.dirname(__file__), "..", "..", key)
        if os.path.exists(local_path):
            with open(local_path, "r", encoding="utf-8") as f:
                data = json.load(f)
        else:
            raise FileNotFoundError(f"S3({key}) 및 로컬({local_path}) 모두 없음")

    _cache[key] = data
    return data


def _load_models(source: str) -> tuple[dict, dict, dict, dict]:
    """모델 산출물 로드."""
    leaf_table = _load_from_s3(f"models/{source}/leaf_table.json")
    metadata = _load_from_s3(f"models/{source}/metadata.json")
    encoder_map = _load_from_s3(f"models/{source}/encoder_map.json")
    siblings = _load_from_s3(f"models/{source}/siblings.json")
    return leaf_table, metadata, encoder_map, siblings


def _load_stores() -> dict:
    """stores.json 로드 (매장코드 → 매장정보 dict)."""
    stores_list = _load_from_s3("stores.json")
    if isinstance(stores_list, list):
        return {str(s["매장"]): s for s in stores_list}
    return stores_list


def _build_features(store: dict, weather: dict, encoder_map: dict) -> dict:
    """매장 정보 + 기상 데이터 → 피처 dict."""
    features = {}

    # 기상 피처
    for key in [
        "temperature_2m_min", "temperature_2m_max",
        "precipitation_sum", "rain_sum", "snowfall_sum",
        "wind_speed_10m_max", "relative_humidity_2m_mean",
        "soil_temperature_0_to_7cm_mean",
    ]:
        val = weather.get(key)
        features[key] = float(val) if val is not None else 0.0

    # 매장 연속형 피처
    for key in ["평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
                 "매장인원", "입고도우미PO", "일평균매출", "일평균물동량"]:
        val = store.get(key)
        features[key] = float(val) if val is not None else 0.0

    # 매장 범주형 피처 (인코딩)
    store_type = store.get("형태", "직영점")
    type_map = encoder_map.get("형태", {})
    features["형태"] = float(type_map.get(store_type, 2))  # 기본값: 직영점=2

    return features


def _json_response(status_code: int, body: dict) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


def lambda_handler(event, context):
    """Lambda 엔트리포인트."""
    # OPTIONS (CORS preflight)
    http_method = event.get("httpMethod") or event.get("requestContext", {}).get("http", {}).get("method", "")
    if http_method == "OPTIONS":
        return _json_response(200, {})

    # Body 파싱
    body = event.get("body", "{}")
    if isinstance(body, str):
        body = json.loads(body)

    store_code = str(body.get("store_code", ""))
    target_date = body.get("date", "")

    if not store_code or not target_date:
        return _json_response(400, {"error": "store_code와 date는 필수입니다"})

    # 매장 정보 조회
    stores = _load_stores()
    store = stores.get(store_code)
    if not store:
        return _json_response(404, {"error": f"매장 {store_code}을(를) 찾을 수 없습니다"})

    lat = store.get("위도")
    lon = store.get("경도")
    if not lat or not lon:
        return _json_response(400, {"error": f"매장 {store_code}의 위경도 정보가 없습니다"})

    # 기상 데이터 조회
    weather = get_weather(lat, lon, target_date)
    if not weather:
        return _json_response(502, {"error": "기상 데이터 조회 실패"})

    # CUST + EMP 모두 처리
    results = {}
    for source in ["cust", "emp"]:
        try:
            leaf_table, metadata, encoder_map, siblings = _load_models(source)
        except FileNotFoundError:
            continue

        features = _build_features(store, weather, encoder_map)
        label_col = metadata.get("label_col", "사고유형")
        total_incidents = metadata.get("total_incidents", 1)

        # 리프 매칭
        leaf_id, leaf_data, fallback_level = match_with_fallback(
            features, leaf_table, siblings, metadata
        )

        # 위험도 산출
        risk_info = calculate_risk(leaf_data["summary"], total_incidents, label_col)
        risk_info["label_col"] = label_col

        # 안전 가이드 생성
        guide = generate_guide(store, weather, leaf_data, risk_info)

        results[source] = {
            "leaf_id": leaf_id,
            "fallback_level": fallback_level,
            "risk": risk_info,
            "guide": guide,
            "matched_rule": leaf_data.get("rule", ""),
            "incident_count": leaf_data["summary"].get("total", 0),
        }

    response = {
        "store_code": store_code,
        "store_name": store.get("매장명", ""),
        "region": store.get("지역", ""),
        "date": target_date,
        "weather": weather,
        "results": results,
    }

    return _json_response(200, response)
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/simulate/handler.py
git commit -m "feat: simulate Lambda 핸들러 — 매장+날짜 → 안전 가이드 생성"
```

---

## Task 12: lambdas/batch/handler.py — 배치 오케스트레이터 Lambda

**Files:**
- Create: `lambdas/batch/handler.py`

- [ ] **Step 1: handler.py 작성**

```python
"""
batch-orchestrator Lambda 핸들러

EventBridge 트리거: 매일 06:00 KST
1. S3에서 stores.json 로드
2. 전체 매장 순회 → simulate Lambda 호출
3. 결과 S3 저장
4. SES로 이메일 발송
"""

import os
import json
import boto3
from datetime import date, datetime

S3_BUCKET_MODELS = os.environ.get("MODELS_BUCKET", "daiso-safety-models")
S3_BUCKET_DAILY = os.environ.get("DAILY_BUCKET", "daiso-safety-daily")
SIMULATE_FUNCTION = os.environ.get("SIMULATE_FUNCTION", "daiso-simulate")
SES_SENDER = os.environ.get("SES_SENDER", "safety@daiso.co.kr")
SES_REGION = os.environ.get("SES_REGION", "us-east-1")


def _load_stores_from_s3() -> list[dict]:
    """S3에서 stores.json 로드."""
    try:
        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=S3_BUCKET_MODELS, Key="stores.json")
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        # 로컬 개발
        local_path = os.path.join(os.path.dirname(__file__), "..", "..", "stores.json")
        if os.path.exists(local_path):
            with open(local_path, "r", encoding="utf-8") as f:
                return json.load(f)
        raise


def _invoke_simulate(store_code: int, target_date: str) -> dict | None:
    """simulate Lambda를 동기 호출."""
    try:
        client = boto3.client("lambda")
        payload = json.dumps({
            "body": json.dumps({"store_code": store_code, "date": target_date}),
            "httpMethod": "POST",
        })
        resp = client.invoke(
            FunctionName=SIMULATE_FUNCTION,
            InvocationType="RequestResponse",
            Payload=payload,
        )
        result = json.loads(resp["Payload"].read().decode("utf-8"))
        body = json.loads(result.get("body", "{}"))
        return body
    except Exception as e:
        print(f"[batch] simulate 호출 실패 (store={store_code}): {e}")
        return None


def _send_email(recipient: str, store_name: str, guide_data: dict):
    """SES로 안전 가이드 이메일 발송."""
    try:
        ses = boto3.client("ses", region_name=SES_REGION)

        # 이메일 본문 구성
        cust_guide = guide_data.get("results", {}).get("cust", {}).get("guide", {})
        emp_guide = guide_data.get("results", {}).get("emp", {}).get("guide", {})

        body_parts = [
            f"🏪 {store_name} 안전 가이드",
            f"📅 날짜: {guide_data.get('date', '')}",
            "",
        ]

        if cust_guide:
            body_parts.append("━━ 고객 안전 (CUST) ━━")
            body_parts.append(f"⚠️ {cust_guide.get('위험_요약', '')}")
            for tip in cust_guide.get("안전_수칙", []):
                body_parts.append(f"  ☑️ {tip}")
            body_parts.append("")

        if emp_guide:
            body_parts.append("━━ 직원 안전 (EMP) ━━")
            body_parts.append(f"⚠️ {emp_guide.get('위험_요약', '')}")
            for tip in emp_guide.get("안전_수칙", []):
                body_parts.append(f"  ☑️ {tip}")

        body_text = "\n".join(body_parts)

        ses.send_email(
            Source=SES_SENDER,
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": f"[다이소 안전] {store_name} 오늘의 안전 가이드", "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
            },
        )
        return True
    except Exception as e:
        print(f"[batch] SES 발송 실패 ({recipient}): {e}")
        return False


def lambda_handler(event, context):
    """배치 오케스트레이터 엔트리포인트."""
    today = date.today().isoformat()
    print(f"[batch] 배치 시작: {today}")

    stores = _load_stores_from_s3()
    print(f"[batch] 매장 수: {len(stores)}")

    results = []
    success_count = 0
    fail_count = 0
    email_sent = 0
    email_failed = 0

    for store in stores:
        store_code = store.get("매장")
        store_name = store.get("매장명", "")
        email = store.get("email")  # stores.json에 이메일 필드가 있으면

        if not store_code:
            continue

        # simulate 호출
        sim_result = _invoke_simulate(store_code, today)

        if sim_result and "error" not in sim_result:
            success_count += 1
            status = "success"

            # 이메일 발송
            if email:
                sent = _send_email(email, store_name, sim_result)
                if sent:
                    email_sent += 1
                else:
                    email_failed += 1
        else:
            fail_count += 1
            status = "failed"
            sim_result = sim_result or {"error": "simulate 호출 실패"}

        results.append({
            "store_code": store_code,
            "store_name": store_name,
            "status": status,
            "risk_cust": sim_result.get("results", {}).get("cust", {}).get("risk", {}).get("grade", ""),
            "risk_emp": sim_result.get("results", {}).get("emp", {}).get("risk", {}).get("grade", ""),
            "email_sent": email is not None and status == "success",
        })

    # 결과 S3 저장
    batch_result = {
        "date": today,
        "timestamp": datetime.utcnow().isoformat(),
        "summary": {
            "total": len(results),
            "success": success_count,
            "failed": fail_count,
            "email_sent": email_sent,
            "email_failed": email_failed,
        },
        "stores": results,
    }

    try:
        s3 = boto3.client("s3")
        s3.put_object(
            Bucket=S3_BUCKET_DAILY,
            Key=f"daily/{today}/results.json",
            Body=json.dumps(batch_result, ensure_ascii=False, indent=2),
            ContentType="application/json",
        )
        print(f"[batch] 결과 저장: s3://{S3_BUCKET_DAILY}/daily/{today}/results.json")
    except Exception as e:
        print(f"[batch] S3 저장 실패: {e}")

    print(f"[batch] 완료: 성공 {success_count}, 실패 {fail_count}, "
          f"이메일 발송 {email_sent}, 이메일 실패 {email_failed}")

    return {
        "statusCode": 200,
        "body": json.dumps(batch_result, ensure_ascii=False),
    }
```

- [ ] **Step 2: Commit**

```bash
git add lambdas/batch/handler.py
git commit -m "feat: batch-orchestrator Lambda — 전체 매장 순회 + SES 이메일 발송"
```

---

## Task 13: local_server.py — 로컬 개발 서버

**Files:**
- Create: `local_server.py`

- [ ] **Step 1: local_server.py 작성**

```python
"""
local_server.py — 로컬 개발 서버

Lambda 핸들러를 로컬에서 테스트하기 위한 경량 HTTP 서버.
순수 Python http.server 기반, 외부 프레임워크 없음.

실행: python local_server.py  # http://localhost:8000
"""

import json
import sys
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from urllib.parse import urlparse, parse_qs

# 프로젝트 루트를 sys.path에 추가
ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT))

PORT = 8000


class LocalHandler(SimpleHTTPRequestHandler):
    """API 요청은 Lambda 핸들러로, 나머지는 frontend/ 정적 파일 서빙."""

    def __init__(self, *args, **kwargs):
        # 정적 파일 루트를 frontend/로 설정
        super().__init__(*args, directory=str(ROOT / "frontend"), **kwargs)

    def do_OPTIONS(self):
        """CORS preflight."""
        self.send_response(200)
        self._set_cors_headers()
        self.end_headers()

    def do_GET(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api("GET", parsed)
        else:
            super().do_GET()

    def do_POST(self):
        parsed = urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._handle_api("POST", parsed)
        else:
            self.send_error(404)

    def _handle_api(self, method: str, parsed):
        """API 요청을 Lambda 핸들러로 라우팅."""
        path = parsed.path
        query = parse_qs(parsed.query)

        # Body 읽기
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length > 0 else "{}"

        # Lambda event 구성
        event = {
            "httpMethod": method,
            "path": path,
            "queryStringParameters": {k: v[0] for k, v in query.items()},
            "body": body,
            "headers": dict(self.headers),
        }

        # 라우팅
        try:
            if path == "/api/simulate":
                from lambdas.simulate.handler import lambda_handler
                result = lambda_handler(event, None)
            elif path.startswith("/api/daily/"):
                # 배치 결과 조회 (S3 대신 로컬 파일)
                result = self._serve_daily_result(path)
            else:
                result = {"statusCode": 404, "body": json.dumps({"error": "Not found"})}
        except Exception as e:
            result = {
                "statusCode": 500,
                "body": json.dumps({"error": str(e)}),
            }

        status = result.get("statusCode", 200)
        response_body = result.get("body", "{}")

        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self._set_cors_headers()
        self.end_headers()
        self.wfile.write(response_body.encode("utf-8"))

    def _serve_daily_result(self, path: str) -> dict:
        """로컬에서 배치 결과 JSON 서빙."""
        # /api/daily/2026-05-04 → daily/2026-05-04/results.json
        parts = path.split("/")
        if len(parts) >= 4:
            date_str = parts[3]
            local_path = ROOT / "daily" / date_str / "results.json"
            if local_path.exists():
                with open(local_path, "r", encoding="utf-8") as f:
                    return {"statusCode": 200, "body": f.read()}
        return {"statusCode": 404, "body": json.dumps({"error": "배치 결과 없음"})}

    def _set_cors_headers(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")

    def log_message(self, format, *args):
        """로그 포맷 커스텀."""
        print(f"[{self.log_date_time_string()}] {format % args}")


def main():
    server = HTTPServer(("", PORT), LocalHandler)
    print(f"🚀 로컬 서버 시작: http://localhost:{PORT}")
    print(f"   프론트엔드: http://localhost:{PORT}/")
    print(f"   API: POST http://localhost:{PORT}/api/simulate")
    print("   Ctrl+C로 종료")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n서버 종료")
        server.server_close()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: stores.json 생성 스크립트 (로컬 테스트용)**

simulate Lambda가 stores.json을 참조하므로, stores.csv에서 JSON으로 변환하는 유틸리티를 local_server.py 실행 전에 한 번 돌린다.

```bash
/opt/anaconda3/envs/daiso/bin/python -c "
import pandas as pd, json
stores = pd.read_csv('data/processed/stores.csv')
stores_list = stores.to_dict(orient='records')
# NaN → None 처리
import math
for s in stores_list:
    for k, v in s.items():
        if isinstance(v, float) and math.isnan(v):
            s[k] = None
with open('stores.json', 'w', encoding='utf-8') as f:
    json.dump(stores_list, f, ensure_ascii=False, indent=2)
print(f'stores.json 생성: {len(stores_list)}건')
"
```

- [ ] **Step 3: 로컬 서버 + simulate API 테스트**

터미널 1에서 서버 시작:
```bash
USE_MOCK_LLM=true /opt/anaconda3/envs/daiso/bin/python local_server.py
```

터미널 2에서 API 호출:
```bash
curl -X POST http://localhost:8000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"store_code": 10130, "date": "2025-01-15"}'
```

Expected: 안전 가이드 JSON 응답 (Mock 모드).

- [ ] **Step 4: Commit**

```bash
git add local_server.py stores.json
git commit -m "feat: local_server.py — 로컬 개발 서버 + stores.json 생성"
```

---

## Task 14: 프론트엔드 — 2탭 UI (모니터링 + 수동 알림)

**Files:**
- Create: `frontend/index.html`
- Create: `frontend/css/style.css`
- Create: `frontend/js/app.js`

- [ ] **Step 1: index.html 작성**

```html
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>다이소 안전사고 예방 AI</title>
    <link rel="stylesheet" href="css/style.css">
</head>
<body>
    <header>
        <h1>🏪 다이소 매장 안전사고 예방 AI</h1>
    </header>

    <nav class="tabs">
        <button class="tab active" data-tab="monitoring">📊 알림 발송 현황</button>
        <button class="tab" data-tab="manual">✏️ 수동 알림 생성</button>
    </nav>

    <!-- 탭 1: 알림 발송 현황 모니터링 -->
    <section id="monitoring" class="tab-content active">
        <div class="controls">
            <label for="batch-date">조회 날짜:</label>
            <input type="date" id="batch-date">
            <button id="btn-load-batch">조회</button>
        </div>

        <div id="batch-summary" class="summary-cards" style="display:none;">
            <div class="card">
                <span class="card-label">총 발송</span>
                <span class="card-value" id="total-count">-</span>
            </div>
            <div class="card">
                <span class="card-label">성공</span>
                <span class="card-value success" id="success-count">-</span>
            </div>
            <div class="card">
                <span class="card-label">실패</span>
                <span class="card-value danger" id="fail-count">-</span>
            </div>
            <div class="card">
                <span class="card-label">이메일 발송</span>
                <span class="card-value" id="email-count">-</span>
            </div>
        </div>

        <table id="batch-table" style="display:none;">
            <thead>
                <tr>
                    <th>매장코드</th>
                    <th>매장명</th>
                    <th>상태</th>
                    <th>고객 위험도</th>
                    <th>직원 위험도</th>
                    <th>이메일</th>
                </tr>
            </thead>
            <tbody id="batch-tbody"></tbody>
        </table>

        <div id="batch-empty" class="empty-state">
            날짜를 선택하고 조회 버튼을 눌러주세요.
        </div>
    </section>

    <!-- 탭 2: 수동 알림 생성 -->
    <section id="manual" class="tab-content">
        <div class="controls">
            <label for="store-search">매장 검색:</label>
            <input type="text" id="store-search" placeholder="매장명 또는 코드 입력" autocomplete="off">
            <div id="store-suggestions" class="suggestions"></div>

            <label for="sim-date">날짜:</label>
            <input type="date" id="sim-date">
            <button id="btn-simulate">안전 가이드 생성</button>
        </div>

        <div id="sim-loading" class="loading" style="display:none;">
            생성 중...
        </div>

        <div id="sim-result" style="display:none;">
            <div class="meta-info">
                <h3 id="sim-store-name"></h3>
                <p id="sim-meta"></p>
            </div>

            <div class="result-section" id="sim-cust" style="display:none;">
                <h4>📋 고객 안전 (CUST)</h4>
                <div class="risk-badge" id="cust-risk"></div>
                <div class="guide-content" id="cust-guide"></div>
            </div>

            <div class="result-section" id="sim-emp" style="display:none;">
                <h4>🔧 직원 안전 (EMP)</h4>
                <div class="risk-badge" id="emp-risk"></div>
                <div class="guide-content" id="emp-guide"></div>
            </div>
        </div>

        <div id="sim-empty" class="empty-state">
            매장과 날짜를 선택하고 생성 버튼을 눌러주세요.
        </div>
    </section>

    <script src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: style.css 작성**

```css
/* frontend/css/style.css */
* { margin: 0; padding: 0; box-sizing: border-box; }

body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    background: #f5f5f5;
    color: #333;
    max-width: 1200px;
    margin: 0 auto;
    padding: 20px;
}

header { text-align: center; margin-bottom: 24px; }
header h1 { font-size: 1.5rem; color: #e4002b; }

/* 탭 */
.tabs { display: flex; gap: 8px; margin-bottom: 20px; }
.tab {
    padding: 10px 20px; border: 1px solid #ddd; background: #fff;
    border-radius: 8px 8px 0 0; cursor: pointer; font-size: 0.95rem;
    transition: background 0.2s;
}
.tab.active { background: #e4002b; color: #fff; border-color: #e4002b; }
.tab:hover:not(.active) { background: #f0f0f0; }

.tab-content { display: none; background: #fff; padding: 20px; border-radius: 0 8px 8px 8px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
.tab-content.active { display: block; }

/* 컨트롤 */
.controls { display: flex; align-items: center; gap: 12px; margin-bottom: 20px; flex-wrap: wrap; }
.controls label { font-weight: 600; font-size: 0.9rem; }
.controls input[type="date"], .controls input[type="text"] {
    padding: 8px 12px; border: 1px solid #ddd; border-radius: 6px; font-size: 0.9rem;
}
.controls input[type="text"] { width: 250px; }
.controls button {
    padding: 8px 20px; background: #e4002b; color: #fff; border: none;
    border-radius: 6px; cursor: pointer; font-size: 0.9rem;
}
.controls button:hover { background: #c00025; }

/* 요약 카드 */
.summary-cards { display: flex; gap: 16px; margin-bottom: 20px; }
.card {
    flex: 1; background: #f9f9f9; padding: 16px; border-radius: 8px;
    text-align: center; border: 1px solid #eee;
}
.card-label { display: block; font-size: 0.8rem; color: #666; margin-bottom: 4px; }
.card-value { font-size: 1.5rem; font-weight: 700; }
.card-value.success { color: #28a745; }
.card-value.danger { color: #dc3545; }

/* 테이블 */
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { padding: 10px 12px; text-align: left; border-bottom: 1px solid #eee; }
th { background: #f9f9f9; font-weight: 600; }
tr:hover { background: #f5f5f5; }

/* 위험도 뱃지 */
.risk-badge {
    display: inline-block; padding: 4px 12px; border-radius: 12px;
    font-size: 0.8rem; font-weight: 600; margin: 8px 0;
}
.risk-high { background: #ffe0e0; color: #dc3545; }
.risk-medium { background: #fff3cd; color: #856404; }
.risk-low { background: #d4edda; color: #155724; }

/* 결과 섹션 */
.result-section { margin: 16px 0; padding: 16px; background: #f9f9f9; border-radius: 8px; }
.result-section h4 { margin-bottom: 8px; }
.guide-content { line-height: 1.6; }
.guide-content ul { margin: 8px 0 8px 20px; }

/* 자동완성 */
.suggestions {
    position: absolute; background: #fff; border: 1px solid #ddd;
    border-radius: 6px; max-height: 200px; overflow-y: auto; z-index: 10;
    box-shadow: 0 2px 8px rgba(0,0,0,0.1); display: none;
}
.suggestions .suggestion-item {
    padding: 8px 12px; cursor: pointer; font-size: 0.9rem;
}
.suggestions .suggestion-item:hover { background: #f0f0f0; }

.meta-info { margin-bottom: 16px; }
.meta-info h3 { color: #e4002b; }
.meta-info p { color: #666; font-size: 0.9rem; margin-top: 4px; }

.empty-state { text-align: center; color: #999; padding: 40px; font-size: 0.95rem; }
.loading { text-align: center; padding: 20px; color: #666; }

/* 상태 뱃지 (테이블용) */
.status-success { color: #28a745; }
.status-failed { color: #dc3545; }
```

- [ ] **Step 3: app.js 작성**

```javascript
// frontend/js/app.js

const API_BASE = window.location.origin;
let storesData = [];

// ─── 초기화 ───
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initMonitoring();
    initManual();
    loadStoresList();
});

// ─── 탭 전환 ───
function initTabs() {
    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            tab.classList.add('active');
            document.getElementById(tab.dataset.tab).classList.add('active');
        });
    });
}

// ─── 매장 리스트 로드 (자동완성용) ───
async function loadStoresList() {
    try {
        const resp = await fetch(API_BASE + '/stores.json');
        if (resp.ok) {
            storesData = await resp.json();
        }
    } catch (e) {
        console.warn('stores.json 로드 실패:', e);
    }
}

// ─── 탭 1: 알림 발송 현황 ───
function initMonitoring() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('batch-date').value = today;

    document.getElementById('btn-load-batch').addEventListener('click', loadBatchResult);
}

async function loadBatchResult() {
    const date = document.getElementById('batch-date').value;
    if (!date) return;

    try {
        const resp = await fetch(`${API_BASE}/api/daily/${date}`);
        if (!resp.ok) {
            document.getElementById('batch-empty').textContent = '해당 날짜의 배치 결과가 없습니다.';
            document.getElementById('batch-empty').style.display = 'block';
            document.getElementById('batch-summary').style.display = 'none';
            document.getElementById('batch-table').style.display = 'none';
            return;
        }

        const data = await resp.json();
        renderBatchResult(data);
    } catch (e) {
        console.error('배치 결과 로드 실패:', e);
    }
}

function renderBatchResult(data) {
    const summary = data.summary || {};
    document.getElementById('total-count').textContent = summary.total || 0;
    document.getElementById('success-count').textContent = summary.success || 0;
    document.getElementById('fail-count').textContent = summary.failed || 0;
    document.getElementById('email-count').textContent = summary.email_sent || 0;

    document.getElementById('batch-summary').style.display = 'flex';
    document.getElementById('batch-empty').style.display = 'none';
    document.getElementById('batch-table').style.display = 'table';

    const tbody = document.getElementById('batch-tbody');
    tbody.innerHTML = '';

    (data.stores || []).forEach(store => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${store.store_code}</td>
            <td>${store.store_name}</td>
            <td class="status-${store.status}">${store.status === 'success' ? '✅ 성공' : '❌ 실패'}</td>
            <td>${riskBadgeHTML(store.risk_cust)}</td>
            <td>${riskBadgeHTML(store.risk_emp)}</td>
            <td>${store.email_sent ? '📧' : '-'}</td>
        `;
        tbody.appendChild(tr);
    });
}

function riskBadgeHTML(grade) {
    if (!grade) return '-';
    const labels = { high: '🔴 높음', medium: '🟡 보통', low: '🟢 낮음' };
    return `<span class="risk-badge risk-${grade}">${labels[grade] || grade}</span>`;
}

// ─── 탭 2: 수동 알림 생성 ───
function initManual() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('sim-date').value = today;

    const searchInput = document.getElementById('store-search');
    const suggestions = document.getElementById('store-suggestions');

    searchInput.addEventListener('input', () => {
        const query = searchInput.value.trim().toLowerCase();
        if (query.length < 1) {
            suggestions.style.display = 'none';
            return;
        }

        const matches = storesData.filter(s =>
            (s.매장명 && s.매장명.toLowerCase().includes(query)) ||
            String(s.매장).includes(query)
        ).slice(0, 10);

        if (matches.length === 0) {
            suggestions.style.display = 'none';
            return;
        }

        suggestions.innerHTML = matches.map(s =>
            `<div class="suggestion-item" data-code="${s.매장}">${s.매장명} (${s.매장})</div>`
        ).join('');
        suggestions.style.display = 'block';

        suggestions.querySelectorAll('.suggestion-item').forEach(item => {
            item.addEventListener('click', () => {
                searchInput.value = item.textContent;
                searchInput.dataset.code = item.dataset.code;
                suggestions.style.display = 'none';
            });
        });
    });

    document.addEventListener('click', (e) => {
        if (!e.target.closest('#store-search') && !e.target.closest('#store-suggestions')) {
            suggestions.style.display = 'none';
        }
    });

    document.getElementById('btn-simulate').addEventListener('click', runSimulate);
}

async function runSimulate() {
    const searchInput = document.getElementById('store-search');
    const storeCode = searchInput.dataset.code || searchInput.value.trim();
    const date = document.getElementById('sim-date').value;

    if (!storeCode || !date) {
        alert('매장과 날짜를 선택해주세요.');
        return;
    }

    document.getElementById('sim-loading').style.display = 'block';
    document.getElementById('sim-result').style.display = 'none';
    document.getElementById('sim-empty').style.display = 'none';

    try {
        const resp = await fetch(`${API_BASE}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ store_code: parseInt(storeCode), date }),
        });

        const data = await resp.json();
        document.getElementById('sim-loading').style.display = 'none';

        if (data.error) {
            document.getElementById('sim-empty').textContent = data.error;
            document.getElementById('sim-empty').style.display = 'block';
            return;
        }

        renderSimResult(data);
    } catch (e) {
        document.getElementById('sim-loading').style.display = 'none';
        document.getElementById('sim-empty').textContent = '요청 실패: ' + e.message;
        document.getElementById('sim-empty').style.display = 'block';
    }
}

function renderSimResult(data) {
    document.getElementById('sim-result').style.display = 'block';
    document.getElementById('sim-store-name').textContent =
        `${data.store_name} (${data.store_code})`;
    document.getElementById('sim-meta').textContent =
        `지역: ${data.region} | 날짜: ${data.date}`;

    // CUST
    const custResult = data.results?.cust;
    const custSection = document.getElementById('sim-cust');
    if (custResult) {
        custSection.style.display = 'block';
        document.getElementById('cust-risk').innerHTML = riskBadgeHTML(custResult.risk?.grade);
        document.getElementById('cust-risk').innerHTML +=
            ` <span>점수: ${custResult.risk?.score || 0} | 주요: ${custResult.risk?.dominant_type || '-'}</span>`;
        renderGuide('cust-guide', custResult.guide);
    } else {
        custSection.style.display = 'none';
    }

    // EMP
    const empResult = data.results?.emp;
    const empSection = document.getElementById('sim-emp');
    if (empResult) {
        empSection.style.display = 'block';
        document.getElementById('emp-risk').innerHTML = riskBadgeHTML(empResult.risk?.grade);
        document.getElementById('emp-risk').innerHTML +=
            ` <span>점수: ${empResult.risk?.score || 0} | 주요: ${empResult.risk?.dominant_type || '-'}</span>`;
        renderGuide('emp-guide', empResult.guide);
    } else {
        empSection.style.display = 'none';
    }
}

function renderGuide(elementId, guide) {
    if (!guide) return;
    const el = document.getElementById(elementId);
    let html = `<p><strong>⚠️ ${guide.위험_요약 || ''}</strong></p>`;
    if (guide.안전_수칙 && guide.안전_수칙.length > 0) {
        html += '<ul>';
        guide.안전_수칙.forEach(tip => { html += `<li>☑️ ${tip}</li>`; });
        html += '</ul>';
    }
    if (guide.과거_사례_인용) {
        html += `<p><em>📌 ${guide.과거_사례_인용}</em></p>`;
    }
    if (guide.추가_참고) {
        html += `<p style="color:#666;font-size:0.85rem;">💡 ${guide.추가_참고}</p>`;
    }
    el.innerHTML = html;
}
```

- [ ] **Step 4: 로컬 서버에서 UI 테스트**

```bash
USE_MOCK_LLM=true /opt/anaconda3/envs/daiso/bin/python local_server.py
```

브라우저에서 `http://localhost:8000` 접속:
- 탭 전환 동작 확인
- 수동 알림 생성: 매장 검색 → 날짜 선택 → 생성 → 결과 표시 확인

- [ ] **Step 5: Commit**

```bash
git add frontend/
git commit -m "feat: 프론트엔드 — 알림 모니터링 + 수동 알림 생성 2탭 UI"
```

---

## Task 15: infra/main.tf — Terraform 인프라

**Files:**
- Create: `infra/main.tf`

- [ ] **Step 1: main.tf 작성**

```hcl
# infra/main.tf — 다이소 안전사고 예방 AI 인프라

terraform {
  required_version = ">= 1.5"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region = var.aws_region
}

variable "aws_region" {
  default = "us-east-1"
}

variable "project" {
  default = "daiso-safety"
}

variable "ses_sender_email" {
  description = "SES 발신 이메일 (사전 인증 필요)"
  type        = string
}

# ─── S3 Buckets ───

resource "aws_s3_bucket" "frontend" {
  bucket = "${var.project}-frontend"
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  index_document { suffix = "index.html" }
  error_document { key = "index.html" }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket                  = aws_s3_bucket.frontend.id
  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "PublicRead"
      Effect    = "Allow"
      Principal = "*"
      Action    = "s3:GetObject"
      Resource  = "${aws_s3_bucket.frontend.arn}/*"
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.frontend]
}

resource "aws_s3_bucket" "models" {
  bucket = "${var.project}-models"
}

resource "aws_s3_bucket" "daily" {
  bucket = "${var.project}-daily"
}

# ─── IAM ───

resource "aws_iam_role" "lambda_role" {
  name = "${var.project}-lambda-role"
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "lambda.amazonaws.com" }
    }]
  })
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${var.project}-lambda-policy"
  role = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = ["logs:CreateLogGroup", "logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect   = "Allow"
        Action   = ["s3:GetObject", "s3:PutObject", "s3:ListBucket"]
        Resource = [
          aws_s3_bucket.models.arn, "${aws_s3_bucket.models.arn}/*",
          aws_s3_bucket.daily.arn, "${aws_s3_bucket.daily.arn}/*",
        ]
      },
      {
        Effect   = "Allow"
        Action   = ["bedrock:InvokeModel"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["ses:SendEmail", "ses:SendRawEmail"]
        Resource = "*"
      },
      {
        Effect   = "Allow"
        Action   = ["lambda:InvokeFunction"]
        Resource = "*"
      },
    ]
  })
}

# ─── Lambda Layer (core/) ───

resource "aws_lambda_layer_version" "core" {
  layer_name          = "${var.project}-core"
  filename            = "${path.module}/../dist/core-layer.zip"
  compatible_runtimes = ["python3.12"]
  source_code_hash    = filebase64sha256("${path.module}/../dist/core-layer.zip")
}

# ─── Lambda: simulate ───

resource "aws_lambda_function" "simulate" {
  function_name    = "${var.project}-simulate"
  filename         = "${path.module}/../dist/simulate.zip"
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  memory_size      = 512
  timeout          = 60
  source_code_hash = filebase64sha256("${path.module}/../dist/simulate.zip")
  layers           = [aws_lambda_layer_version.core.arn]

  environment {
    variables = {
      MODELS_BUCKET = aws_s3_bucket.models.id
      USE_MOCK_LLM  = "false"
    }
  }
}

# ─── Lambda: batch-orchestrator ───

resource "aws_lambda_function" "batch" {
  function_name    = "${var.project}-batch-orchestrator"
  filename         = "${path.module}/../dist/batch.zip"
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  role             = aws_iam_role.lambda_role.arn
  memory_size      = 256
  timeout          = 900
  source_code_hash = filebase64sha256("${path.module}/../dist/batch.zip")
  layers           = [aws_lambda_layer_version.core.arn]

  environment {
    variables = {
      MODELS_BUCKET     = aws_s3_bucket.models.id
      DAILY_BUCKET      = aws_s3_bucket.daily.id
      SIMULATE_FUNCTION = aws_lambda_function.simulate.function_name
      SES_SENDER        = var.ses_sender_email
      SES_REGION        = var.aws_region
    }
  }
}

# ─── API Gateway ───

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"
  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "OPTIONS"]
    allow_headers = ["Content-Type"]
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "simulate" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.simulate.invoke_arn
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "simulate" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/simulate"
  target    = "integrations/${aws_apigatewayv2_integration.simulate.id}"
}

resource "aws_lambda_permission" "api_simulate" {
  statement_id  = "AllowAPIGateway"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.simulate.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# ─── EventBridge (배치 스케줄) ───

resource "aws_cloudwatch_event_rule" "daily_batch" {
  name                = "${var.project}-daily-batch"
  description         = "매일 06:00 KST (21:00 UTC) 배치 실행"
  schedule_expression = "cron(0 21 * * ? *)"
}

resource "aws_cloudwatch_event_target" "batch_target" {
  rule = aws_cloudwatch_event_rule.daily_batch.name
  arn  = aws_lambda_function.batch.arn
}

resource "aws_lambda_permission" "eventbridge_batch" {
  statement_id  = "AllowEventBridge"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.batch.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_batch.arn
}

# ─── SES (이메일 인증) ───

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

# ─── Outputs ───

output "api_url" {
  value = aws_apigatewayv2_api.api.api_endpoint
}

output "frontend_url" {
  value = "http://${aws_s3_bucket.frontend.bucket}.s3-website-${var.aws_region}.amazonaws.com"
}

output "models_bucket" {
  value = aws_s3_bucket.models.id
}

output "daily_bucket" {
  value = aws_s3_bucket.daily.id
}
```

- [ ] **Step 2: Terraform 검증**

```bash
cd infra && terraform init && terraform validate
```

Expected: `Success! The configuration is valid.`

(실제 apply는 AWS 자격증명 + dist/*.zip 빌드 후 진행)

- [ ] **Step 3: Commit**

```bash
git add infra/main.tf
git commit -m "feat: Terraform 인프라 — S3, Lambda, API Gateway, EventBridge, SES"
```

---

## Task 16: E2E 통합 테스트 (로컬)

**Files:**
- 기존 파일 사용

이 태스크는 코드 작성이 아니라 전체 파이프라인을 로컬에서 검증하는 단계이다.

- [ ] **Step 1: 전처리 파이프라인 전체 실행**

```bash
/opt/anaconda3/envs/daiso/bin/python scripts/build_dataset.py
```

검증:
- `data/processed/stores.csv` — 매장인원, 입고도우미PO, 일평균매출, 일평균물동량 컬럼 존재
- `data/processed/incidents_cust.csv` — 핵심 피처 + 사례 컬럼만 남음
- `data/processed/incidents_emp.csv` — 동일

- [ ] **Step 2: Decision Tree 학습**

```bash
/opt/anaconda3/envs/daiso/bin/python scripts/train.py
```

검증:
- `models/cust/leaf_table.json` — 리프 수 확인
- `models/emp/leaf_table.json` — 리프 수 확인
- metadata.json에서 min(leaf_sizes) >= 5 확인
- tree_depth <= 5 확인

- [ ] **Step 3: stores.json 생성**

```bash
/opt/anaconda3/envs/daiso/bin/python -c "
import pandas as pd, json, math
stores = pd.read_csv('data/processed/stores.csv')
stores_list = stores.to_dict(orient='records')
for s in stores_list:
    for k, v in s.items():
        if isinstance(v, float) and math.isnan(v):
            s[k] = None
with open('stores.json', 'w', encoding='utf-8') as f:
    json.dump(stores_list, f, ensure_ascii=False, indent=2)
print(f'stores.json: {len(stores_list)}건')
"
```

- [ ] **Step 4: 로컬 서버 + API 테스트**

```bash
USE_MOCK_LLM=true /opt/anaconda3/envs/daiso/bin/python local_server.py &

# simulate API 테스트
curl -s -X POST http://localhost:8000/api/simulate \
  -H "Content-Type: application/json" \
  -d '{"store_code": 10130, "date": "2025-01-15"}' | python3 -m json.tool

# 서버 종료
kill %1
```

검증:
- 200 응답
- results.cust, results.emp 모두 존재
- guide에 안전_수칙 배열 포함

- [ ] **Step 5: rule_matcher 정합성 검증**

```bash
/opt/anaconda3/envs/daiso/bin/python -c "
import json, pickle, pandas as pd, sys
sys.path.insert(0, 'scripts')
sys.path.insert(0, '.')
from build_dataset import TREE_FEATURES, WEATHER_FEATURES, STORE_NUM_FEATURES
from core.rule_matcher import match_leaf

for source in ['cust', 'emp']:
    df = pd.read_csv(f'data/processed/incidents_{source}.csv')
    with open(f'models/{source}/leaf_table.json') as f:
        leaf_table = json.load(f)
    with open(f'models/{source}/tree.pkl', 'rb') as f:
        tree = pickle.load(f)
    with open(f'models/{source}/encoder.pkl', 'rb') as f:
        encoder = pickle.load(f)

    feature_cols = [c for c in TREE_FEATURES if c in df.columns]
    X = df[feature_cols].copy()
    if '형태' in X.columns:
        X['형태'] = encoder.transform(X[['형태']])
    for col in WEATHER_FEATURES:
        if col in X.columns:
            if col in ['precipitation_sum', 'snowfall_sum', 'rain_sum']:
                X[col] = X[col].fillna(0)
            else:
                X[col] = X[col].ffill().bfill().fillna(0)
    for col in STORE_NUM_FEATURES:
        if col in X.columns:
            X[col] = X[col].fillna(X[col].median())
    X = X.fillna(0)

    sklearn_leaves = tree.apply(X)
    match_count = 0
    for i in range(len(df)):
        features = {col: float(X.iloc[i][col]) for col in feature_cols}
        lid, _ = match_leaf(features, leaf_table)
        if lid is not None and int(lid) == sklearn_leaves[i]:
            match_count += 1
    pct = match_count / len(df) * 100
    print(f'{source.upper()}: {match_count}/{len(df)} ({pct:.1f}%)')
    assert pct > 95, f'{source} 매칭률이 95% 미만: {pct:.1f}%'

print('✅ rule_matcher 정합성 검증 통과')
"
```

- [ ] **Step 6: 최종 Commit**

```bash
git add -A
git commit -m "chore: E2E 통합 테스트 완료 — 전체 파이프라인 검증"
```

---

## 구현 순서 요약

| Task | 내용 | 의존성 |
|------|------|--------|
| 1 | 프로젝트 초기 설정 | - |
| 2 | build_dataset.py Step 1 (매장 + 인원/매출) | 1 |
| 3 | build_dataset.py Step 2 (사고 데이터) | 2 |
| 4 | build_dataset.py Step 3 (기상 데이터) | 3 |
| 5 | build_dataset.py Step 4 + main (정리) | 4 |
| 6 | train.py (Decision Tree 학습) | 5 |
| 7 | core/rule_matcher.py | 6 |
| 8 | core/weather.py | 1 |
| 9 | core/risk.py | 1 |
| 10 | core/llm.py | 1 |
| 11 | lambdas/simulate/handler.py | 7, 8, 9, 10 |
| 12 | lambdas/batch/handler.py | 11 |
| 13 | local_server.py | 11 |
| 14 | 프론트엔드 UI | 13 |
| 15 | Terraform 인프라 | 11, 12 |
| 16 | E2E 통합 테스트 | 전체 |

Task 8, 9, 10은 서로 독립적이므로 병렬 실행 가능.

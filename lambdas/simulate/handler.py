"""
simulate Lambda 핸들러 — 매장코드+날짜 → 안전 가이드 생성

POST /api/simulate
Body: { "store_code": 1234, "date": "2026-04-28" }

CUST(고객사고) + EMP(직원사고) 두 소스에 대해:
  1. 기상 데이터 조회 (Open-Meteo)
  2. 리프 매칭 (rule_matcher)
  3. 위험도 산출 (risk)
  4. LLM 안전 가이드 생성 (llm)
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# ── core 모듈 ──
from core.weather import get_weather
from core.rule_retriever import match_incidents_by_rules
from core.llm import generate_guide

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
SOURCES = ["cust", "emp"]
LABEL_COLS = {"cust": "사고유형", "emp": "재해 유형"}

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

CORS_HEADERS = {}  # Function URL CORS 설정이 처리하므로 handler에서는 불필요

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

# ──────────────────────────────────────────────
# S3 로딩 + 로컬 Fallback + 메모리 캐싱
# ──────────────────────────────────────────────
_cache: dict[str, Any] = {}


def _load_json(key: str, local_path: Path) -> Any:
    """S3에서 JSON을 로드하고, 실패 시 로컬 파일에서 로드한다.

    결과는 _cache에 메모리 캐싱된다.
    """
    if key in _cache:
        return _cache[key]

    data = None
    bucket = os.environ.get("MODELS_BUCKET")

    # S3 시도
    if bucket:
        try:
            import boto3

            s3 = boto3.client("s3")
            resp = s3.get_object(Bucket=bucket, Key=key)
            data = json.loads(resp["Body"].read().decode("utf-8"))
            print(f"[load] S3 로드 성공: s3://{bucket}/{key}")
        except Exception as e:
            print(f"[load] S3 로드 실패 ({key}): {e}")

    # 로컬 Fallback
    if data is None:
        fp = PROJECT_ROOT / local_path
        if fp.exists():
            with open(fp, "r", encoding="utf-8") as f:
                data = json.load(f)
            print(f"[load] 로컬 로드: {fp}")
        else:
            raise FileNotFoundError(f"파일을 찾을 수 없습니다: S3({key}), 로컬({fp})")

    _cache[key] = data
    return data


def _load_stores() -> list[dict]:
    """stores.json을 로드한다."""
    return _load_json("stores.json", Path("stores.json"))


def _load_model_files(source: str) -> tuple[dict, dict]:
    """룰 기반 사고 인덱스와 메타데이터를 로드한다."""
    prefix = f"models/{source}"
    rule_incidents = _load_json(
        f"{prefix}/rule_incidents.json", Path(f"models/{source}/rule_incidents.json")
    )
    metadata = _load_json(
        f"{prefix}/metadata.json", Path(f"models/{source}/metadata.json")
    )
    return rule_incidents, metadata


# ──────────────────────────────────────────────
# 피처 구성
# ──────────────────────────────────────────────
def _build_features(
    weather: dict,
    store: dict,
    encoder_map: dict,
) -> dict[str, float]:
    """기상 + 매장 연속형 + 매장 범주형 → 피처 dict 구성.

    - 기상 8개: weather dict에서 직접 추출, None → 0.0
    - 매장 연속형 9개: store dict에서 추출, None → 0.0
    - 매장 범주형 1개: encoder_map의 매핑으로 인코딩 (기본값: 직영점=2)
    """
    features: dict[str, float] = {}

    # 기상 피처
    for feat in WEATHER_FEATURES:
        val = weather.get(feat)
        features[feat] = float(val) if val is not None else 0.0

    # 매장 연속형 피처
    for feat in STORE_NUM_FEATURES:
        val = store.get(feat)
        features[feat] = float(val) if val is not None else 0.0

    # 매장 범주형 피처 (형태)
    store_type = store.get("형태", "직영점")
    type_mapping = encoder_map.get("형태", {})
    default_code = type_mapping.get("직영점", 2)
    features["형태"] = float(type_mapping.get(store_type, default_code))

    return features


# ──────────────────────────────────────────────
# 알림 결과 저장
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))
ALERTS_DIR = PROJECT_ROOT / "alerts"


def _save_alert(response_body: dict, trigger_type: str = "manual") -> str | None:
    """알림 결과를 JSON 파일로 저장한다.

    로컬: alerts/{date}/{store_code}_{timestamp}.json
    AWS:  s3://DAILY_BUCKET/alerts/{date}/{store_code}_{timestamp}.json

    또한 alerts/{date}/index.json에 요약 레코드를 추가한다.

    Returns:
        저장된 파일 키 또는 None
    """
    store_code = response_body.get("store_code", "unknown")
    date_str = response_body.get("date", "unknown")
    ts = int(time.time())
    file_key = f"alerts/{date_str}/{store_code}_{ts}.json"

    # 요약 레코드 (index.json에 추가할 내용)
    cust_result = response_body.get("results", {}).get("cust", {})
    emp_result = response_body.get("results", {}).get("emp", {})

    summary_record = {
        "store_code": store_code,
        "store_name": response_body.get("store_name", ""),
        "region": response_body.get("region", ""),
        "date": date_str,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "trigger_type": trigger_type,
        "주요_위험유형_cust": cust_result.get("guide", {}).get("주요_위험유형", ""),
        "주요_위험유형_emp": emp_result.get("guide", {}).get("주요_위험유형", ""),
        "detail_key": file_key,
    }

    daily_bucket = os.environ.get("DAILY_BUCKET")

    if daily_bucket:
        # AWS: S3에 저장 (alerts는 frontend 버킷에, 나머지는 daily 버킷에)
        frontend_bucket = os.environ.get("FRONTEND_BUCKET") or daily_bucket
        try:
            import boto3
            s3 = boto3.client("s3")

            # 상세 파일 → frontend 버킷 (대시보드에서 직접 접근)
            s3.put_object(
                Bucket=frontend_bucket,
                Key=file_key,
                Body=json.dumps(response_body, ensure_ascii=False, indent=2).encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )

            # index.json → frontend 버킷 (기존 내용에 추가)
            index_key = f"alerts/{date_str}/index.json"
            try:
                resp = s3.get_object(Bucket=frontend_bucket, Key=index_key)
                index_data = json.loads(resp["Body"].read().decode("utf-8"))
            except Exception:
                index_data = []

            index_data.append(summary_record)
            s3.put_object(
                Bucket=frontend_bucket,
                Key=index_key,
                Body=json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
            print(f"[save] S3 저장: s3://{frontend_bucket}/{file_key}")
            return file_key
        except Exception as e:
            print(f"[save] S3 저장 실패: {e}")

    # 로컬: 파일시스템에 저장
    try:
        detail_path = ALERTS_DIR / date_str / f"{store_code}_{ts}.json"
        detail_path.parent.mkdir(parents=True, exist_ok=True)
        with open(detail_path, "w", encoding="utf-8") as f:
            json.dump(response_body, f, ensure_ascii=False, indent=2)

        # index.json 업데이트
        index_path = ALERTS_DIR / date_str / "index.json"
        if index_path.exists():
            with open(index_path, "r", encoding="utf-8") as f:
                index_data = json.load(f)
        else:
            index_data = []

        index_data.append(summary_record)
        with open(index_path, "w", encoding="utf-8") as f:
            json.dump(index_data, f, ensure_ascii=False, indent=2)

        print(f"[save] 로컬 저장: {detail_path}")
        return file_key
    except Exception as e:
        print(f"[save] 로컬 저장 실패: {e}")
        return None


# ──────────────────────────────────────────────
# 응답 헬퍼
# ──────────────────────────────────────────────
def _response(status_code: int, body: Any) -> dict:
    """API Gateway 형식의 응답을 생성한다."""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            **CORS_HEADERS,
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """simulate Lambda 메인 핸들러.

    POST /api/simulate
    Body: { "store_code": 1234, "date": "2026-04-28" }
    """
    # ── CORS preflight ──
    method = event.get("httpMethod", "")
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})

    # ── Body 파싱 ──
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)
        store_code = body.get("store_code")
        date_str = body.get("date")
        if store_code is None or date_str is None:
            return _response(400, {"error": "store_code와 date는 필수입니다."})
        store_code = int(store_code)
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        return _response(400, {"error": f"요청 파싱 실패: {e}"})

    # ── 매장 정보 조회 ──
    try:
        stores = _load_stores()
    except FileNotFoundError as e:
        return _response(500, {"error": str(e)})

    store = None
    for s in stores:
        s_code = s.get("매장")
        if s_code is not None and int(s_code) == store_code:
            store = s
            break

    if store is None:
        return _response(404, {"error": f"매장코드 {store_code}를 찾을 수 없습니다."})

    lat = store.get("위도")
    lon = store.get("경도")
    if lat is None or lon is None:
        return _response(
            400, {"error": f"매장 {store_code}의 위경도 정보가 없습니다."}
        )

    # ── 기상 데이터 조회 ──
    weather = get_weather(float(lat), float(lon), date_str)
    if weather is None:
        weather = {feat: 0.0 for feat in WEATHER_FEATURES}
        print(f"[simulate] 기상 데이터 조회 실패 → 기본값 사용")

    # ── CUST + EMP 처리 ──
    results: dict[str, Any] = {}

    for source in SOURCES:
        try:
            rule_incidents, metadata = _load_model_files(source)
        except FileNotFoundError as e:
            results[source] = {"error": str(e)}
            continue

        label_col = LABEL_COLS.get(source, metadata.get("label_column", "사고유형"))
        limit = int(os.environ.get("RULE_INCIDENT_LIMIT", "50"))
        strategy = os.environ.get("RULE_INCIDENT_STRATEGY", "recent")
        leaf_data = match_incidents_by_rules(
            source,
            store,
            weather,
            rule_incidents.get("incidents", []),
            limit=limit,
            strategy=strategy,
            feature_rules=rule_incidents.get("feature_rules"),
        )
        leaf_id = None
        fallback_level = None

        if leaf_data is None:
            results[source] = {"error": "룰 기반 사례 매칭 실패"}
            continue

        leaf_summary = leaf_data.get("summary", {})
        guide = generate_guide(store, weather, leaf_data, label_col, source)

        # 결과 조립
        matched_rule = leaf_data.get("rule", "")
        incident_count = leaf_summary.get("total", 0)

        results[source] = {
            "leaf_id": str(leaf_id) if leaf_id is not None else None,
            "fallback_level": fallback_level,
            "guide": guide,
            "matched_rule": matched_rule,
            "incident_count": incident_count,
        }

    # ── 응답 조립 ──
    response_body = {
        "store_code": str(store_code),
        "store_name": store.get("매장명", ""),
        "region": store.get("지역", ""),
        "date": date_str,
        "weather": weather,
        "results": results,
    }

    return _response(200, response_body)

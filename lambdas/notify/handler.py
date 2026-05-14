"""
notify Lambda 핸들러 — 여러 매장 안전 가이드 생성 + 발송 기록

POST /api/notify
Body: {
    "store_codes": [1234, 5678, 9012],   # 여러 매장 코드 배열
    "date": "2026-05-06"
}

흐름 (매장별 독립 처리):
  1. S3에서 stores.json + 모델 파일 로드
  2. 각 매장별: 기상 조회 → 리프 매칭 → 위험도 산출 → 가이드 생성
  3. get_notifier(channel) → 발송 (현재: MockNotifier)
  4. 발송 완료 후 S3 alerts/{date}/index.json에 기록

환경변수:
    MODELS_BUCKET   : stores.json + 모델 파일이 있는 S3 버킷
    FRONTEND_BUCKET : alerts/ 기록용 S3 버킷
    NOTIFY_CHANNEL  : "mock" (기본) 또는 "kakao" (나중에)
    BEDROCK_REGION  : Bedrock 리전 (기본 us-east-1)
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

from core.weather import get_weather
from core.rule_matcher import match_with_fallback
from core.llm import generate_guide
from core.notifier import get_notifier

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))

CORS_HEADERS = {}  # Function URL CORS 설정이 처리하므로 handler에서는 불필요

SOURCES = ["cust", "emp"]
LABEL_COLS = {"cust": "사고유형", "emp": "재해 유형"}
SOURCE_LABEL = {"cust": "고객 안전 (CUST)", "emp": "직원 안전 (EMP)"}

WEATHER_FEATURES = [
    "temperature_2m_min", "temperature_2m_max",
    "precipitation_sum", "snowfall_sum", "rain_sum",
    "wind_speed_10m_max", "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]

STORE_NUM_FEATURES = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]

# ──────────────────────────────────────────────
# 응답 헬퍼
# ──────────────────────────────────────────────
def _response(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8", **CORS_HEADERS},
        "body": json.dumps(body, ensure_ascii=False),
    }


# ──────────────────────────────────────────────
# S3 로딩 + 메모리 캐싱
# ──────────────────────────────────────────────
_cache: dict[str, Any] = {}


def _load_json_s3(key: str) -> Any:
    """S3에서 JSON을 로드한다. 결과는 Lambda 컨테이너 수명 동안 캐싱된다."""
    if key in _cache:
        return _cache[key]

    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        raise ValueError("MODELS_BUCKET 환경변수가 설정되지 않았습니다.")

    import boto3
    s3 = boto3.client("s3")
    resp = s3.get_object(Bucket=bucket, Key=key)
    data = json.loads(resp["Body"].read().decode("utf-8"))
    _cache[key] = data
    print(f"[notify] S3 로드: s3://{bucket}/{key}")
    return data


def _load_stores() -> list[dict]:
    return _load_json_s3("stores.json")


def _load_model_files(source: str) -> tuple[dict, dict, dict, dict]:
    prefix = f"models/{source}"
    return (
        _load_json_s3(f"{prefix}/leaf_table.json"),
        _load_json_s3(f"{prefix}/metadata.json"),
        _load_json_s3(f"{prefix}/encoder_map.json"),
        _load_json_s3(f"{prefix}/siblings.json"),
    )


# ──────────────────────────────────────────────
# 피처 구성
# ──────────────────────────────────────────────
def _build_features(weather: dict, store: dict, encoder_map: dict) -> dict[str, float]:
    features: dict[str, float] = {}
    for feat in WEATHER_FEATURES:
        val = weather.get(feat)
        features[feat] = float(val) if val is not None else 0.0
    for feat in STORE_NUM_FEATURES:
        val = store.get(feat)
        features[feat] = float(val) if val is not None else 0.0
    store_type = store.get("형태", "직영점")
    type_mapping = encoder_map.get("형태", {})
    features["형태"] = float(type_mapping.get(store_type, type_mapping.get("직영점", 2)))
    return features


# ──────────────────────────────────────────────
# 단일 매장 가이드 생성
# ──────────────────────────────────────────────
def _generate_store_guide(store: dict, date_str: str) -> dict:
    """한 매장의 안전 가이드를 생성한다."""
    store_code = str(store.get("매장", ""))
    store_name = store.get("매장명", "")
    lat = store.get("위도")
    lon = store.get("경도")

    if lat is None or lon is None:
        return {
            "store_code": store_code,
            "store_name": store_name,
            "error": "위경도 정보 없음",
        }

    weather = get_weather(float(lat), float(lon), date_str)
    if weather is None:
        weather = {feat: 0.0 for feat in WEATHER_FEATURES}
        print(f"[notify] 기상 조회 실패 → 기본값 사용: {store_name}")

    results: dict[str, Any] = {}
    for source in SOURCES:
        try:
            leaf_table, metadata, encoder_map, siblings = _load_model_files(source)
        except Exception as e:
            results[source] = {"error": str(e)}
            continue

        label_col = LABEL_COLS.get(source, metadata.get("label_column", "사고유형"))
        total_incidents = metadata.get("total_incidents", 0)
        features = _build_features(weather, store, encoder_map)
        leaf_id, leaf_data, fallback_level = match_with_fallback(
            features, leaf_table, siblings, metadata
        )
        if leaf_data is None:
            results[source] = {"error": "리프 매칭 실패"}
            continue

        leaf_summary = leaf_data.get("summary", {})
        guide = generate_guide(store, weather, leaf_data, label_col)

        results[source] = {
            "leaf_id": str(leaf_id) if leaf_id is not None else None,
            "fallback_level": fallback_level,
            "guide": guide,
            "matched_rule": leaf_data.get("rule", ""),
            "incident_count": leaf_summary.get("total", 0),
        }

    return {
        "store_code": store_code,
        "store_name": store_name,
        "region": store.get("지역", ""),
        "date": date_str,
        "weather": weather,
        "results": results,
    }


# ──────────────────────────────────────────────
# 메시지 본문 구성
# ──────────────────────────────────────────────
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [f"🏪 {store_name} 안전 가이드", f"📅 날짜: {date_str}", ""]
    for source in SOURCES:
        source_data = results.get(source, {})
        lines.append(f"━━ {SOURCE_LABEL.get(source, source.upper())} ━━")
        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
        else:
            guide = source_data.get("guide", {})
            lines.append(f"⚠️ {guide.get('위험_요약', '정보 없음')}")
            if guide.get("오늘의_특별_주의사항"):
                lines.append("  [오늘 특별 주의]")
                for item in guide["오늘의_특별_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
            if guide.get("상시_주의사항"):
                lines.append("  [상시 주의]")
                for item in guide["상시_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
        lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# 알림 현황 S3 기록
# ──────────────────────────────────────────────
def _record_alert(guide_result: dict, channel: str) -> None:
    """발송 결과를 S3 daily 버킷의 alerts/{date}/index.json에 기록한다."""
    import boto3

    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    if not daily_bucket:
        print("[notify] DAILY_BUCKET 미설정 → 기록 스킵")
        return

    store_code = guide_result.get("store_code", "unknown")
    date_str = guide_result.get("date", "unknown")
    ts = int(time.time())
    file_key = f"alerts/{date_str}/{store_code}_{ts}.json"

    cust = guide_result.get("results", {}).get("cust", {})
    emp = guide_result.get("results", {}).get("emp", {})

    summary_record = {
        "store_code": store_code,
        "store_name": guide_result.get("store_name", ""),
        "region": guide_result.get("region", ""),
        "date": date_str,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "trigger_type": f"manual_send_{channel}",
        "channel": channel,
        "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
        "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
        "detail_key": file_key,
    }

    s3 = boto3.client("s3")

    try:
        s3.put_object(
            Bucket=daily_bucket,
            Key=file_key,
            Body=json.dumps(guide_result, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
    except Exception as e:
        print(f"[notify] 상세 파일 저장 실패: {e}")

    index_key = f"alerts/{date_str}/index.json"
    try:
        resp = s3.get_object(Bucket=daily_bucket, Key=index_key)
        index_data = json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        index_data = []

    index_data.append(summary_record)
    try:
        s3.put_object(
            Bucket=daily_bucket,
            Key=index_key,
            Body=json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[notify] 현황 기록: {store_code} → s3://{daily_bucket}/{index_key}")
    except Exception as e:
        print(f"[notify] index.json 업데이트 실패: {e}")


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """notify Lambda 메인 핸들러.

    POST /api/notify
    Body: { "store_codes": [1234, 5678], "date": "2026-05-06" }
    """
    method = (
        event.get("requestContext", {}).get("http", {}).get("method", "")
        or event.get("httpMethod", "")
    )
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})

    # Body 파싱
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)

        store_codes = body.get("store_codes", [])
        date_str = body.get("date")
        channel = body.get("channel") or os.environ.get("NOTIFY_CHANNEL", "mock")

        if not store_codes or date_str is None:
            return _response(400, {"error": "store_codes(배열)와 date는 필수입니다."})
        if not isinstance(store_codes, list):
            return _response(400, {"error": "store_codes는 배열이어야 합니다."})

        store_codes = [int(c) for c in store_codes]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        return _response(400, {"error": f"요청 파싱 실패: {e}"})

    # stores.json 로드
    try:
        all_stores = _load_stores()
    except Exception as e:
        return _response(500, {"error": f"stores.json 로드 실패: {e}"})

    store_map = {int(s["매장"]): s for s in all_stores if s.get("매장") is not None}

    notifier = get_notifier(channel)

    # 매장별 처리
    store_results = []
    success_count = 0
    failed_count = 0

    for store_code in store_codes:
        store = store_map.get(store_code)
        if store is None:
            store_results.append({
                "store_code": str(store_code),
                "status": "failed",
                "error": f"매장코드 {store_code}를 찾을 수 없습니다.",
            })
            failed_count += 1
            continue

        try:
            # 가이드 생성
            guide_result = _generate_store_guide(store, date_str)

            if "error" in guide_result:
                raise Exception(guide_result["error"])

            store_name = guide_result.get("store_name", str(store_code))

            # 발송 (프로토타입: recipients=[], 카카오 연동 후 직원 연락처 전달)
            recipients: list[str] = []  # TODO: 직원 연락처 DB 연동
            subject = f"[다이소 안전가이드] {store_name} - {date_str}"
            msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
            notifier.send(recipients, subject, msg_body)

            # 현황 기록
            _record_alert(guide_result, channel)

            cust = guide_result.get("results", {}).get("cust", {})
            emp = guide_result.get("results", {}).get("emp", {})

            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": "sent",
                "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
                "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
                "guide_preview": {
                    "cust": cust.get("guide", {}).get("위험_요약", ""),
                    "emp": emp.get("guide", {}).get("위험_요약", ""),
                },
            })
            success_count += 1
            print(f"[notify] 완료: {store_name} ({store_code})")

        except Exception as e:
            store_results.append({
                "store_code": str(store_code),
                "store_name": store.get("매장명", ""),
                "status": "failed",
                "error": str(e),
            })
            failed_count += 1
            print(f"[notify] 실패: {store_code} — {e}")

    return _response(200, {
        "date": date_str,
        "channel": channel,
        "summary": {
            "total": len(store_codes),
            "success": success_count,
            "failed": failed_count,
        },
        "stores": store_results,
        "note": "프로토타입: 실제 발송 없음. 카카오 연동 후 직원 연락처로 실제 발송됩니다.",
    })

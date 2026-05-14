"""
batch-orchestrator Lambda 핸들러

EventBridge 트리거: 매일 06:00 KST (cron(0 21 * * ? *) UTC)

전체 영업 매장 순회 → 안전 가이드 생성 → 발송(MockNotifier) → S3 기록

환경변수:
    MODELS_BUCKET   : stores.json + 모델 파일이 있는 S3 버킷
    FRONTEND_BUCKET : alerts/ 기록용 S3 버킷 (대시보드에서 조회)
    DAILY_BUCKET    : 배치 전체 결과 저장 S3 버킷 (daily/{date}/results.json)
    NOTIFY_CHANNEL  : "mock" (기본) 또는 "kakao" (나중에)
    BEDROCK_REGION  : Bedrock 리전 (기본 us-east-1)
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any

from core.weather import get_weather
from core.rule_retriever import match_incidents_by_rules
from core.llm import generate_guide
from core.notifier import get_notifier

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))

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
# S3 로딩 + 메모리 캐싱
# ──────────────────────────────────────────────
_cache: dict[str, Any] = {}


def _load_json_s3(key: str) -> Any:
    if key in _cache:
        return _cache[key]
    import boto3
    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        raise ValueError("MODELS_BUCKET 환경변수가 설정되지 않았습니다.")
    s3 = boto3.client("s3")
    resp = s3.get_object(Bucket=bucket, Key=key)
    data = json.loads(resp["Body"].read().decode("utf-8"))
    _cache[key] = data
    print(f"[batch] S3 로드: s3://{bucket}/{key}")
    return data


def _load_stores() -> list[dict]:
    return _load_json_s3("stores.json")


def _load_model_files(source: str) -> tuple[dict, dict]:
    prefix = f"models/{source}"
    return (
        _load_json_s3(f"{prefix}/rule_incidents.json"),
        _load_json_s3(f"{prefix}/metadata.json"),
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
    store_code = str(store.get("매장", ""))
    store_name = store.get("매장명", "")
    lat = store.get("위도")
    lon = store.get("경도")

    if lat is None or lon is None:
        return {"store_code": store_code, "store_name": store_name, "error": "위경도 정보 없음"}

    weather = get_weather(float(lat), float(lon), date_str)
    if weather is None:
        weather = {feat: 0.0 for feat in WEATHER_FEATURES}
        print(f"[batch] 기상 조회 실패 → 기본값: {store_name}")

    results: dict[str, Any] = {}
    for source in SOURCES:
        try:
            rule_incidents, metadata = _load_model_files(source)
        except Exception as e:
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
        )
        leaf_id = None
        fallback_level = None
        if leaf_data is None:
            results[source] = {"error": "룰 기반 사례 매칭 실패"}
            continue

        leaf_summary = leaf_data.get("summary", {})
        guide = generate_guide(store, weather, leaf_data, label_col, source)

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
            if guide.get("오늘의_주의사항"):
                lines.append("  [오늘 주의]")
                for item in guide["오늘의_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
            if guide.get("부주의_주의사항"):
                lines.append("  [상시 주의]")
                for item in guide["부주의_주의사항"]:
                    lines.append(f"  ☑️ {item}")
        lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# 알림 현황 S3 기록 (alerts 조회 버킷 — 대시보드 조회용)
# ──────────────────────────────────────────────
def _record_alert(
    s3_client: Any,
    guide_result: dict,
    channel: str,
    trigger_type: str,
) -> None:
    """발송 결과를 alerts/{date}/index.json에 기록한다."""
    alerts_bucket = os.environ.get("FRONTEND_BUCKET") or os.environ.get("DAILY_BUCKET", "")
    if not alerts_bucket:
        print("[batch] FRONTEND_BUCKET/DAILY_BUCKET 미설정 → 기록 스킵")
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
        "trigger_type": trigger_type,   # "batch" 또는 "manual_send_mock" 등
        "channel": channel,
        "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
        "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
        "detail_key": file_key,
    }

    # 상세 파일 저장
    try:
        s3_client.put_object(
            Bucket=alerts_bucket,
            Key=file_key,
            Body=json.dumps(guide_result, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
    except Exception as e:
        print(f"[batch] 상세 파일 저장 실패 ({store_code}): {e}")

    # index.json 업데이트
    index_key = f"alerts/{date_str}/index.json"
    try:
        resp = s3_client.get_object(Bucket=alerts_bucket, Key=index_key)
        index_data = json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        index_data = []

    index_data.append(summary_record)
    try:
        s3_client.put_object(
            Bucket=alerts_bucket,
            Key=index_key,
            Body=json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[batch] 현황 기록: {store_code} → {index_key}")
    except Exception as e:
        print(f"[batch] index.json 업데이트 실패 ({store_code}): {e}")


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """배치 오케스트레이터 Lambda 메인 핸들러.

    EventBridge 트리거: 매일 06:00 KST
    """
    import boto3

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")
    timestamp = now.isoformat(timespec="seconds")
    channel = os.environ.get("NOTIFY_CHANNEL", "mock")

    print(f"[batch] 배치 시작: {timestamp}")

    s3_client = boto3.client("s3")
    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    notifier = get_notifier(channel)

    # stores.json 로드
    try:
        all_stores = _load_stores()
    except Exception as e:
        print(f"[batch] 치명적 오류: {e}")
        return {"date": date_str, "timestamp": timestamp, "error": str(e)}

    # 환경변수 BATCH_STORE_CODES로 대상 매장 지정
    # 형식: "10130,10481,10931,11071,11224" (쉼표 구분 매장코드)
    store_codes_env = os.environ.get("BATCH_STORE_CODES", "")
    if store_codes_env:
        target_codes = {int(c.strip()) for c in store_codes_env.split(",") if c.strip()}
        active_stores = [
            s for s in all_stores
            if s.get("폐점여부") == "영업" and int(s["매장"]) in target_codes
        ]
        print(f"[batch] 지정 매장 {len(target_codes)}개 중 {len(active_stores)}개 영업 확인")
    else:
        # 환경변수 미설정 시 전체 영업 매장 (주의: 매장 수 많음)
        active_stores = [s for s in all_stores if s.get("폐점여부") == "영업"]
        print(f"[batch] 전체 영업 매장: {len(active_stores)}개")

    store_results: list[dict] = []
    success_count = 0
    failed_count = 0

    for store in active_stores:
        store_code = store.get("매장")
        store_name = store.get("매장명", "")
        if store_code is None:
            continue

        try:
            # 가이드 생성
            guide_result = _generate_store_guide(store, date_str)
            if "error" in guide_result:
                raise Exception(guide_result["error"])

            # 발송 (프로토타입: recipients=[], 카카오 연동 후 직원 연락처 전달)
            recipients: list[str] = []  # TODO: 직원 연락처 DB 연동
            subject = f"[다이소 안전가이드] {store_name} - {date_str}"
            msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
            notifier.send(recipients, subject, msg_body)

            # frontend 버킷에 현황 기록 (trigger_type = "batch")
            _record_alert(s3_client, guide_result, channel, trigger_type="batch")

            cust = guide_result.get("results", {}).get("cust", {})
            emp = guide_result.get("results", {}).get("emp", {})

            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": "success",
                "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
                "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
            })
            success_count += 1
            print(f"[batch] 완료: {store_name} ({store_code})")

        except Exception as e:
            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": "failed",
                "error": str(e),
            })
            failed_count += 1
            print(f"[batch] 실패: {store_code} {store_name} — {e}")

    # 배치 전체 결과를 daily 버킷에 저장
    batch_result = {
        "date": date_str,
        "timestamp": timestamp,
        "trigger_type": "batch",
        "channel": channel,
        "summary": {
            "total": len(active_stores),
            "success": success_count,
            "failed": failed_count,
        },
        "stores": store_results,
    }

    if daily_bucket:
        try:
            key = f"daily/{date_str}/results.json"
            s3_client.put_object(
                Bucket=daily_bucket,
                Key=key,
                Body=json.dumps(batch_result, ensure_ascii=False, indent=2).encode("utf-8"),
                ContentType="application/json; charset=utf-8",
            )
            print(f"[batch] 전체 결과 저장: s3://{daily_bucket}/{key}")
        except Exception as e:
            print(f"[batch] 전체 결과 저장 실패: {e}")

    print(
        f"[batch] 완료 — 총 {len(active_stores)}개 매장, "
        f"성공 {success_count}, 실패 {failed_count}"
    )
    return batch_result

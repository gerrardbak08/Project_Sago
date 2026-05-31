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
from core.rule_matcher import match_with_fallback, compute_confidence, expand_with_siblings
from core.llm import generate_guide
from core.notifier import get_notifier
from core.recipients import resolve_recipients
from core.alert_state import (
    get_state as alert_state_get,
    record_sent as alert_state_record_sent,
    should_skip_for_cooldown,
)
from core.media import pick_media_for_results

try:
    from scripts.media_prompts import TARGETS as _MEDIA_TARGETS
    _KNOWN_MEDIA = set(_MEDIA_TARGETS)
except Exception:
    _KNOWN_MEDIA = None

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


def _load_json_s3_optional(key: str, default: Any = None) -> Any:
    """S3에서 JSON을 로드하되 파일이 없으면 default를 반환한다."""
    try:
        return _load_json_s3(key)
    except Exception:
        return default if default is not None else {}


def _load_stores() -> list[dict]:
    return _load_json_s3("stores.json")


def _load_model_files(source: str) -> tuple[dict, dict, dict, dict, dict, dict]:
    prefix = f"models/{source}"
    return (
        _load_json_s3(f"{prefix}/tree_rules.json"),
        _load_json_s3(f"{prefix}/leaf_table.json"),
        _load_json_s3(f"{prefix}/metadata.json"),
        _load_json_s3(f"{prefix}/encoder_map.json"),
        _load_json_s3(f"{prefix}/siblings.json"),
        _load_json_s3_optional(f"{prefix}/calibration.json"),
    )


def _load_recipients() -> dict:
    """recipients.json 로드. 캐시 미사용 — 스키마 편집 즉시 반영. 실패 시 빈 구조."""
    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        return {"default": [], "stores": {}}
    try:
        import boto3
        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=bucket, Key="recipients.json")
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception as e:
        print(f"[batch] recipients.json 로드 실패 (기본값 사용): {e}")
        return {"default": [], "stores": {}}


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
            tree_rules, leaf_table, metadata, encoder_map, siblings, calibration = _load_model_files(
                source
            )
        except Exception as e:
            results[source] = {"error": str(e)}
            continue

        label_col = LABEL_COLS.get(source, metadata.get("label_column", "사고유형"))
        total_incidents = metadata.get("total_incidents", 0)
        features = _build_features(weather, store, encoder_map)
        leaf_id, leaf_data, fallback_level = match_with_fallback(
            features, tree_rules, leaf_table, siblings, metadata
        )
        if leaf_data is None:
            results[source] = {"error": "리프 매칭 실패"}
            continue

        leaf_summary = leaf_data.get("summary", {})
        class_counts = leaf_summary.get(label_col) if fallback_level == 0 else None
        confidence = compute_confidence(
            fallback_level, leaf_summary.get("total", 0), class_counts, calibration
        )
        # cross-leaf 재정렬: level 0이면 직계 형제 리프 사례를 후보 풀에 추가
        # (confidence는 메인 분기 기준으로 위에서 이미 계산)
        if fallback_level == 0:
            leaf_data = expand_with_siblings(leaf_id, leaf_data, leaf_table, siblings)
        guide = generate_guide(store, weather, leaf_data, label_col, confidence)

        results[source] = {
            "leaf_id": str(leaf_id) if leaf_id is not None else None,
            "fallback_level": fallback_level,
            "confidence": confidence,
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
# 심각도 판정 (쿨다운 override 용)
# ──────────────────────────────────────────────
import re as _re

_HIGH_WORD = _re.compile(r"\b(HIGH|HIGH-RISK)\b", _re.IGNORECASE)


def _infer_severity(guide_result: dict) -> str:
    """가이드 결과에서 심각도(high/normal)를 추정한다.

    규칙:
      - results.{cust,emp}.guide.위험_요약 에 "고위험" 또는 단어 경계 HIGH 매칭 → high
      - 또는 incident_count 가 환경변수 ALERT_HIGH_INCIDENT_MIN(기본 50) 이상 → high
      - 예외 발생 시 안전하게 "normal" 반환 — 발송 자체를 막지 않는다.
    """
    try:
        high_min = int(os.environ.get("ALERT_HIGH_INCIDENT_MIN", "50"))
        for src in SOURCES:
            sd = guide_result.get("results", {}).get(src, {})
            summary = (sd.get("guide", {}) or {}).get("위험_요약", "") or ""
            if "고위험" in summary or _HIGH_WORD.search(summary):
                return "high"
            try:
                count = int(sd.get("incident_count", 0) or 0)
            except (TypeError, ValueError):
                count = 0
            if count >= high_min:
                return "high"
    except Exception as e:
        print(f"[batch] 심각도 추정 예외 → normal 폴백: {e}")
    return "normal"


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

    media_urls = pick_media_for_results(results, _KNOWN_MEDIA)
    if media_urls:
        lines.append("🖼️ 안전 일러스트")
        for u in media_urls:
            lines.append(f"  | {u}")
        lines.append("")
    return "\n".join(lines)


# ──────────────────────────────────────────────
# 알림 현황 S3 기록 (frontend 버킷 — 대시보드 조회용)
# ──────────────────────────────────────────────
def _record_alert(
    s3_client: Any,
    guide_result: dict,
    channel: str,
    trigger_type: str,
    delivery: dict | None = None,
) -> None:
    """발송 결과를 frontend 버킷의 alerts/{date}/{store_code}.json 에 저장한다.

    파일 1개 = 매장 1개. 같은 날 재실행 시 덮어씀 (멱등).
    """
    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")
    if not frontend_bucket:
        print("[batch] FRONTEND_BUCKET 미설정 → 기록 스킵")
        return

    store_code = guide_result.get("store_code", "unknown")
    date_str = guide_result.get("date", "unknown")
    file_key = f"alerts/{date_str}/{store_code}.json"

    cust = guide_result.get("results", {}).get("cust", {})
    emp = guide_result.get("results", {}).get("emp", {})

    record = {
        **guide_result,
        "trigger_type": trigger_type,
        "channel": channel,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "delivery_status": delivery.get("status", "not_sent") if delivery else "not_sent",
        "sent_recipients": delivery.get("sent", []) if delivery else [],
        "failed_recipients": delivery.get("failed", []) if delivery else [],
        "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
        "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
        "detail_key": file_key,
    }

    try:
        s3_client.put_object(
            Bucket=frontend_bucket,
            Key=file_key,
            Body=json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[batch] 현황 기록: {store_code} → s3://{frontend_bucket}/{file_key}")
    except Exception as e:
        print(f"[batch] 파일 저장 실패 ({store_code}): {e}")


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
    skipped_count = 0
    cooldown_days = int(os.environ.get("ALERT_COOLDOWN_DAYS", "1"))
    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")

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

            severity = _infer_severity(guide_result)

            # 쿨다운 체크 — high 심각도면 override
            prior_state = alert_state_get(frontend_bucket, store_code)
            skip, reason = should_skip_for_cooldown(
                prior_state, now, cooldown_days, severity
            )
            if skip:
                store_results.append({
                    "store_code": str(store_code),
                    "store_name": store_name,
                    "status": "skipped",
                    "reason": reason,
                    "severity": severity,
                })
                skipped_count += 1
                print(f"[batch] 쿨다운 스킵: {store_name} ({store_code}) — {reason}")
                continue

            # 수신자 조회: 3계층(매장/부서/팀) 리졸버 — 배치는 매장 전체 범위
            recipients_data = _load_recipients()
            receiver_uuids: list[str] = resolve_recipients(
                recipients_data, store_code
            )
            print(
                f"[batch][audit] store={store_code} count={len(receiver_uuids)} "
                f"channel={channel} severity={severity}"
            )

            if channel == "kakao":
                notifier.send_guide(
                    receiver_uuids, store_name, date_str,
                    str(store_code), guide_result.get("results", {}),
                )
            else:
                subject = f"[다이소 안전가이드] {store_name} - {date_str}"
                msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
                notifier.send(receiver_uuids, subject, msg_body)

            # frontend 버킷에 현황 기록 (trigger_type = "batch")
            _record_alert(s3_client, guide_result, channel, trigger_type="batch")

            # 알림 상태 업데이트 (쿨다운/확인 추적용)
            alert_state_record_sent(
                frontend_bucket, store_code, date_str, severity, now
            )

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

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


def _headers(event: dict) -> dict[str, str]:
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _origin_allowed(event: dict) -> bool:
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not allowed:
        return True
    origin = _headers(event).get("origin", "")
    return origin in allowed


def _token_allowed(event: dict, env_name: str) -> bool:
    expected = os.environ.get(env_name, "").strip()
    if not expected:
        return False
    headers = _headers(event)
    auth = headers.get("authorization", "")
    bearer = auth.removeprefix("Bearer ").strip() if auth.startswith("Bearer ") else ""
    return headers.get("x-api-key", "") == expected or bearer == expected


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


def _load_model_files(source: str) -> tuple[dict, dict, dict, dict, dict]:
    prefix = f"models/{source}"
    return (
        _load_json_s3(f"{prefix}/tree_rules.json"),
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
            tree_rules, leaf_table, metadata, encoder_map, siblings = _load_model_files(
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
# 카카오 메시지 구성/발송
# ──────────────────────────────────────────────
def _public_url(path_or_url: str | None) -> str | None:
    if not path_or_url:
        return None
    value = str(path_or_url).strip()
    if not value or value.lower() in {"nan", "none", "null"}:
        return None
    if value.startswith("http"):
        return value

    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    clean_path = value.lstrip("/")
    if clean_path.startswith("frontend/"):
        clean_path = clean_path.removeprefix("frontend/")
    if not clean_path.startswith("images/"):
        clean_path = f"images/{clean_path}"
    if frontend_url:
        return f"{frontend_url}/{clean_path}"
    return None


def _guide_link(store_code: str, date_str: str) -> str:
    frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
    if not frontend_url:
        return "https://www.daiso.co.kr"
    return f"{frontend_url}/#tab=alert_monitor&store={store_code}&date={date_str}"


def _extract_kakao_image_url(upload_result: dict) -> str | None:
    for key in ("url", "image_url", "imageUrl"):
        if upload_result.get(key):
            return upload_result[key]

    infos = upload_result.get("infos")
    if isinstance(infos, dict):
        for info in infos.values():
            if isinstance(info, dict) and info.get("url"):
                return info["url"]
    return None


def _upload_kakao_image(public_image_url: str) -> str:
    access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
    if not access_token:
        raise ValueError("KAKAO_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")

    import requests

    image_resp = requests.get(public_image_url, timeout=15)
    if not image_resp.ok:
        raise ValueError(f"Kakao 이미지 다운로드 실패 HTTP {image_resp.status_code}: {public_image_url}")

    content_type = image_resp.headers.get("Content-Type") or "image/png"
    upload_resp = requests.post(
        "https://kapi.kakao.com/v2/api/talk/message/image/upload",
        headers={"Authorization": f"Bearer {access_token}"},
        files={"file": ("safety-guide.png", image_resp.content, content_type)},
        timeout=20,
    )
    if not upload_resp.ok:
        raise ValueError(f"Kakao 이미지 업로드 실패 HTTP {upload_resp.status_code}: {upload_resp.text}")

    uploaded_url = _extract_kakao_image_url(upload_resp.json())
    if not uploaded_url:
        raise ValueError(f"Kakao 이미지 업로드 응답에서 URL을 찾지 못했습니다: {upload_resp.text}")
    return uploaded_url


def _select_kakao_case(results: dict) -> tuple[str, dict, dict]:
    for source in ("emp", "cust"):
        guide = results.get(source, {}).get("guide", {})
        cases = guide.get("오늘의_주의사항") or []
        if cases:
            return source, guide, cases[0]
    return "emp", results.get("emp", {}).get("guide", {}), {}


def _build_kakao_template(store_name: str, date_str: str, store_code: str, results: dict) -> tuple[str, str]:
    source, guide, case = _select_kakao_case(results)
    title = f"{store_name} 매장 안전 가이드"
    accident = case.get("사고내용") or guide.get("위험_요약") or "오늘의 안전가이드를 확인해주세요."
    rule = case.get("수칙") or ""
    description = accident if not rule else f"{accident}\n{rule}"
    if len(description) > 180:
        description = description[:177].rstrip() + "..."

    public_image_url = _public_url(case.get("image_url"))
    if public_image_url:
        image_url = _upload_kakao_image(public_image_url)
    else:
        image_url = os.environ.get(
            "KAKAO_FALLBACK_IMAGE_URL",
            "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png",
        )
    link_url = _guide_link(store_code, date_str)

    template = {
        "object_type": "feed",
        "content": {
            "title": title,
            "description": description,
            "image_url": image_url,
            "link": {
                "web_url": link_url,
                "mobile_web_url": link_url,
            },
        },
        "buttons": [
            {
                "title": "안전가이드 확인",
                "link": {
                    "web_url": link_url,
                    "mobile_web_url": link_url,
                },
            }
        ],
    }
    return json.dumps(template, ensure_ascii=False, separators=(",", ":")), source


def _send_kakao_friend_message(receiver_uuids: list[str], template_object: str) -> dict:
    if not receiver_uuids:
        return {"sent": [], "failed": []}

    access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
    if not access_token:
        raise ValueError("KAKAO_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")

    import requests

    resp = requests.post(
        "https://kapi.kakao.com/v1/api/talk/friends/message/default/send",
        headers={
            "Authorization": f"Bearer {access_token}",
            "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        data={
            "receiver_uuids": json.dumps(receiver_uuids, ensure_ascii=False, separators=(",", ":")),
            "template_object": template_object,
        },
        timeout=15,
    )
    if not resp.ok:
        raise ValueError(f"Kakao API 오류 HTTP {resp.status_code}: {resp.text}")

    data = resp.json()
    sent = data.get("successful_receiver_uuids", [])
    failed = [uuid for uuid in receiver_uuids if uuid not in sent]
    return {"sent": sent, "failed": failed, "raw": data}


# ──────────────────────────────────────────────
# 알림 현황 S3 기록
# ──────────────────────────────────────────────
def _record_alert(guide_result: dict, channel: str, delivery: dict | None = None) -> None:
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
        "recipients": delivery.get("recipients", []) if delivery else [],
        "sent_recipients": delivery.get("sent", []) if delivery else [],
        "failed_recipients": delivery.get("failed", []) if delivery else [],
        "delivery_status": delivery.get("status", "not_sent") if delivery else "not_sent",
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
    if not _origin_allowed(event):
        return _response(403, {"error": "허용되지 않은 호출 출처입니다."})

    # Body 파싱
    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body)

        store_codes = body.get("store_codes", [])
        date_str = body.get("date")
        channel = str(body.get("channel") or os.environ.get("NOTIFY_CHANNEL", "mock")).strip()
        receiver_uuids = body.get("receiver_uuids", [])
        allowed_channels = {
            c.strip()
            for c in os.environ.get("NOTIFY_ALLOWED_CHANNELS", os.environ.get("NOTIFY_CHANNEL", "mock")).split(",")
            if c.strip()
        }

        if not store_codes or date_str is None:
            return _response(400, {"error": "store_codes(배열)와 date는 필수입니다."})
        if not isinstance(store_codes, list):
            return _response(400, {"error": "store_codes는 배열이어야 합니다."})
        if channel not in allowed_channels:
            return _response(403, {"error": f"허용되지 않은 발송 채널입니다: {channel}"})
        if receiver_uuids and not isinstance(receiver_uuids, list):
            return _response(400, {"error": "receiver_uuids는 배열이어야 합니다."})
        if channel == "kakao" and not receiver_uuids:
            return _response(400, {"error": "카카오 발송에는 receiver_uuids가 필요합니다."})
        if channel == "kakao" and not _token_allowed(event, "MANUAL_SEND_TOKEN"):
            return _response(401, {"error": "카카오 발송에는 서버 설정 인증 토큰이 필요합니다."})

        store_codes = [int(c) for c in store_codes]
        receiver_uuids = [str(u).strip() for u in receiver_uuids if str(u).strip()]
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        return _response(400, {"error": f"요청 파싱 실패: {e}"})

    # stores.json 로드
    try:
        all_stores = _load_stores()
    except Exception as e:
        return _response(500, {"error": f"stores.json 로드 실패: {e}"})

    store_map = {int(s["매장"]): s for s in all_stores if s.get("매장") is not None}

    notifier = None if channel == "kakao" else get_notifier(channel)

    # 매장별 처리
    store_results = []
    success_count = 0
    failed_count = 0

    for store_code in store_codes:
        store = store_map.get(store_code)
        guide_result = None
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

            # 발송
            delivery: dict[str, Any]
            subject = f"[다이소 안전가이드] {store_name} - {date_str}"
            msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
            if channel == "kakao":
                template_object, kakao_source = _build_kakao_template(
                    store_name,
                    date_str,
                    str(store_code),
                    guide_result.get("results", {}),
                )
                send_result = _send_kakao_friend_message(receiver_uuids, template_object)
                delivery = {
                    "channel": "kakao",
                    "source": kakao_source,
                    "recipients": receiver_uuids,
                    "sent": send_result.get("sent", []),
                    "failed": send_result.get("failed", []),
                    "status": "sent" if send_result.get("sent") else "failed",
                    "raw": send_result.get("raw", {}),
                }
            else:
                if notifier is None:
                    raise ValueError(f"지원하지 않는 발송 채널입니다: {channel}")
                send_result = notifier.send([], subject, msg_body)
                delivery = {
                    "channel": channel,
                    "recipients": [],
                    "sent": send_result.get("sent", []),
                    "failed": send_result.get("failed", []),
                    "status": "sent",
                }

            guide_result["delivery"] = delivery

            # 현황 기록
            _record_alert(guide_result, channel, delivery)

            cust = guide_result.get("results", {}).get("cust", {})
            emp = guide_result.get("results", {}).get("emp", {})

            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": delivery.get("status", "sent"),
                "recipients": delivery.get("recipients", []),
                "sent_recipients": delivery.get("sent", []),
                "failed_recipients": delivery.get("failed", []),
                "delivery_source": delivery.get("source", ""),
                "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
                "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
                "guide_preview": {
                    "cust": cust.get("guide", {}).get("위험_요약", ""),
                    "emp": emp.get("guide", {}).get("위험_요약", ""),
                },
            })
            if delivery.get("status") == "sent":
                success_count += 1
            else:
                failed_count += 1
            print(f"[notify] 완료: {store_name} ({store_code})")

        except Exception as e:
            failed_delivery = {
                "channel": channel,
                "recipients": receiver_uuids,
                "sent": [],
                "failed": receiver_uuids,
                "status": "failed",
                "error": str(e),
            }
            if guide_result is not None:
                guide_result["delivery"] = failed_delivery
                _record_alert(guide_result, channel, failed_delivery)
            store_results.append({
                "store_code": str(store_code),
                "store_name": store.get("매장명", ""),
                "status": "failed",
                "recipients": receiver_uuids,
                "sent_recipients": [],
                "failed_recipients": receiver_uuids,
                "error": str(e),
            })
            failed_count += 1
            print(f"[notify] 실패: {store_code} — {e}")

    note = (
        "카카오 선택 시 입력한 친구 UUID로 실제 메시지를 발송합니다."
        if channel == "kakao"
        else "모의 발송 채널입니다. 실제 메시지는 발송하지 않고 결과만 기록합니다."
    )

    return _response(200, {
        "date": date_str,
        "channel": channel,
        "summary": {
            "total": len(store_codes),
            "success": success_count,
            "failed": failed_count,
        },
        "stores": store_results,
        "note": note,
    })

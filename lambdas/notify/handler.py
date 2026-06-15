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
from core.rule_matcher import match_with_fallback, compute_confidence, expand_with_siblings
from core.risk_score import compute_risk_score
from core.llm import generate_guide
from core.notifier import get_notifier, KakaoNotifier
from core.recipients import resolve_recipients
from core.media import pick_media_for_results

_RISKY_GRADES = {"high", "medium", "med"}

try:
    from scripts.media_prompts import TARGETS as _MEDIA_TARGETS
    _KNOWN_MEDIA = set(_MEDIA_TARGETS)
except Exception:
    _KNOWN_MEDIA = None

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


def _load_json_s3_optional(key: str, default: Any = None) -> Any:
    """S3에서 JSON을 로드하되 파일이 없으면 default를 반환한다."""
    try:
        return _load_json_s3(key)
    except Exception:
        return default if default is not None else {}


def _load_stores() -> list[dict]:
    return _load_json_s3("stores.json")


def _load_recipients() -> dict:
    """recipients.json 로드. 캐시 미사용 (스키마 편집 즉시 반영). 실패 시 빈 구조."""
    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        return {"default": [], "stores": {}}
    try:
        import boto3
        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=bucket, Key="recipients.json")
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception as e:
        print(f"[notify] recipients.json 로드 실패 (빈 값 사용): {e}")
        return {"default": [], "stores": {}}


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
            tree_rules, leaf_table, metadata, encoder_map, siblings, calibration = _load_model_files(
                source
            )
        except Exception as e:
            results[source] = {"error": str(e)}
            continue

        label_col = LABEL_COLS.get(source, metadata.get("label_column", "사고유형"))
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
        if fallback_level == 0:
            leaf_data = expand_with_siblings(leaf_id, leaf_data, leaf_table, siblings)

        # 위험 점수 계산
        try:
            policy = metadata.get("risk_policy", {})
            th = None
            if policy.get("theta_score") is not None:
                th = {"theta_score": policy["theta_score"],
                      "theta_high": policy.get("theta_high", policy["theta_score"]),
                      "tau": policy.get("tau", 1.0)}
            sw = _load_json_s3_optional(f"models/{source}/severity_weights.json")
            today_w = {f: float(weather.get(f, 0)) for f in WEATHER_FEATURES if weather.get(f) is not None}
            today_s = {f: float(store.get(f, 0)) for f in STORE_NUM_FEATURES if store.get(f) is not None}
            risk = compute_risk_score(
                rule_str=leaf_data.get("rule", ""),
                class_counts=class_counts,
                incidents=leaf_data.get("incidents", []),
                today_weather=today_w,
                today_store=today_s,
                feature_stats=metadata.get("feature_stats", {}),
                confidence=confidence,
                severity_weights=(sw or {}).get("weights", {}),
                thresholds=th,
                weights=policy.get("weights"),
            )
            cc = class_counts or {}
            risk["dominant_type"] = max(cc, key=cc.get) if cc else ""
        except Exception as e:
            print(f"[notify] risk 계산 실패({source}): {e}")
            risk = {"score": 0, "grade": "low", "trigger": False, "dominant_type": ""}

        guide = generate_guide(store, weather, leaf_data, label_col, confidence)

        results[source] = {
            "leaf_id": str(leaf_id) if leaf_id is not None else None,
            "fallback_level": fallback_level,
            "confidence": confidence,
            "risk": risk,
            "guide": guide,
            "matched_rule": leaf_data.get("rule", ""),
            "incident_count": leaf_summary.get("total", 0),
        }

    # 실제로 위험한 소스만 알림에 포함 (고객/직원 각각 독립 판단)
    triggered = {
        src: data for src, data in results.items()
        if not data.get("error") and (
            data.get("risk", {}).get("trigger")
            or str(data.get("risk", {}).get("grade", "")).lower() in _RISKY_GRADES
        )
    }
    # 수동 발송은 항상 보내되, 위험 소스만 포함 (없으면 원본 그대로 — 대시보드 확인용)
    active_results = triggered if triggered else results

    return {
        "store_code": store_code,
        "store_name": store_name,
        "region": store.get("지역", ""),
        "date": date_str,
        "weather": weather,
        "results": active_results,
        "triggered_sources": list(triggered.keys()),
        "all_low_risk": len(triggered) == 0,
    }


# ──────────────────────────────────────────────
# 메시지 본문 구성
# ──────────────────────────────────────────────
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [f"🏪 {store_name} 안전 가이드", f"📅 날짜: {date_str}", ""]
    active_sources = [s for s in SOURCES if s in results and not results[s].get("error")]
    if not active_sources:
        active_sources = list(results.keys())
    for source in active_sources:
        source_data = results.get(source, {})
        lines.append(f"━━ {SOURCE_LABEL.get(source, source.upper())} ━━")
        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
        else:
            if source_data.get("confidence") == "low":
                lines.append("  ⚠️ [데이터 부족 — 참고용 가설, 운영자 검토 권장]")
            guide = source_data.get("guide", {})
            lines.append(f"⚠️ {guide.get('위험_요약', '정보 없음')}")
            # 신·구 스키마(오늘의_주의사항[].수칙 / 안전_수칙) 양쪽을 notifier와 동일 로직으로 추출
            precautions = KakaoNotifier._precautions(guide) if isinstance(guide, dict) else []
            if precautions:
                lines.append("  [오늘의 안전수칙]")
                for text in precautions:
                    lines.append(f"  ☑️ {text}")
        lines.append("")

    media_urls = pick_media_for_results(results, _KNOWN_MEDIA)
    if media_urls:
        lines.append("🖼️ 안전 일러스트")
        for u in media_urls:
            lines.append(f"  | {u}")
        lines.append("")
    return "\n".join(lines)



# ──────────────────────────────────────────────
# 알림 현황 S3 기록
# ──────────────────────────────────────────────
def _upload_guide_page(guide_result: dict) -> str | None:
    """수신자용 안전가이드 랜딩 페이지(HTML)를 생성해 S3에 업로드한다.

    카드 링크(_guide_link)가 가리키는 guide/{date}/{store}.html 을 실제로 만든다.
    이게 없으면 카드 탭 시 페이지가 없어 대시보드 딥링크로 폴백된다.
    실패해도 발송은 계속되도록 예외를 삼킨다(베스트 에포트).

    캐릭터 모션(.riv)이 FRONTEND_BUCKET/character/ 에 있으면 페이지에서 자동 재생,
    없으면 정지 히어로로 폴백(build_guide_page._rive_stage 참고).
    """
    bucket = os.environ.get("GUIDE_BUCKET") or os.environ.get("FRONTEND_BUCKET", "")
    if not bucket:
        print("[notify] GUIDE_BUCKET/FRONTEND_BUCKET 미설정 → 랜딩페이지 업로드 스킵")
        return None
    try:
        import boto3
        from scripts.build_guide_page import build as build_guide_html

        store_code = guide_result.get("store_code", "unknown")
        date_str = guide_result.get("date", "unknown")
        html_doc = build_guide_html(guide_result)
        key = f"guide/{date_str}/{store_code}.html"
        boto3.client("s3").put_object(
            Bucket=bucket, Key=key,
            Body=html_doc.encode("utf-8"),
            ContentType="text/html; charset=utf-8",
            CacheControl="public, max-age=300",
        )
        print(f"[notify] 랜딩페이지 업로드: s3://{bucket}/{key}")
        return key
    except Exception as e:  # noqa: BLE001 — 베스트 에포트, 발송 차단 금지
        print(f"[notify] 랜딩페이지 생성/업로드 실패(무시): {e}")
        return None


def _record_alert(guide_result: dict, channel: str, delivery: dict | None = None) -> None:
    """발송 결과를 S3 daily 버킷의 alerts/{date}/{store_code}.json 에 저장한다.

    파일 1개 = 매장 1개. 같은 날 재발송 시 덮어씀 (멱등).
    """
    import boto3

    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    if not daily_bucket:
        print("[notify] DAILY_BUCKET 미설정 → 기록 스킵")
        return

    store_code = guide_result.get("store_code", "unknown")
    date_str = guide_result.get("date", "unknown")
    file_key = f"alerts/{date_str}/{store_code}.json"

    cust = guide_result.get("results", {}).get("cust", {})
    emp = guide_result.get("results", {}).get("emp", {})

    # ── 수신자 목록을 구조화된 형태로 변환 ──────────────────────────
    raw_recipients = delivery.get("recipients", []) if delivery else []
    store_name_val = guide_result.get("store_name", "")

    def _enrich_recipient(r: Any, idx: int) -> dict:
        """수신자 항목(str UUID 또는 dict)을 구조화된 dict으로 변환."""
        if isinstance(r, dict):
            return {
                "name": r.get("name") or r.get("성명") or f"수신자{idx + 1}",
                "role": r.get("role") or r.get("직책") or "",
                "team": r.get("team") or r.get("팀") or "",
                "store_name": r.get("store_name") or r.get("매장명") or store_name_val,
            }
        # str (UUID 등) 인 경우 — 이름·직책 정보 없음
        return {
            "name": f"수신자{idx + 1}",
            "role": "",
            "team": "",
            "store_name": store_name_val,
        }

    enriched_recipients = [_enrich_recipient(r, i) for i, r in enumerate(raw_recipients)]

    # ── message_summary ─────────────────────────────────────────────
    cust_risk = cust.get("guide", {}).get("주요_위험유형", "")
    emp_risk = emp.get("guide", {}).get("주요_위험유형", "")
    cust_conf = cust.get("confidence", "")
    if cust_risk or emp_risk:
        parts = []
        if cust_risk:
            parts.append(f"고객: {cust_risk}" + (f" [{cust_conf}]" if cust_conf else ""))
        if emp_risk:
            parts.append(f"직원: {emp_risk}")
        message_summary = " / ".join(parts)
    else:
        message_summary = "안전 알림"

    record = {
        **guide_result,
        "trigger_type": f"manual_send_{channel}",
        "trigger": "manual",
        "channel": channel,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "sent_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "store_name": store_name_val,
        "recipients": enriched_recipients,
        "sent_recipients": delivery.get("sent", []) if delivery else [],
        "failed_recipients": delivery.get("failed", []) if delivery else [],
        "delivery_status": delivery.get("status", "not_sent") if delivery else "not_sent",
        "주요_위험유형_cust": cust_risk,
        "주요_위험유형_emp": emp_risk,
        "message_summary": message_summary,
        "detail_key": file_key,
    }

    s3 = boto3.client("s3")
    try:
        s3.put_object(
            Bucket=daily_bucket,
            Key=file_key,
            Body=json.dumps(record, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[notify] 현황 기록: {store_code} → s3://{daily_bucket}/{file_key}")
    except Exception as e:
        print(f"[notify] 파일 저장 실패: {e}")


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
        # 3계층 타겟 (옵션): 둘 다 None 이면 매장 전체
        target_dept = body.get("dept")
        target_team = body.get("team")
        if target_dept is not None:
            target_dept = str(target_dept).strip() or None
        if target_team is not None:
            target_team = str(target_team).strip() or None
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
        # receiver_uuids 가 비면 recipients.json 에서 매장/부서/팀 단위로 자동 조회
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

    notifier = get_notifier(channel)

    # 매장별 처리
    store_results = []
    success_count = 0
    failed_count = 0

    for store_code in store_codes:
        store = store_map.get(store_code)
        guide_result = None
        # 실패 경로에서도 정확한 수신자 명단을 기록하기 위해 루프 시작 시 선언
        store_recipients: list[str] = list(receiver_uuids) if receiver_uuids else []
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

            # 랜딩 페이지(HTML) 생성·업로드 — 카드 링크가 가리키는 페이지를 미리 만든다
            _upload_guide_page(guide_result)

            # 수신자 결정: 요청에 receiver_uuids 가 있으면 우선, 없으면 3계층 자동 조회
            if receiver_uuids:
                store_recipients = list(receiver_uuids)
                resolved_via = "request"
            else:
                store_recipients = resolve_recipients(
                    _load_recipients(), store_code, target_dept, target_team
                )
                resolved_via = "recipients_json"

            # 발송 범위 감사 로그 — 토큰 인증된 호출자가 의도치 않게 매장 전체로
            # 브로드캐스트하지 않는지 확인할 수 있도록 항상 출력
            print(
                f"[notify][audit] store={store_code} dept={target_dept} "
                f"team={target_team} count={len(store_recipients)} via={resolved_via}"
            )

            if channel == "kakao" and not store_recipients:
                raise Exception(
                    f"수신자 없음 (store={store_code}, dept={target_dept}, team={target_team})"
                )

            # 발송
            delivery: dict[str, Any]
            subject = f"[다이소 안전가이드] {store_name} - {date_str}"
            msg_body = _build_message_body(store_name, date_str, guide_result.get("results", {}))
            if channel == "kakao":
                send_result = notifier.send_guide(
                    store_recipients,
                    store_name,
                    date_str,
                    str(store_code),
                    guide_result.get("results", {}),
                )
                delivery = {
                    "channel": "kakao",
                    "recipients": store_recipients,
                    "sent": send_result.get("sent", []),
                    "failed": send_result.get("failed", []),
                    "status": "sent" if send_result.get("sent") else "failed",
                    "raw": send_result.get("raw", {}),
                    "scope": {"dept": target_dept, "team": target_team},
                }
            else:
                send_result = notifier.send([], subject, msg_body)
                delivery = {
                    "channel": channel,
                    "recipients": store_recipients,
                    "sent": send_result.get("sent", []),
                    "failed": send_result.get("failed", []),
                    "status": "sent",
                    "scope": {"dept": target_dept, "team": target_team},
                }

            guide_result["delivery"] = delivery

            # 현황 기록
            _record_alert(guide_result, channel, delivery)

            cust = guide_result.get("results", {}).get("cust", {})
            emp = guide_result.get("results", {}).get("emp", {})

            triggered_srcs = guide_result.get("triggered_sources", list(guide_result.get("results", {}).keys()))
            store_results.append({
                "store_code": str(store_code),
                "store_name": store_name,
                "status": delivery.get("status", "sent"),
                "triggered_sources": triggered_srcs,
                "all_low_risk": guide_result.get("all_low_risk", False),
                "recipients": delivery.get("recipients", []),
                "sent_recipients": delivery.get("sent", []),
                "failed_recipients": delivery.get("failed", []),
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
                "recipients": store_recipients,
                "sent": [],
                "failed": store_recipients,
                "status": "failed",
                "error": str(e),
                "scope": {"dept": target_dept, "team": target_team},
            }
            if guide_result is not None:
                guide_result["delivery"] = failed_delivery
                _record_alert(guide_result, channel, failed_delivery)
            store_results.append({
                "store_code": str(store_code),
                "store_name": store.get("매장명", ""),
                "status": "failed",
                "recipients": store_recipients,
                "sent_recipients": [],
                "failed_recipients": store_recipients,
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

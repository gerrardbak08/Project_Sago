"""
notify Lambda 핸들러 — 안전 가이드 생성 + 발송 기록

POST /api/notify
Body: {
    "store_code": 1234,
    "date": "2026-05-06"
}

흐름:
  1. simulate Lambda 내부 호출 → 안전 가이드 생성
  2. get_notifier(channel) → 발송 (현재: MockNotifier, 나중에: KakaoNotifier)
  3. 발송 결과를 S3 alerts/{date}/index.json에 기록

프로토타입 단계:
  - 실제 메시지 전송 없음 (MockNotifier)
  - 매장 직원 연락처 미등록 → recipients = []
  - 카카오 연동 후 KakaoNotifier + 직원 연락처 DB 연결
"""

from __future__ import annotations

import json
import os
import time
from datetime import datetime, timezone, timedelta
from typing import Any

from core.notifier import get_notifier

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}

SOURCES = ["cust", "emp"]
SOURCE_LABEL = {"cust": "고객 안전 (CUST)", "emp": "직원 안전 (EMP)"}


# ──────────────────────────────────────────────
# 응답 헬퍼
# ──────────────────────────────────────────────
def _response(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            **CORS_HEADERS,
        },
        "body": json.dumps(body, ensure_ascii=False),
    }


# ──────────────────────────────────────────────
# simulate Lambda 내부 호출
# ──────────────────────────────────────────────
def _invoke_simulate(store_code: int, date_str: str) -> dict:
    """simulate Lambda를 동기 호출하고 결과 body를 반환한다."""
    import boto3

    function_name = os.environ.get("SIMULATE_FUNCTION", "")
    if not function_name:
        raise ValueError("SIMULATE_FUNCTION 환경변수가 설정되지 않았습니다.")

    client = boto3.client("lambda")
    payload = {
        "httpMethod": "POST",
        "body": json.dumps({"store_code": store_code, "date": date_str}),
    }

    resp = client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )

    resp_payload = json.loads(resp["Payload"].read().decode("utf-8"))

    if "FunctionError" in resp:
        raise Exception(
            f"simulate Lambda 오류: {resp_payload.get('errorMessage', resp_payload)}"
        )

    status_code = resp_payload.get("statusCode", 500)
    body = resp_payload.get("body", "{}")
    if isinstance(body, str):
        body = json.loads(body)

    if status_code != 200:
        raise Exception(f"simulate 응답 오류 (HTTP {status_code}): {body}")

    return body


# ──────────────────────────────────────────────
# 메시지 본문 구성
# ──────────────────────────────────────────────
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [
        f"🏪 {store_name} 안전 가이드",
        f"📅 날짜: {date_str}",
        "",
    ]

    for source in SOURCES:
        source_data = results.get(source, {})
        label = SOURCE_LABEL.get(source, source.upper())
        lines.append(f"━━ {label} ━━")

        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
            lines.append("")
            continue

        guide = source_data.get("guide", {})
        risk_summary = guide.get("위험_요약", "정보 없음")
        lines.append(f"⚠️ {risk_summary}")

        tips = guide.get("안전_수칙", [])
        for tip in tips:
            lines.append(f"  ☑️ {tip}")

        lines.append("")

    return "\n".join(lines)


# ──────────────────────────────────────────────
# 알림 현황 S3 기록
# ──────────────────────────────────────────────
def _record_alert(
    sim_result: dict,
    sent: list[str],
    failed: list[str],
    channel: str,
) -> None:
    """발송 결과를 S3 frontend 버킷의 alerts/{date}/index.json에 기록한다."""
    import boto3

    frontend_bucket = os.environ.get("FRONTEND_BUCKET", "")
    if not frontend_bucket:
        print("[notify] FRONTEND_BUCKET 미설정 → 기록 스킵")
        return

    store_code = sim_result.get("store_code", "unknown")
    date_str = sim_result.get("date", "unknown")
    ts = int(time.time())
    file_key = f"alerts/{date_str}/{store_code}_{ts}.json"

    cust_result = sim_result.get("results", {}).get("cust", {})
    emp_result = sim_result.get("results", {}).get("emp", {})

    summary_record = {
        "store_code": store_code,
        "store_name": sim_result.get("store_name", ""),
        "region": sim_result.get("region", ""),
        "date": date_str,
        "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
        "trigger_type": f"manual_send_{channel}",
        "channel": channel,
        "sent_to": sent,
        "send_failed": failed,
        "risk_cust": cust_result.get("risk", {}).get("grade", ""),
        "risk_cust_score": cust_result.get("risk", {}).get("score", 0),
        "risk_emp": emp_result.get("risk", {}).get("grade", ""),
        "risk_emp_score": emp_result.get("risk", {}).get("score", 0),
        "dominant_type_cust": cust_result.get("risk", {}).get("dominant_type", ""),
        "dominant_type_emp": emp_result.get("risk", {}).get("dominant_type", ""),
        "detail_key": file_key,
    }

    s3 = boto3.client("s3")

    # 상세 파일 저장
    try:
        s3.put_object(
            Bucket=frontend_bucket,
            Key=file_key,
            Body=json.dumps(sim_result, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
    except Exception as e:
        print(f"[notify] 상세 파일 저장 실패: {e}")

    # index.json 업데이트
    index_key = f"alerts/{date_str}/index.json"
    try:
        resp = s3.get_object(Bucket=frontend_bucket, Key=index_key)
        index_data = json.loads(resp["Body"].read().decode("utf-8"))
    except Exception:
        index_data = []

    index_data.append(summary_record)

    try:
        s3.put_object(
            Bucket=frontend_bucket,
            Key=index_key,
            Body=json.dumps(index_data, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        print(f"[notify] 현황 기록 완료: s3://{frontend_bucket}/{index_key}")
    except Exception as e:
        print(f"[notify] index.json 업데이트 실패: {e}")


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """notify Lambda 메인 핸들러.

    POST /api/notify
    Body: { "store_code": 1234, "date": "2026-05-06" }
    """
    # CORS preflight
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
        store_code = body.get("store_code")
        date_str = body.get("date")
        channel = body.get("channel") or os.environ.get("NOTIFY_CHANNEL", "mock")

        if store_code is None or date_str is None:
            return _response(400, {"error": "store_code와 date는 필수입니다."})

        store_code = int(store_code)
    except (json.JSONDecodeError, ValueError, TypeError) as e:
        return _response(400, {"error": f"요청 파싱 실패: {e}"})

    # 1. simulate 호출 → 안전 가이드 생성
    try:
        sim_result = _invoke_simulate(store_code, date_str)
    except Exception as e:
        return _response(500, {"error": f"안전 가이드 생성 실패: {e}"})

    store_name = sim_result.get("store_name", str(store_code))

    # 2. 발송 (프로토타입: recipients 없음 → MockNotifier가 빈 목록 처리)
    # 나중에 카카오 연동 시: 직원 연락처 DB에서 recipients 조회 후 전달
    recipients: list[str] = []  # TODO: 직원 연락처 DB 연동 후 채울 것

    subject = f"[다이소 안전가이드] {store_name} - {date_str}"
    message_body = _build_message_body(store_name, date_str, sim_result.get("results", {}))

    try:
        notifier = get_notifier(channel)
        send_result = notifier.send(recipients, subject, message_body)
    except Exception as e:
        return _response(500, {"error": f"발송 처리 실패: {e}"})

    sent = send_result.get("sent", [])
    failed = send_result.get("failed", [])

    # 3. 현황 기록 (발송 처리 완료 시 항상 기록)
    _record_alert(sim_result, sent, failed, channel)

    return _response(200, {
        "store_code": str(store_code),
        "store_name": store_name,
        "date": date_str,
        "channel": channel,
        "status": "sent",
        "recipients_count": len(recipients),
        "note": "프로토타입: 실제 발송 없음. 카카오 연동 후 직원 연락처로 실제 발송됩니다.",
        "guide_preview": {
            "cust": sim_result.get("results", {}).get("cust", {}).get("guide", {}).get("위험_요약", ""),
            "emp": sim_result.get("results", {}).get("emp", {}).get("guide", {}).get("위험_요약", ""),
        },
    })

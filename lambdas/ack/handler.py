"""
ack Lambda — 카카오 비즈 알림톡 버튼 콜백 수신 → 알림 상태 갱신

POST /api/ack
Body:
  {
    "store_code": "10130",
    "actor": "<uuid>",
    "status": "viewed" | "acknowledged",
    "message_id": "10130-2026-05-27"   # 옵션 — 검증용
  }

환경변수:
    FRONTEND_BUCKET : alert_state/{store_code}.json 가 있는 버킷
    ACK_TOKEN       : (옵션) X-API-Key 헤더로 전달되는 공유 비밀
    ALLOWED_ORIGINS : (옵션) CORS Origin 화이트리스트
"""

from __future__ import annotations

import json
import os
from typing import Any

from core.alert_state import record_ack, get_state


VALID_STATUSES = {"viewed", "acknowledged"}


def _headers(event: dict) -> dict[str, str]:
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _origin_allowed(event: dict) -> bool:
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not allowed:
        return True
    origin = _headers(event).get("origin", "")
    # 카카오 비즈 webhook 처럼 Origin 헤더가 없는 server-to-server 호출은 CORS 검사 우회.
    # (CORS 는 브라우저용 — 토큰 인증으로 보호)
    if not origin:
        return True
    return origin in allowed


def _token_allowed(event: dict) -> bool:
    """ACK_TOKEN 환경변수가 있으면 X-API-Key 일치 여부, 없으면 기본 거부.

    개발/테스트에서만 ACK_TOKEN_ALLOW_EMPTY=1 로 우회 가능.
    """
    expected = os.environ.get("ACK_TOKEN", "").strip()
    if not expected:
        return os.environ.get("ACK_TOKEN_ALLOW_EMPTY", "") == "1"
    headers = _headers(event)
    return headers.get("x-api-key", "") == expected


def _response(status: int, body: Any) -> dict:
    return {
        "statusCode": status,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def lambda_handler(event: dict, context: Any) -> dict:
    method = (
        event.get("requestContext", {}).get("http", {}).get("method", "")
        or event.get("httpMethod", "")
    )
    if method == "OPTIONS":
        return _response(200, {"ok": True})
    if not _origin_allowed(event):
        return _response(403, {"error": "origin not allowed"})
    if not _token_allowed(event):
        return _response(401, {"error": "auth token required"})

    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body or "{}")
        store_code = str(body.get("store_code", "")).strip()
        actor = str(body.get("actor", "")).strip()
        status = str(body.get("status", "")).strip()
        raw_mid = body.get("message_id")
        expected_message_id = str(raw_mid).strip() if raw_mid is not None else None
    except (json.JSONDecodeError, TypeError) as e:
        return _response(400, {"error": f"요청 파싱 실패: {e}"})

    if not store_code:
        return _response(400, {"error": "store_code 필수"})
    if not actor:
        return _response(400, {"error": "actor 필수"})
    if status not in VALID_STATUSES:
        return _response(400, {"error": f"status 는 {VALID_STATUSES} 중 하나여야 합니다."})

    bucket = os.environ.get("FRONTEND_BUCKET", "")
    if not bucket:
        return _response(500, {"error": "FRONTEND_BUCKET 미설정"})

    # 옵션: message_id 일치 검증 — 만료된 알림 응답 무시 (요청 거절)
    if expected_message_id:
        current = get_state(bucket, store_code) or {}
        last_id = current.get("last_message_id")
        if last_id and last_id != expected_message_id:
            return _response(409, {
                "error": "stale message_id",
                "expected": expected_message_id,
                "current": last_id,
            })

    new_state = record_ack(
        bucket, store_code, actor=actor, status=status,
        message_id=expected_message_id,
    )
    if new_state is None:
        return _response(500, {"error": "상태 저장 실패"})

    redacted_actor = actor[:4] + "***" if len(actor) > 4 else "***"
    print(f"[ack][audit] store={store_code} actor={redacted_actor} status={status}")
    return _response(200, {
        "ok": True,
        "store_code": store_code,
        "ack_status": new_state.get("ack_status"),
        "ack_at": new_state.get("ack_at"),
    })

"""
core/alert_state.py — 매장별 알림 상태(쿨다운/확인) 저장소

S3 경로: s3://{FRONTEND_BUCKET}/alert_state/{store_code}.json

스키마:
{
  "store_code": "10130",
  "last_sent_at": "2026-05-27T06:00:00+09:00",
  "last_message_id": "10130-2026-05-27",
  "last_severity": "high" | "normal",
  "ack_status": "pending" | "viewed" | "acknowledged",
  "ack_at": null | ISO timestamp,
  "ack_history": [
    {"at": "...", "status": "viewed", "actor": "uuid_xxx"}
  ]
}

캐시 없음 — 매 호출 fresh fetch.
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timedelta, timezone
from typing import Any

KST = timezone(timedelta(hours=9))

ALERT_STATE_PREFIX = "alert_state"


def _s3_client():
    import boto3
    return boto3.client("s3")


def _state_key(store_code: str | int) -> str:
    return f"{ALERT_STATE_PREFIX}/{str(store_code).strip()}.json"


def get_state(bucket: str, store_code: str | int) -> dict | None:
    """매장 알림 상태 반환. 파일 없으면 None."""
    if not bucket:
        return None
    try:
        s3 = _s3_client()
        resp = s3.get_object(Bucket=bucket, Key=_state_key(store_code))
        return json.loads(resp["Body"].read().decode("utf-8"))
    except Exception as e:
        # botocore ClientError 의 표준 NoSuchKey 식별
        code = getattr(getattr(e, "response", None), "get", lambda *_: None)("Error") or {}
        if isinstance(code, dict) and code.get("Code") in ("NoSuchKey", "404"):
            return None
        # 문자열 매칭 폴백 (boto3 미사용 환경/mock)
        msg = str(e)
        if "NoSuchKey" in msg or "Not Found" in msg or "404" in msg:
            return None
        print(f"[alert_state] 조회 실패 ({store_code}): {e}")
        return None


def put_state(bucket: str, store_code: str | int, state: dict) -> bool:
    if not bucket:
        return False
    try:
        s3 = _s3_client()
        s3.put_object(
            Bucket=bucket,
            Key=_state_key(store_code),
            Body=json.dumps(state, ensure_ascii=False, indent=2).encode("utf-8"),
            ContentType="application/json; charset=utf-8",
        )
        return True
    except Exception as e:
        print(f"[alert_state] 저장 실패 ({store_code}): {e}")
        return False


def should_skip_for_cooldown(
    state: dict | None,
    now: datetime,
    cooldown_days: int,
    severity: str = "normal",
) -> tuple[bool, str]:
    """쿨다운 적용 여부 판단.

    Returns (skip, reason). severity == "high" 면 항상 (False, "severity_override").
    """
    if severity == "high":
        return False, "severity_override"
    if cooldown_days <= 0:
        return False, "cooldown_disabled"
    if not state:
        return False, "no_prior_state"
    last = state.get("last_sent_at")
    if not last:
        return False, "no_last_sent"
    try:
        last_dt = datetime.fromisoformat(last)
    except Exception:
        return False, "unparseable_last_sent"
    elapsed = now - last_dt
    # 미래 타임스탬프(시계 스큐/오작성)는 쿨다운으로 잡지 않는다 — 영구 락 방지
    if elapsed.total_seconds() < 0:
        return False, "clock_skew_future_timestamp"
    if elapsed < timedelta(days=cooldown_days):
        return True, f"within_cooldown:{elapsed}"
    return False, "elapsed"


def record_sent(
    bucket: str,
    store_code: str | int,
    date_str: str,
    severity: str,
    now: datetime | None = None,
) -> dict:
    """발송 직후 호출. 새 상태 dict 를 반환·저장한다."""
    now = now or datetime.now(KST)
    message_id = f"{store_code}-{date_str}"
    state = {
        "store_code": str(store_code),
        "last_sent_at": now.isoformat(timespec="seconds"),
        "last_message_id": message_id,
        "last_severity": severity,
        "ack_status": "pending",
        "ack_at": None,
        "ack_history": [],
    }
    put_state(bucket, store_code, state)
    return state


_STATUS_RANK = {"pending": 0, "viewed": 1, "acknowledged": 2}


def record_ack(
    bucket: str,
    store_code: str | int,
    actor: str,
    status: str = "acknowledged",
    message_id: str | None = None,
    now: datetime | None = None,
) -> dict | None:
    """수신자 응답(버튼 클릭) 기록. status: "viewed" | "acknowledged".

    message_id 가 주어지고 현재 last_message_id 와 다르면 stale 로 간주,
    history 에는 stale 플래그로 기록하되 ack_status 는 갱신하지 않는다.
    """
    if status not in ("viewed", "acknowledged"):
        raise ValueError(f"invalid ack status: {status}")
    now = now or datetime.now(KST)
    state = get_state(bucket, store_code) or {
        "store_code": str(store_code),
        "ack_history": [],
        "ack_status": "pending",
    }
    last_id = state.get("last_message_id")
    is_stale = bool(message_id and last_id and last_id != message_id)

    history = list(state.get("ack_history") or [])
    history.append({
        "at": now.isoformat(timespec="seconds"),
        "status": status,
        "actor": str(actor),
        "message_id": message_id,
        "stale": is_stale,
    })
    state["ack_history"] = history

    if is_stale:
        put_state(bucket, store_code, state)
        return state

    # 상태 승격: 더 강한 상태(rank 높은 쪽)만 반영
    current = state.get("ack_status") or "pending"
    if _STATUS_RANK.get(status, 0) > _STATUS_RANK.get(current, 0):
        state["ack_status"] = status
    if status == "acknowledged" and not state.get("ack_at"):
        state["ack_at"] = now.isoformat(timespec="seconds")
    put_state(bucket, store_code, state)
    return state

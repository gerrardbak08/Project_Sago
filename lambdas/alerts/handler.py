"""
alerts Lambda 핸들러 — 알림 현황 조회 (Lambda Function URL)

호출 방식:
  GET {alerts_url}/{date}               → alerts/{date}/index.json 반환
  GET {alerts_url}/{date}/{filename}    → alerts/{date}/{filename} 반환
  GET {alerts_url}?type=daily&date=YYYY-MM-DD → daily/{date}/results.json 반환

환경변수:
    DAILY_BUCKET  : alerts/ 및 daily/ 데이터가 저장된 S3 버킷 (읽기 전용)
    MODELS_BUCKET : DAILY_BUCKET 미설정 시 폴백 버킷
"""

from __future__ import annotations

import json
import os
from typing import Any

CORS_HEADERS = {}  # Function URL CORS 설정이 처리하므로 handler에서는 불필요


def _headers(event: dict) -> dict[str, str]:
    return {str(k).lower(): str(v) for k, v in (event.get("headers") or {}).items()}


def _origin_allowed(event: dict) -> bool:
    allowed = [o.strip() for o in os.environ.get("ALLOWED_ORIGINS", "").split(",") if o.strip()]
    if not allowed:
        return True
    origin = _headers(event).get("origin", "")
    return origin in allowed


def _response(status_code: int, body: Any) -> dict:
    # Lambda Function URL: statusCode와 body를 그대로 반환하면
    # Function URL이 자동으로 HTTP 응답으로 변환해줌
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8", **CORS_HEADERS},
        "body": json.dumps(body, ensure_ascii=False),
    }


def _get_s3_json(key: str) -> Any:
    import boto3
    bucket = os.environ.get("DAILY_BUCKET", "")
    if not bucket:
        raise ValueError("DAILY_BUCKET 환경변수가 설정되지 않았습니다.")
    s3 = boto3.client("s3")
    resp = s3.get_object(Bucket=bucket, Key=key)
    return json.loads(resp["Body"].read().decode("utf-8"))


def _today_str() -> str:
    from datetime import datetime, timezone
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def _handle_daily_results(event: dict) -> dict:
    """?type=daily&date=YYYY-MM-DD → daily/{date}/results.json 반환."""
    qs = event.get("queryStringParameters") or {}
    date_str = qs.get("date") or _today_str()
    s3_key = f"daily/{date_str}/results.json"
    try:
        data = _get_s3_json(s3_key)
        items = data if isinstance(data, list) else data.get("items", data.get("results", []))
        return _response(200, items)
    except Exception as e:
        err_str = str(e)
        if "NoSuchKey" in err_str or "404" in err_str:
            # 배치 미실행 날짜이면 빈 배열 반환 (200)
            return _response(200, [])
        return _response(500, {"error": f"데이터 조회 실패: {err_str}"})


def lambda_handler(event: dict, context: Any) -> dict:  # noqa: ARG001
    """alerts Lambda 메인 핸들러 (Lambda Function URL)."""
    # CORS preflight
    method = (
        event.get("requestContext", {}).get("http", {}).get("method", "")
        or event.get("httpMethod", "")
    )
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})
    if not _origin_allowed(event):
        return _response(403, {"error": "허용되지 않은 호출 출처입니다."})

    # ?type=daily 라우트 — 경로 분기 전에 처리
    qs = event.get("queryStringParameters") or {}
    if qs.get("type") == "daily":
        return _handle_daily_results(event)

    # Function URL: rawPath = "/{date}" 또는 "/{date}/{filename}"
    raw_path = event.get("rawPath", "") or event.get("path", "")
    # 앞의 "/" 제거 후 분리
    parts = [p for p in raw_path.strip("/").split("/") if p]

    if not parts:
        return _response(400, {"error": "날짜를 경로에 포함해주세요. 예: /{date}"})

    date_str = parts[0]
    filename = parts[1] if len(parts) >= 2 else ""

    s3_key = f"alerts/{date_str}/{filename}" if filename else f"alerts/{date_str}/index.json"

    try:
        data = _get_s3_json(s3_key)
        return _response(200, data)
    except Exception as e:
        err_str = str(e)
        if "NoSuchKey" in err_str or "404" in err_str:
            return _response(404, {"error": f"{date_str} 날짜의 알림 데이터가 없습니다."})
        return _response(500, {"error": f"데이터 조회 실패: {err_str}"})

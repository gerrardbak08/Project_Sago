"""
alerts Lambda 핸들러 — 알림 현황 조회

GET /api/alerts/{date}           → daily 버킷 alerts/{date}/index.json 반환
GET /api/alerts/{date}/{filename} → daily 버킷 alerts/{date}/{filename} 반환

환경변수:
    DAILY_BUCKET : alerts/ 데이터가 저장된 S3 버킷 (읽기 전용)
"""

from __future__ import annotations

import json
import os
from typing import Any

CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def _response(status_code: int, body: Any) -> dict:
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


def lambda_handler(event: dict, context: Any) -> dict:
    """alerts Lambda 메인 핸들러."""
    # CORS preflight
    method = (
        event.get("requestContext", {}).get("http", {}).get("method", "")
        or event.get("httpMethod", "")
        or event.get("requestContext", {}).get("httpMethod", "")
    )
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})

    # 경로 파라미터 추출 (API Gateway v2 + v1 모두 지원)
    path_params = event.get("pathParameters") or {}
    date_str = path_params.get("date", "")
    filename = path_params.get("filename", "")  # 없으면 index.json 조회

    if not date_str:
        return _response(400, {"error": "date 경로 파라미터가 필요합니다."})

    # S3 키 결정
    if filename:
        s3_key = f"alerts/{date_str}/{filename}"
    else:
        s3_key = f"alerts/{date_str}/index.json"

    try:
        data = _get_s3_json(s3_key)
        return _response(200, data)
    except Exception as e:
        err_str = str(e)
        if "NoSuchKey" in err_str or "404" in err_str:
            return _response(404, {"error": f"{date_str} 날짜의 알림 데이터가 없습니다."})
        return _response(500, {"error": f"데이터 조회 실패: {err_str}"})

"""
ai Lambda 핸들러 — 대시보드 AI 요약·안전가이드 생성 (Bedrock Claude).

POST  (Lambda Function URL)
Body: { "prompt": "...", "system": "(선택)", "max_tokens": 2048 }
응답: { "text": "...생성된 마크다운..." }

브라우저가 Gemini를 직접 호출하던 구조를 대체한다. 브라우저 → 이 Lambda → Bedrock.
Lambda 는 IAM 역할로 Bedrock 을 호출하므로 클라이언트에 API 키가 노출되지 않는다.

환경변수:
    BEDROCK_MODEL_ID : Claude 모델 ID (기본 us.anthropic.claude-sonnet-4-6)
    BEDROCK_REGION   : Bedrock 리전 (기본 us-east-1)
"""

from __future__ import annotations

import json
import os
from typing import Any

import boto3

_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6")
_REGION = (
    os.environ.get("BEDROCK_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "us-east-1"
)

_DEFAULT_SYSTEM = (
    "당신은 ㈜아성다이소 안전보건 전문가입니다. 매장 안전사고 데이터를 바탕으로 "
    "현장 관리자가 즉시 실행할 수 있는 구체적이고 실용적인 한국어 안전 가이드를 "
    "작성합니다. 마크다운으로 간결하게 작성하세요."
)

# Function URL 은 인증 없이 공개되므로 과도한 입력으로 인한 Bedrock 비용 폭주 방지용 상한.
_MAX_PROMPT_CHARS = 20000


def _response(status_code: int, body: Any) -> dict:
    return {
        "statusCode": status_code,
        "headers": {"Content-Type": "application/json; charset=utf-8"},
        "body": json.dumps(body, ensure_ascii=False),
    }


def lambda_handler(event: dict, context: Any) -> dict:
    method = (
        event.get("requestContext", {}).get("http", {}).get("method", "")
        or event.get("httpMethod", "")
    )
    if method == "OPTIONS":
        return _response(200, {"message": "OK"})

    try:
        body = event.get("body", "{}")
        if isinstance(body, str):
            body = json.loads(body or "{}")

        prompt = (body.get("prompt") or "").strip()
        if not prompt:
            return _response(400, {"error": "prompt는 필수입니다."})
        if len(prompt) > _MAX_PROMPT_CHARS:
            return _response(400, {"error": f"prompt가 너무 깁니다 (최대 {_MAX_PROMPT_CHARS}자)."})

        system_prompt = (body.get("system") or _DEFAULT_SYSTEM).strip()
        try:
            max_tokens = int(body.get("max_tokens", 2048))
        except (TypeError, ValueError):
            max_tokens = 2048
        max_tokens = max(256, min(max_tokens, 8192))
    except (json.JSONDecodeError, AttributeError) as e:
        return _response(400, {"error": f"요청 본문 파싱 실패: {e}"})

    try:
        client = boto3.client("bedrock-runtime", region_name=_REGION)
        response = client.converse(
            modelId=_MODEL_ID,
            system=[{"text": system_prompt}],
            messages=[{"role": "user", "content": [{"text": prompt}]}],
            inferenceConfig={"maxTokens": max_tokens, "temperature": 0.4},
        )
        content = response["output"]["message"]["content"]
        text = "".join(block.get("text", "") for block in content).strip()
        if not text:
            return _response(502, {"error": "Bedrock 응답이 비어 있습니다."})
        return _response(200, {"text": text})
    except Exception as e:  # noqa: BLE001
        return _response(502, {"error": f"Bedrock 호출 실패: {e}"})

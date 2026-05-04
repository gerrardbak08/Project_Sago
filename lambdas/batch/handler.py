"""
batch-orchestrator Lambda 핸들러

EventBridge 트리거: 매일 06:00 KST (cron(0 21 * * ? *) UTC)

전체 매장 순회 → simulate Lambda 동기 호출 → 결과 수집 → S3 저장 → SES 이메일 발송

환경변수:
    MODELS_BUCKET   : stores.json이 있는 S3 버킷
    DAILY_BUCKET    : 배치 결과 저장 S3 버킷
    SIMULATE_FUNCTION : simulate Lambda 함수명
    SES_SENDER      : 발신 이메일
    SES_REGION      : SES 리전
"""

from __future__ import annotations

import json
import os
from datetime import datetime, timezone, timedelta
from pathlib import Path
from typing import Any

# ──────────────────────────────────────────────
# 상수
# ──────────────────────────────────────────────
KST = timezone(timedelta(hours=9))
PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent

SOURCES = ["cust", "emp"]
SOURCE_LABEL = {"cust": "고객 안전 (CUST)", "emp": "직원 안전 (EMP)"}


# ──────────────────────────────────────────────
# S3 로딩 + 로컬 Fallback
# ──────────────────────────────────────────────
def _load_stores_from_s3(bucket: str) -> list[dict] | None:
    """S3에서 stores.json을 로드한다."""
    try:
        import boto3

        s3 = boto3.client("s3")
        resp = s3.get_object(Bucket=bucket, Key="stores.json")
        data = json.loads(resp["Body"].read().decode("utf-8"))
        print(f"[batch] S3 로드 성공: s3://{bucket}/stores.json")
        return data
    except Exception as e:
        print(f"[batch] S3 로드 실패: {e}")
        return None


def _load_stores_local() -> list[dict] | None:
    """로컬 stores.json을 로드한다."""
    fp = PROJECT_ROOT / "stores.json"
    if fp.exists():
        with open(fp, "r", encoding="utf-8") as f:
            data = json.load(f)
        print(f"[batch] 로컬 로드: {fp}")
        return data
    return None


def _load_stores() -> list[dict]:
    """stores.json을 로드한다 (S3 우선, 로컬 Fallback)."""
    bucket = os.environ.get("MODELS_BUCKET")
    stores = None

    if bucket:
        stores = _load_stores_from_s3(bucket)

    if stores is None:
        stores = _load_stores_local()

    if stores is None:
        raise FileNotFoundError(
            "stores.json을 찾을 수 없습니다 (S3, 로컬 모두 실패)"
        )

    return stores


# ──────────────────────────────────────────────
# simulate Lambda 동기 호출
# ──────────────────────────────────────────────
def _invoke_simulate(
    lambda_client: Any,
    function_name: str,
    store_code: int,
    date_str: str,
) -> dict:
    """simulate Lambda를 동기 호출하고 결과를 반환한다.

    Args:
        lambda_client: boto3 Lambda 클라이언트
        function_name: simulate Lambda 함수명
        store_code: 매장코드
        date_str: 날짜 (YYYY-MM-DD)

    Returns:
        simulate Lambda 응답 body (dict)

    Raises:
        Exception: Lambda 호출 또는 응답 파싱 실패 시
    """
    payload = {
        "httpMethod": "POST",
        "body": json.dumps({"store_code": store_code, "date": date_str}),
    }

    resp = lambda_client.invoke(
        FunctionName=function_name,
        InvocationType="RequestResponse",
        Payload=json.dumps(payload),
    )

    resp_payload = json.loads(resp["Payload"].read().decode("utf-8"))

    # Lambda 실행 에러 체크
    if "FunctionError" in resp:
        raise Exception(
            f"Lambda 실행 에러: {resp_payload.get('errorMessage', resp_payload)}"
        )

    # API Gateway 형식 응답 파싱
    status_code = resp_payload.get("statusCode", 500)
    body = resp_payload.get("body", "{}")
    if isinstance(body, str):
        body = json.loads(body)

    if status_code != 200:
        raise Exception(f"simulate 응답 에러 (HTTP {status_code}): {body}")

    return body


# ──────────────────────────────────────────────
# 이메일 본문 구성
# ──────────────────────────────────────────────
def _build_email_body(store_name: str, date_str: str, results: dict) -> str:
    """매장별 안전 가이드 이메일 본문을 구성한다.

    Args:
        store_name: 매장명
        date_str: 날짜 (YYYY-MM-DD)
        results: simulate 결과의 results dict (cust, emp 키)

    Returns:
        이메일 본문 문자열
    """
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

        # 위험도 정보
        risk = source_data.get("risk", {})
        guide = source_data.get("guide", {})

        risk_summary = guide.get("위험_요약", "정보 없음")
        lines.append(f"⚠️ {risk_summary}")

        # 안전 수칙
        tips = guide.get("안전_수칙", [])
        for tip in tips:
            lines.append(f"  ☑️ {tip}")

        lines.append("")

    return "\n".join(lines)


# ──────────────────────────────────────────────
# SES 이메일 발송
# ──────────────────────────────────────────────
def _send_email(
    ses_client: Any,
    sender: str,
    recipient: str,
    subject: str,
    body_text: str,
) -> bool:
    """AWS SES로 이메일을 발송한다.

    Args:
        ses_client: boto3 SES 클라이언트
        sender: 발신 이메일
        recipient: 수신 이메일
        subject: 이메일 제목
        body_text: 이메일 본문

    Returns:
        발송 성공 여부
    """
    try:
        ses_client.send_email(
            Source=sender,
            Destination={"ToAddresses": [recipient]},
            Message={
                "Subject": {"Data": subject, "Charset": "UTF-8"},
                "Body": {"Text": {"Data": body_text, "Charset": "UTF-8"}},
            },
        )
        return True
    except Exception as e:
        print(f"[batch] 이메일 발송 실패 ({recipient}): {e}")
        return False


# ──────────────────────────────────────────────
# 배치 결과 S3 저장
# ──────────────────────────────────────────────
def _save_results_to_s3(
    s3_client: Any,
    bucket: str,
    date_str: str,
    results_data: dict,
) -> None:
    """배치 결과를 S3에 저장한다.

    저장 경로: daily/{date}/results.json
    """
    key = f"daily/{date_str}/results.json"
    body = json.dumps(results_data, ensure_ascii=False, indent=2)

    s3_client.put_object(
        Bucket=bucket,
        Key=key,
        Body=body.encode("utf-8"),
        ContentType="application/json; charset=utf-8",
    )
    print(f"[batch] 결과 저장 완료: s3://{bucket}/{key}")


# ──────────────────────────────────────────────
# Lambda 핸들러
# ──────────────────────────────────────────────
def lambda_handler(event: dict, context: Any) -> dict:
    """배치 오케스트레이터 Lambda 메인 핸들러.

    EventBridge 트리거: 매일 06:00 KST

    1. S3에서 stores.json 로드 (로컬 Fallback)
    2. 전체 매장 순회 → simulate Lambda 동기 호출
    3. 결과 수집 → S3 저장: daily/{date}/results.json
    4. 매장별 안전 가이드를 AWS SES로 이메일 발송
    5. 발송 결과(성공/실패, 매장별 위험도 등) 반환
    """
    import boto3

    now = datetime.now(KST)
    date_str = now.strftime("%Y-%m-%d")
    timestamp = now.isoformat(timespec="seconds")

    print(f"[batch] 배치 시작: {timestamp}")

    # ── 환경변수 ──
    daily_bucket = os.environ.get("DAILY_BUCKET", "")
    simulate_function = os.environ.get("SIMULATE_FUNCTION", "")
    ses_sender = os.environ.get("SES_SENDER", "")
    ses_region = os.environ.get("SES_REGION", "ap-northeast-2")

    # ── AWS 클라이언트 ──
    lambda_client = boto3.client("lambda")
    s3_client = boto3.client("s3")
    ses_client = boto3.client("ses", region_name=ses_region)

    # ── 1. stores.json 로드 ──
    try:
        stores = _load_stores()
    except FileNotFoundError as e:
        print(f"[batch] 치명적 오류: {e}")
        return {
            "date": date_str,
            "timestamp": timestamp,
            "error": str(e),
            "summary": {
                "total": 0,
                "success": 0,
                "failed": 0,
                "email_sent": 0,
                "email_failed": 0,
            },
            "stores": [],
        }

    # 영업 중인 매장만 필터링
    active_stores = [
        s for s in stores if s.get("폐점여부") == "영업"
    ]
    print(f"[batch] 대상 매장 수: {len(active_stores)}")

    # ── 2~4. 매장 순회 ──
    store_results: list[dict] = []
    success_count = 0
    failed_count = 0
    email_sent_count = 0
    email_failed_count = 0

    for store in active_stores:
        store_code = store.get("매장")
        store_name = store.get("매장명", "")
        store_email = store.get("이메일", "")

        if store_code is None:
            continue

        store_code = int(store_code)
        entry: dict[str, Any] = {
            "store_code": store_code,
            "store_name": store_name,
            "status": "failed",
            "risk_cust": "unknown",
            "risk_emp": "unknown",
            "email_sent": False,
        }

        # ── simulate Lambda 호출 ──
        try:
            sim_result = _invoke_simulate(
                lambda_client, simulate_function, store_code, date_str
            )
            entry["status"] = "success"
            success_count += 1

            # 위험도 추출
            results = sim_result.get("results", {})
            cust_risk = results.get("cust", {}).get("risk", {})
            emp_risk = results.get("emp", {}).get("risk", {})
            entry["risk_cust"] = cust_risk.get("grade", "unknown")
            entry["risk_emp"] = emp_risk.get("grade", "unknown")

            # ── SES 이메일 발송 ──
            if ses_sender and store_email:
                subject = f"[다이소 안전가이드] {store_name} - {date_str}"
                body_text = _build_email_body(store_name, date_str, results)

                sent = _send_email(
                    ses_client, ses_sender, store_email, subject, body_text
                )
                entry["email_sent"] = sent
                if sent:
                    email_sent_count += 1
                else:
                    email_failed_count += 1
            else:
                # 이메일 주소 없음 → 발송 스킵
                if ses_sender and not store_email:
                    print(
                        f"[batch] 이메일 주소 없음, 발송 스킵: "
                        f"{store_code} {store_name}"
                    )

        except Exception as e:
            entry["status"] = "failed"
            entry["error"] = str(e)
            failed_count += 1
            print(f"[batch] 매장 처리 실패 ({store_code} {store_name}): {e}")

        store_results.append(entry)

    # ── 3. 결과 조립 ──
    batch_result = {
        "date": date_str,
        "timestamp": timestamp,
        "summary": {
            "total": len(active_stores),
            "success": success_count,
            "failed": failed_count,
            "email_sent": email_sent_count,
            "email_failed": email_failed_count,
        },
        "stores": store_results,
    }

    # ── S3 저장 ──
    if daily_bucket:
        try:
            _save_results_to_s3(s3_client, daily_bucket, date_str, batch_result)
        except Exception as e:
            print(f"[batch] 결과 S3 저장 실패: {e}")
            batch_result["s3_save_error"] = str(e)
    else:
        print("[batch] DAILY_BUCKET 미설정 → S3 저장 스킵")

    print(
        f"[batch] 배치 완료: "
        f"총 {len(active_stores)}개 매장, "
        f"성공 {success_count}, 실패 {failed_count}, "
        f"이메일 발송 {email_sent_count}, 이메일 실패 {email_failed_count}"
    )

    return batch_result

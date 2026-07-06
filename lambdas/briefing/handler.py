"""
briefing Lambda 핸들러 — 정기(월간) 조직단위 사고현황 브리핑

EventBridge 트리거: 매월 1일 06:00 KST (cron(0 21 1 * ? *) UTC)

수신자(users) 순회 → 각자 소속 스코프(부문/영업부/팀/매장)의 월간 현황·목표대비·핵심유형 산출
→ 알림톡 발송(승인 전 mock). 예방 카드(batch) 와 별개의 회고형 집계 브리핑이다.

환경변수:
    MODELS_BUCKET            : org_rollup.json·kpi_targets.json·recipients.json 이 있는 S3 (없으면 로컬)
    NOTIFY_CHANNEL           : "mock"(기본) | "kakao"
    ALIMTALK_SENDER_KEY      : 발신프로필 키(승인 후) — 없으면 mock 폴백
    ALIMTALK_TEMPLATE_BRIEFING : 브리핑 템플릿 ID(승인 후)
    FRONTEND_URL             : 대시보드 딥링크 베이스
    # 로컬 개발용:
    BRIEFING_LOCAL_DIR       : 프로젝트 루트(기본 ".") — MODELS_BUCKET 없을 때 로컬 파일 로드
    BRIEFING_RECIPIENTS      : 수신자 JSON 경로(기본 recipients.seed.json)
"""

from __future__ import annotations

import os
from datetime import datetime, timezone, timedelta

from core.briefing import load_json, compute_scope_briefing, latest_month
from core.recipients import all_user_scopes
from core.notifier import get_notifier

KST = timezone(timedelta(hours=9))


def _load_inputs() -> tuple[dict, dict, dict]:
    bucket = os.environ.get("MODELS_BUCKET")
    if bucket:
        return (
            load_json("org_rollup.json", bucket),
            load_json("kpi_targets.json", bucket),
            load_json("recipients.json", bucket),
        )
    base = os.environ.get("BRIEFING_LOCAL_DIR", ".")
    recips = os.environ.get("BRIEFING_RECIPIENTS", f"{base}/recipients.seed.json")
    return (
        load_json(f"{base}/proj/src/data/org_rollup.json"),
        load_json(f"{base}/proj/src/data/kpi_targets.json"),
        load_json(recips),
    )


def lambda_handler(event=None, context=None):
    rollup, kpi, recipients = _load_inputs()
    channel = os.environ.get("NOTIFY_CHANNEL", "mock")
    notifier = get_notifier(channel)

    scopes = all_user_scopes(recipients)
    results = []
    sent = skipped = 0
    for sc in scopes:
        # 수신 근거 없거나 전화번호 없으면 발송 제외(알림톡은 전화번호로만 발송)
        phone = sc.get("phone") or sc.get("contact")
        if not sc.get("consent", True) or not phone:
            skipped += 1
            reason = "no_consent" if not sc.get("consent", True) else "no_phone"
            results.append({"name": sc.get("name"), "skipped": reason})
            continue
        brief = compute_scope_briefing(rollup, kpi, sc)
        if not brief:
            skipped += 1
            results.append({"name": sc.get("name"), "skipped": "no_data"})
            continue
        res = notifier.send_alimtalk([phone], brief, brief["deep_link"])
        sent += len(res.get("sent", []))
        results.append({
            "name": sc.get("name"), "role": sc.get("role"), "phone_masked": phone[:3] + "****" + phone[-2:],
            "brief": brief, "send": res,
        })

    summary = {
        "ran_at": datetime.now(KST).isoformat(timespec="seconds"),
        "channel": channel,
        "period": latest_month(rollup),
        "recipients": len(scopes),
        "sent": sent,
        "skipped": skipped,
    }
    print(f"[briefing] {summary}")
    return {"summary": summary, "results": results}


if __name__ == "__main__":
    import json as _json
    out = lambda_handler()
    print(_json.dumps(out["summary"], ensure_ascii=False, indent=2))

#!/usr/bin/env python3
"""
preview_card.py — 운영 카드(피드 템플릿)를 '나에게 보내기'로 미리보기.

lambdas/notify 가 쓰는 것과 **동일한** core.notifier.KakaoNotifier.build_template 으로
카드를 만들어, 친구 UUID 없이 본인 카카오톡(나와의 채팅)으로 실제 발송한다. 친구 발송
검수/팀원 등록 전에도 카드 디자인을 눈으로 확인·반복하기 위한 도구.

입력: alerts/{date}/{store}_*.json (배치가 남긴 실제 결과) 또는 --alert 로 경로 지정.
환경: .env 의 KAKAO_ACCESS_TOKEN / KAKAO_FALLBACK_IMAGE_URL / FRONTEND_URL 사용.

사용:
  python3 scripts/preview_card.py --store 10130 --date 2025-01-15
  python3 scripts/preview_card.py --alert alerts/2025-01-15/10130_1777894649.json
  python3 scripts/preview_card.py --store 10130 --date 2025-01-15 --dry-run  # 발송 없이 템플릿만 출력
"""

from __future__ import annotations

import argparse
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.notifier import KakaoNotifier
from scripts.kakao_message_test import _load_dotenv, _request, API_HOST


def _find_alert(store: str, date: str) -> Path | None:
    matches = sorted(glob.glob(str(ROOT / "alerts" / date / f"{store}_*.json")))
    return Path(matches[0]) if matches else None


def main() -> int:
    ap = argparse.ArgumentParser(description="운영 카드 미리보기 (나에게 보내기)")
    ap.add_argument("--store", help="매장 코드 (예: 10130)")
    ap.add_argument("--date", help="날짜 YYYY-MM-DD")
    ap.add_argument("--alert", help="alert JSON 경로 직접 지정")
    ap.add_argument("--dry-run", action="store_true", help="발송 없이 템플릿만 출력")
    args = ap.parse_args()

    _load_dotenv()

    if args.alert:
        alert_path = Path(args.alert)
    elif args.store and args.date:
        alert_path = _find_alert(args.store, args.date)
    else:
        ap.error("--alert 또는 (--store와 --date)를 지정하세요.")

    if not alert_path or not alert_path.exists():
        raise SystemExit(f"alert 파일을 찾지 못했습니다: {alert_path}")

    alert = json.loads(alert_path.read_text(encoding="utf-8"))
    store_code = str(alert.get("store_code", args.store or ""))
    store_name = alert.get("store_name", store_code)
    date_str = alert.get("date", args.date or "")
    results = alert.get("results", {})

    notifier = KakaoNotifier()
    template_str, source = notifier.build_template(store_name, date_str, store_code, results)

    print(f"[preview] {store_name}({store_code}) {date_str} — 선택 소스: {source}")
    print("[preview] 카드 템플릿:")
    print(json.dumps(json.loads(template_str), ensure_ascii=False, indent=2))

    if args.dry_run:
        print("\n(dry-run) 발송하지 않음")
        return 0

    result = _request(
        "POST",
        f"{API_HOST}/v2/api/talk/memo/default/send",
        access_token=__import__("os").environ.get("KAKAO_ACCESS_TOKEN"),
        data={"template_object": template_str},
    )
    print("\n[preview] 발송 결과:", json.dumps(result, ensure_ascii=False))
    print("→ 본인 카카오톡 '나와의 채팅'에서 확인하세요.")
    return 0


if __name__ == "__main__":
    sys.exit(main())

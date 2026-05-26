"""
notifier.py — 메신저 추상화 레이어

채널 교체 시 구현체만 교체한다:
  - MockNotifier   : 프로토타입 (로그만 출력, 실제 발송 없음)
  - KakaoNotifier  : 카카오 비즈니스 채널 (친구에게 메시지 — kapi.kakao.com)

환경변수 (KakaoNotifier):
    KAKAO_ACCESS_TOKEN     : 카카오 앱 액세스 토큰
    FRONTEND_URL           : 대시보드 URL (이미지 경로 변환 + 딥링크)
    KAKAO_FALLBACK_IMAGE_URL : 이미지 없을 때 기본 이미지
"""

from __future__ import annotations

import json
import os
from abc import ABC, abstractmethod


# ---------------------------------------------------------------------------
# 공통 인터페이스
# ---------------------------------------------------------------------------

class BaseNotifier(ABC):
    @abstractmethod
    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        """메시지를 발송한다.

        Returns:
            {"sent": [...성공 수신자...], "failed": [...실패 수신자...]}
        """


# ---------------------------------------------------------------------------
# Mock (프로토타입 — 실제 발송 없이 성공 처리)
# ---------------------------------------------------------------------------

class MockNotifier(BaseNotifier):
    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        print(f"[notifier:mock] 발송 시뮬레이션 — 수신자 {len(recipients)}명")
        print(f"[notifier:mock] 제목: {subject}")
        for r in recipients:
            print(f"[notifier:mock]   → {r}")
        return {"sent": recipients, "failed": []}


# ---------------------------------------------------------------------------
# 카카오 (카카오 비즈니스 채널 — 친구에게 메시지)
# ---------------------------------------------------------------------------

class KakaoNotifier(BaseNotifier):
    """카카오 친구에게 메시지 API (kapi.kakao.com/v1/api/talk/friends/message/default/send)."""

    # BaseNotifier 호환: 단순 텍스트 발송 (배치 등에서 사용)
    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        if not recipients:
            return {"sent": [], "failed": []}
        template = {
            "object_type": "text",
            "text": f"{subject}\n\n{body}"[:200],
            "link": {"web_url": os.environ.get("FRONTEND_URL", "https://www.daiso.co.kr")},
        }
        template_str = json.dumps(template, ensure_ascii=False, separators=(",", ":"))
        return self._send_to_friends(recipients, template_str)

    # 안전 가이드 피드 템플릿 발송
    def send_guide(
        self,
        receiver_uuids: list[str],
        store_name: str,
        date_str: str,
        store_code: str,
        results: dict,
    ) -> dict:
        """안전 가이드 피드 템플릿을 친구 UUID 목록에 발송한다."""
        template_str, _source = self.build_template(store_name, date_str, store_code, results)
        return self._send_to_friends(receiver_uuids, template_str)

    def build_template(
        self,
        store_name: str,
        date_str: str,
        store_code: str,
        results: dict,
    ) -> tuple[str, str]:
        """카카오 피드 템플릿 JSON 문자열과 소스('cust'|'emp')를 반환한다."""
        source, guide, case = self._select_case(results)
        title = f"{store_name} 매장 안전 가이드"
        accident = case.get("사고내용") or guide.get("위험_요약") or "오늘의 안전가이드를 확인해주세요."
        rule = case.get("수칙") or ""
        description = accident if not rule else f"{accident}\n{rule}"
        if len(description) > 180:
            description = description[:177].rstrip() + "..."

        public_image_url = self._public_url(case.get("image_url"))
        if public_image_url:
            image_url = self._upload_image(public_image_url)
        else:
            image_url = os.environ.get(
                "KAKAO_FALLBACK_IMAGE_URL",
                "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png",
            )

        link_url = self._guide_link(store_code, date_str)
        template = {
            "object_type": "feed",
            "content": {
                "title": title,
                "description": description,
                "image_url": image_url,
                "link": {"web_url": link_url, "mobile_web_url": link_url},
            },
            "buttons": [
                {
                    "title": "안전가이드 확인",
                    "link": {"web_url": link_url, "mobile_web_url": link_url},
                }
            ],
        }
        return json.dumps(template, ensure_ascii=False, separators=(",", ":")), source

    # ── private helpers ──────────────────────────────────────────────────

    def _send_to_friends(self, receiver_uuids: list[str], template_object: str) -> dict:
        if not receiver_uuids:
            return {"sent": [], "failed": []}

        access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
        if not access_token:
            raise ValueError("KAKAO_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")

        import requests

        resp = requests.post(
            "https://kapi.kakao.com/v1/api/talk/friends/message/default/send",
            headers={
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
            },
            data={
                "receiver_uuids": json.dumps(receiver_uuids, ensure_ascii=False, separators=(",", ":")),
                "template_object": template_object,
            },
            timeout=15,
        )
        if not resp.ok:
            raise ValueError(f"Kakao API 오류 HTTP {resp.status_code}: {resp.text}")

        data = resp.json()
        sent = data.get("successful_receiver_uuids", [])
        failed = [u for u in receiver_uuids if u not in sent]
        return {"sent": sent, "failed": failed, "raw": data}

    def _upload_image(self, public_image_url: str) -> str:
        access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
        if not access_token:
            raise ValueError("KAKAO_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")

        import requests

        image_resp = requests.get(public_image_url, timeout=15)
        if not image_resp.ok:
            raise ValueError(
                f"이미지 다운로드 실패 HTTP {image_resp.status_code}: {public_image_url}"
            )

        content_type = image_resp.headers.get("Content-Type") or "image/png"
        upload_resp = requests.post(
            "https://kapi.kakao.com/v2/api/talk/message/image/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            files={"file": ("safety-guide.png", image_resp.content, content_type)},
            timeout=20,
        )
        if not upload_resp.ok:
            raise ValueError(
                f"이미지 업로드 실패 HTTP {upload_resp.status_code}: {upload_resp.text}"
            )

        uploaded_url = self._extract_image_url(upload_resp.json())
        if not uploaded_url:
            raise ValueError(f"업로드 응답에서 URL을 찾지 못했습니다: {upload_resp.text}")
        return uploaded_url

    @staticmethod
    def _extract_image_url(upload_result: dict) -> str | None:
        for key in ("url", "image_url", "imageUrl"):
            if upload_result.get(key):
                return upload_result[key]
        infos = upload_result.get("infos")
        if isinstance(infos, dict):
            for info in infos.values():
                if isinstance(info, dict) and info.get("url"):
                    return info["url"]
        return None

    @staticmethod
    def _public_url(path_or_url: str | None) -> str | None:
        if not path_or_url:
            return None
        value = str(path_or_url).strip()
        if not value or value.lower() in {"nan", "none", "null"}:
            return None
        if value.startswith("http"):
            return value
        frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        clean_path = value.lstrip("/")
        if clean_path.startswith("frontend/"):
            clean_path = clean_path.removeprefix("frontend/")
        if not clean_path.startswith("images/"):
            clean_path = f"images/{clean_path}"
        if frontend_url:
            return f"{frontend_url}/{clean_path}"
        return None

    @staticmethod
    def _guide_link(store_code: str, date_str: str) -> str:
        frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        if not frontend_url:
            return "https://www.daiso.co.kr"
        return f"{frontend_url}/#tab=alert_monitor&store={store_code}&date={date_str}"

    @staticmethod
    def _select_case(results: dict) -> tuple[str, dict, dict]:
        for source in ("emp", "cust"):
            guide = results.get(source, {}).get("guide", {})
            cases = guide.get("오늘의_주의사항") or []
            if cases:
                return source, guide, cases[0]
        return "emp", results.get("emp", {}).get("guide", {}), {}


# ---------------------------------------------------------------------------
# 팩토리
# ---------------------------------------------------------------------------

def get_notifier(channel: str = "mock") -> BaseNotifier:
    if channel == "kakao":
        return KakaoNotifier()
    return MockNotifier()

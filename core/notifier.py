"""
notifier.py — 메신저 추상화 레이어

현재: EmailNotifier (AWS SES)
나중에 카카오톡으로 교체 시:
  1. KakaoNotifier 구현
  2. get_notifier("kakao") 반환
  3. Lambda 환경변수 NOTIFY_CHANNEL="kakao" 변경

수신자(recipients) 형식:
  - 이메일: ["a@b.com", "c@d.com"]
  - 카카오(미래): ["01012345678", "01098765432"]
"""

from __future__ import annotations

import os
from abc import ABC, abstractmethod
from typing import Any


# ---------------------------------------------------------------------------
# 공통 인터페이스
# ---------------------------------------------------------------------------

class BaseNotifier(ABC):
    """메신저 발송 추상 클래스.

    채널을 교체할 때 이 인터페이스를 구현하면 된다.
    """

    @abstractmethod
    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        """메시지를 발송한다.

        Args:
            recipients: 수신자 목록 (이메일 주소 또는 전화번호)
            subject: 제목
            body: 본문

        Returns:
            {"sent": [...성공 수신자...], "failed": [...실패 수신자...]}
        """


# ---------------------------------------------------------------------------
# 이메일 (AWS SES)
# ---------------------------------------------------------------------------

class EmailNotifier(BaseNotifier):
    """AWS SES를 사용한 이메일 발송."""

    def __init__(self, sender: str, region: str = "ap-northeast-2") -> None:
        self.sender = sender
        self.region = region

    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        import boto3

        ses = boto3.client("ses", region_name=self.region)
        sent: list[str] = []
        failed: list[str] = []

        for recipient in recipients:
            try:
                ses.send_email(
                    Source=self.sender,
                    Destination={"ToAddresses": [recipient]},
                    Message={
                        "Subject": {"Data": subject, "Charset": "UTF-8"},
                        "Body": {"Text": {"Data": body, "Charset": "UTF-8"}},
                    },
                )
                sent.append(recipient)
                print(f"[notifier] 이메일 발송 성공: {recipient}")
            except Exception as e:
                failed.append(recipient)
                print(f"[notifier] 이메일 발송 실패 ({recipient}): {e}")

        return {"sent": sent, "failed": failed}


# ---------------------------------------------------------------------------
# 카카오 (미구현 stub — 나중에 구현)
# ---------------------------------------------------------------------------

class KakaoNotifier(BaseNotifier):
    """카카오 비즈니스 채널 발송 (미구현 stub)."""

    def send(
        self,
        recipients: list[str],
        subject: str,
        body: str,
    ) -> dict[str, list[str]]:
        raise NotImplementedError(
            "KakaoNotifier는 아직 구현되지 않았습니다. "
            "카카오 비즈니스 채널 API 키 설정 후 구현하세요."
        )


# ---------------------------------------------------------------------------
# 팩토리
# ---------------------------------------------------------------------------

_NOTIFIERS: dict[str, type[BaseNotifier]] = {
    "email": EmailNotifier,
    "kakao": KakaoNotifier,
}


def get_notifier(channel: str = "email") -> BaseNotifier:
    """채널 이름으로 Notifier 인스턴스를 반환한다.

    Args:
        channel: "email" 또는 "kakao"

    Returns:
        BaseNotifier 구현체

    Raises:
        ValueError: 지원하지 않는 채널
    """
    cls = _NOTIFIERS.get(channel)
    if cls is None:
        raise ValueError(
            f"지원하지 않는 채널: {channel!r}. "
            f"지원 채널: {list(_NOTIFIERS.keys())}"
        )

    if channel == "email":
        sender = os.environ.get("SES_SENDER", "")
        region = os.environ.get("SES_REGION", "ap-northeast-2")
        return EmailNotifier(sender=sender, region=region)

    return cls()

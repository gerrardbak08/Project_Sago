"""
notifier.py — 메신저 추상화 레이어

현재: MockNotifier (실제 발송 없이 성공 처리 — 프로토타입)
나중에 카카오톡 연동 시:
  1. KakaoNotifier.send() 구현
  2. get_notifier("kakao") 반환
  3. Lambda 환경변수 NOTIFY_CHANNEL="kakao" 변경

수신자(recipients) 형식:
  - 프로토타입: 매장 직원 목록 (실제 전송 없음)
  - 카카오(미래): ["01012345678", "01098765432"]
"""

from __future__ import annotations

from abc import ABC, abstractmethod


# ---------------------------------------------------------------------------
# 공통 인터페이스
# ---------------------------------------------------------------------------

class BaseNotifier(ABC):
    """메신저 발송 추상 클래스.

    채널을 교체할 때 이 인터페이스만 구현하면 된다.
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
            recipients: 수신자 목록 (전화번호 등)
            subject: 제목
            body: 본문

        Returns:
            {"sent": [...성공 수신자...], "failed": [...실패 수신자...]}
        """


# ---------------------------------------------------------------------------
# Mock (프로토타입 — 실제 발송 없이 성공 처리)
# ---------------------------------------------------------------------------

class MockNotifier(BaseNotifier):
    """프로토타입용 Mock 발송기.

    실제 메시지를 보내지 않고 로그만 출력한다.
    카카오 연동 후 KakaoNotifier로 교체한다.
    """

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
        # 프로토타입: 모두 성공으로 처리
        return {"sent": recipients, "failed": []}


# ---------------------------------------------------------------------------
# 카카오 (미구현 — 나중에 구현)
# ---------------------------------------------------------------------------

class KakaoNotifier(BaseNotifier):
    """카카오 비즈니스 채널 발송.

    카카오 API 키 발급 후 구현한다.
    """

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

def get_notifier(channel: str = "mock") -> BaseNotifier:
    """채널 이름으로 Notifier 인스턴스를 반환한다.

    Args:
        channel: "mock" 또는 "kakao"

    Returns:
        BaseNotifier 구현체

    Raises:
        ValueError: 지원하지 않는 채널
    """
    if channel == "kakao":
        return KakaoNotifier()

    # 기본값: mock (프로토타입)
    return MockNotifier()

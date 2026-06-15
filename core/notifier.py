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

# 이미지가 없을 때 최후 fallback (카카오 도메인이라 등록 없이 렌더됨)
_KAKAOLINK_DEFAULT = (
    "https://developers.kakao.com/assets/img/about/logos/kakaolink/kakaolink_btn_medium.png"
)
# 위험 등급 → 제목 배지
_GRADE_BADGE = {"high": "🔴", "medium": "🟠", "med": "🟠", "low": "🟡"}


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
        """카카오 피드 템플릿 JSON 문자열과 소스('cust'|'emp')를 반환한다.

        - 위험 점수가 가장 높은 소스를 골라 한 장의 카드로 구성한다.
        - 제목: 위험등급 배지 + 매장명 + 핵심 위험유형 (한눈에 긴급도).
        - 본문: 실행 가능한 '수칙'을 앞세워, 카드 접힘(2줄)에서도 행동지침이 먼저 보이게.
        - 이미지: 사례 사진(있으면 업로드) → 없으면 브랜드 기본 이미지.
        """
        source, guide, risk = self._select_source(results)

        # 선택된 소스의 신뢰도 — low면 단정 배지를 피하고 '참고용' caveat를 주입한다.
        node = results.get(source)
        low_conf = isinstance(node, dict) and str(node.get("confidence", "")).lower() == "low"

        grade = str(risk.get("grade", "")).lower()
        badge = _GRADE_BADGE.get(grade, "⚠️")
        dominant = (
            (guide.get("주요_위험유형") or risk.get("dominant_type") or "")
            .split(",")[0].split("/")[0].strip()
        )
        title = (
            f"{badge} {store_name} · {dominant} 주의"
            if dominant else f"{badge} {store_name} 안전 가이드"
        )
        # 카카오 피드 title 필드 최대 200자 상한
        title = self._truncate(title, 200)

        description = self._compose_description(guide, low_confidence=low_conf)
        image_url = self._resolve_card_image(guide, dominant)
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
                    "title": "안전가이드 전체 보기",
                    "link": {"web_url": link_url, "mobile_web_url": link_url},
                }
            ],
        }
        return json.dumps(template, ensure_ascii=False, separators=(",", ":")), source

    # ── 본문/이미지 구성 ──────────────────────────────────────────────────

    @staticmethod
    def _precautions(guide: dict) -> list[str]:
        """가이드에서 '수칙' 목록을 추출 (신·구 스키마 모두 지원)."""
        out: list[str] = []
        for case in guide.get("오늘의_주의사항") or []:  # 신스키마: per-case 수칙
            text = str(case.get("수칙") or "").strip()
            if text:
                out.append(text)
        if not out:  # 구스키마: 안전_수칙 평면 리스트
            for text in guide.get("안전_수칙") or []:
                if isinstance(text, str) and text.strip():
                    out.append(text.strip())
        return out

    def _compose_description(self, guide: dict, limit: int = 170, low_confidence: bool = False) -> str:
        """행동지침(수칙)을 앞세운 본문. 카드 접힘 시 수칙이 먼저 보이도록 구성한다.

        low_confidence=True면 단정 톤을 피해 '참고용 가설' caveat를 앞에 붙인다.
        """
        precautions = self._precautions(guide)
        summary = str(guide.get("위험_요약") or "").strip()
        parts: list[str] = []
        if precautions:
            lead = "  ".join(
                f"{mark} {text}" for mark, text in zip("①②③", precautions[:2])
            )
            parts.append(f"오늘 꼭: {lead}")
        if summary:
            parts.append(summary)
        text = "  ·  ".join(parts) if parts else "오늘의 안전가이드를 확인해주세요."
        if low_confidence:  # 데이터 부족 — 단정 대신 참고용임을 카드에 명시
            text = f"[데이터 부족·참고용] {text}"
        return self._truncate(text, limit)

    @staticmethod
    def _truncate(text: str, limit: int) -> str:
        text = " ".join(text.split())
        if len(text) <= limit:
            return text
        cut = text[:limit]
        for sep in ("  ·  ", " ", "·"):  # 단어/구분자 경계에서 자르기
            idx = cut.rfind(sep)
            if idx > limit * 0.6:
                cut = cut[:idx]
                break
        # 끝에 텍스트 없이 남은 고아 마커(①②③)·구분자 제거
        return cut.rstrip(" ·①②③") + "…"

    def _resolve_card_image(self, guide: dict, dominant: str = "") -> str:
        """카드 이미지 우선순위:
        1) 사례 사진(신스키마 오늘의_주의사항[].image_url)
        2) 브랜드 기본 이미지
        """
        for case in guide.get("오늘의_주의사항") or []:  # 1) 사례 사진
            url = self._image_from_ref(case.get("image_url"))
            if url:
                return url
        return self._default_image()  # 2) 브랜드 기본

    def _default_image(self) -> str:
        """브랜드 기본 이미지.

        KAKAO_DEFAULT_IMAGE_URL(공개 URL)이 있으면 카카오 CDN에 한 번 업로드해 사용
        (인스턴스 캐시). 없으면 KAKAO_FALLBACK_IMAGE_URL(카카오 도메인/CDN URL을 직접
        사용) → 최후엔 카카오링크 로고.
        """
        cached = getattr(self, "_default_image_cache", None)
        if cached:
            return cached
        source_url = os.environ.get("KAKAO_DEFAULT_IMAGE_URL")
        if source_url:
            try:
                uploaded = self._upload_image(source_url)
                self._default_image_cache = uploaded
                return uploaded
            except Exception as exc:
                print(f"[notifier] 기본 이미지 업로드 실패 → fallback: {exc}")
        return os.environ.get("KAKAO_FALLBACK_IMAGE_URL", _KAKAOLINK_DEFAULT)

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
        """공개 URL의 이미지를 받아 카카오 CDN에 업로드하고 그 URL을 반환."""
        import requests

        image_resp = requests.get(public_image_url, timeout=15)
        if not image_resp.ok:
            raise ValueError(
                f"이미지 다운로드 실패 HTTP {image_resp.status_code}: {public_image_url}"
            )
        content_type = image_resp.headers.get("Content-Type") or "image/png"
        return self._upload_image_bytes(image_resp.content, content_type)

    def _upload_image_bytes(
        self, content: bytes, content_type: str = "image/png", filename: str = "safety-guide.png"
    ) -> str:
        """이미지 바이트를 카카오 메시지 이미지로 업로드하고 CDN URL을 반환."""
        access_token = os.environ.get("KAKAO_ACCESS_TOKEN", "")
        if not access_token:
            raise ValueError("KAKAO_ACCESS_TOKEN 환경변수가 설정되지 않았습니다.")

        import requests

        upload_resp = requests.post(
            "https://kapi.kakao.com/v2/api/talk/message/image/upload",
            headers={"Authorization": f"Bearer {access_token}"},
            files={"file": (filename, content, content_type)},
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

    def _image_from_ref(self, ref: str | None) -> str | None:
        """이미지 참조(상대경로 'images/...' 또는 http URL)를 카카오 CDN URL로 변환.

        - 상대경로: 레포 로컬 파일이 있으면 직접 업로드(개발/프리뷰), 없으면
          FRONTEND_URL 기반 공개 URL에서 받아 업로드(운영, S3 동기화본).
        - 실패 시 None (호출부가 다음 후보/기본 이미지로 강등).
        """
        if not ref:
            return None
        value = str(ref).strip()
        if not value or value.lower() in {"nan", "none", "null"}:
            return None
        try:
            if value.startswith("http"):
                return self._upload_image(value)
            from pathlib import Path
            local = Path(__file__).resolve().parents[1] / value
            if local.exists():
                return self._upload_image_bytes(local.read_bytes(), "image/png", local.name)
            public_url = self._public_url(value)
            if public_url:
                return self._upload_image(public_url)
        except Exception as exc:
            print(f"[notifier] 이미지 처리 실패({value}) → 강등: {exc}")
        return None

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
        """카드 탭 → 수신자용 모바일 안전가이드 랜딩 페이지.

        배치가 알림마다 build_guide_page.py 로 생성해 S3 guide/{date}/{store}.html 에
        업로드한다(GUIDE_PAGE_BASE 로 베이스 오버라이드 가능). 미설정 시 관리자
        대시보드 딥링크로 폴백.
        """
        base = os.environ.get("GUIDE_PAGE_BASE", "").rstrip("/")
        frontend_url = os.environ.get("FRONTEND_URL", "").rstrip("/")
        fallback = (
            f"{frontend_url}/?store={store_code}&date={date_str}"
            if frontend_url else "https://www.daiso.co.kr"
        )

        if base:
            # GUIDE_PAGE_BASE가 S3 버킷 기반이면 객체 존재 확인
            guide_bucket = os.environ.get("GUIDE_BUCKET", "")
            s3_key = f"guide/{date_str}/{store_code}.html"
            if guide_bucket:
                try:
                    import boto3
                    boto3.client("s3").head_object(Bucket=guide_bucket, Key=s3_key)
                except Exception:
                    print(
                        f"[notifier] 가이드 페이지 미존재 → fallback 링크 사용: "
                        f"s3://{guide_bucket}/{s3_key}"
                    )
                    return fallback
            return f"{base}/{date_str}/{store_code}.html"

        if frontend_url:
            return f"{frontend_url}/guide/{date_str}/{store_code}.html"
        return "https://www.daiso.co.kr"

    @staticmethod
    def _select_source(results: dict) -> tuple[str, dict, dict]:
        """위험 점수가 가장 높은 소스(cust|emp)를 골라 (source, guide, risk) 반환."""
        best: tuple[float, str, dict, dict] | None = None
        for source in ("cust", "emp"):
            node = results.get(source)
            if not isinstance(node, dict):  # 손상 입력(문자열 등) 방어
                continue
            guide = node.get("guide")
            if not isinstance(guide, dict) or not guide:
                continue
            risk = node.get("risk") if isinstance(node.get("risk"), dict) else {}
            try:
                score = float(risk.get("score") or 0)
            except (TypeError, ValueError):
                score = 0.0
            if best is None or score > best[0]:
                best = (score, source, guide, risk)
        if best is None:  # 가이드가 비어도 graceful
            for source in ("emp", "cust"):
                node = results.get(source)
                if isinstance(node, dict) and isinstance(node.get("guide"), dict):
                    return source, node.get("guide") or {}, {}
            return "emp", {}, {}
        return best[1], best[2], best[3]


# ---------------------------------------------------------------------------
# 팩토리
# ---------------------------------------------------------------------------

def get_notifier(channel: str = "mock") -> BaseNotifier:
    if channel == "kakao":
        return KakaoNotifier()
    return MockNotifier()

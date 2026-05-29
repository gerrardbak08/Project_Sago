"""
core/media.py — 사고유형별 사전 생성 미디어(이미지) URL 헬퍼

scripts/generate_safety_media.py 가 업로드한 S3 객체를 가리키는 공개 URL 을 생성한다.

환경변수:
    MEDIA_PUBLIC_BASE_URL : (옵션) CDN/CloudFront 베이스 URL
                            예: https://media.example.com
    MODELS_BUCKET         : S3 버킷명 — 베이스 URL 미설정 시 s3 가상 호스팅 URL 사용
    AWS_REGION            : s3 URL 리전 (기본 ap-northeast-2)
"""

from __future__ import annotations

import os
from urllib.parse import quote


def slug(s: str) -> str:
    """파일 경로용 슬러그 — 한글 유지, URL/파일시스템 위험 문자만 치환.

    이미지 생성 스크립트와 런타임 URL 빌더가 동일한 규칙을 쓰도록
    이 함수를 단일 소스로 사용한다.
    """
    out = s
    # 공백·슬래시는 _ 로
    out = out.replace("/", "_").replace(" ", "_")
    # URL/파일명 안전을 위해 괄호·쉼표·물음표·앰퍼샌드 제거
    for ch in ("(", ")", ",", "?", "&", "#"):
        out = out.replace(ch, "")
    return out


def _bucket_region() -> str:
    """미디어 버킷의 리전. MEDIA_BUCKET_REGION 우선, 없으면 MODELS_BUCKET 기준."""
    return (
        os.environ.get("MEDIA_BUCKET_REGION")
        or os.environ.get("MODELS_BUCKET_REGION")
        or os.environ.get("AWS_REGION")
        or "ap-northeast-2"
    )


def media_url(source: str, accident_type: str) -> str | None:
    """사고유형별 이미지 공개 URL 을 반환. 매핑 불가 시 None.

    한글 경로는 percent-encoding 으로 변환되어 카카오톡/HTTP 클라이언트 호환을 보장한다.
    """
    if not source or not accident_type:
        return None
    raw_key = f"media/{source}/{slug(accident_type)}/image.png"
    key = quote(raw_key, safe="/")

    base = os.environ.get("MEDIA_PUBLIC_BASE_URL", "").rstrip("/")
    if base:
        return f"{base}/{key}"

    bucket = os.environ.get("MODELS_BUCKET", "")
    if not bucket:
        return None
    return f"https://{bucket}.s3.{_bucket_region()}.amazonaws.com/{key}"


def pick_media_for_results(results: dict, known_types: set[tuple[str, str]] | None = None) -> list[str]:
    """가이드 결과(cust/emp)의 주요_위험유형 으로 이미지 URL 1~2개를 뽑는다.

    known_types 가 주어지면 그 집합에 포함된 (source, type) 만 URL 화한다.
    포함되지 않은 유형은 깨진 이미지 링크 방지를 위해 스킵하고 로그를 남긴다.
    """
    urls: list[str] = []
    for source in ("cust", "emp"):
        sd = (results or {}).get(source, {})
        guide = sd.get("guide", {}) or {}
        accident_type = (guide.get("주요_위험유형") or "").strip()
        if not accident_type:
            continue
        if known_types is not None and (source, accident_type) not in known_types:
            print(f"[media] 사전 생성 미정의 유형 — 첨부 스킵: {source}/{accident_type}")
            continue
        u = media_url(source, accident_type)
        if u and u not in urls:
            urls.append(u)
    return urls

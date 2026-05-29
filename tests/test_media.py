"""core/media.py URL 헬퍼 테스트."""

import os
from unittest.mock import patch

from core.media import media_url, pick_media_for_results


from urllib.parse import quote


def test_media_url_uses_public_base_when_set():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn.example.com/"}, clear=False):
        u = media_url("emp", "베임")
        # 한글은 percent-encoded
        assert u == f"https://cdn.example.com/media/emp/{quote('베임')}/image.png"


def test_media_url_falls_back_to_s3_virtual_host():
    with patch.dict(os.environ, {
        "MEDIA_PUBLIC_BASE_URL": "",
        "MODELS_BUCKET": "my-bucket",
        "MEDIA_BUCKET_REGION": "us-east-1",
        "AWS_REGION": "ap-northeast-2",
    }, clear=False):
        u = media_url("cust", "낙상")
        # MEDIA_BUCKET_REGION 이 AWS_REGION 보다 우선
        assert u == f"https://my-bucket.s3.us-east-1.amazonaws.com/media/cust/{quote('낙상')}/image.png"


def test_media_url_none_without_config():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "", "MODELS_BUCKET": ""}, clear=False):
        assert media_url("emp", "베임") is None


def test_media_url_slugifies_space_in_type():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn.example.com"}, clear=False):
        u = media_url("emp", "무리한 동작")
        assert u == f"https://cdn.example.com/media/emp/{quote('무리한_동작')}/image.png"


def test_media_url_strips_parens_and_comma():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn"}, clear=False):
        u = media_url("emp", "질병(만성질환)")
        # 괄호 제거 후 percent-encode
        assert u == f"https://cdn/media/emp/{quote('질병만성질환')}/image.png"


def test_pick_media_filters_by_known_types():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn"}, clear=False):
        results = {
            "cust": {"guide": {"주요_위험유형": "낙상"}},
            "emp": {"guide": {"주요_위험유형": "사망"}},  # 미정의
        }
        urls = pick_media_for_results(results, known_types={("cust", "낙상")})
        assert len(urls) == 1
        assert "낙상" in urls[0] or quote("낙상") in urls[0]


def test_media_url_empty_inputs():
    assert media_url("", "낙상") is None
    assert media_url("cust", "") is None


def test_pick_media_for_results_returns_unique_urls():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn"}, clear=False):
        results = {
            "cust": {"guide": {"주요_위험유형": "낙상"}},
            "emp": {"guide": {"주요_위험유형": "베임"}},
        }
        urls = pick_media_for_results(results)
        assert urls == [
            f"https://cdn/media/cust/{quote('낙상')}/image.png",
            f"https://cdn/media/emp/{quote('베임')}/image.png",
        ]


def test_pick_media_for_results_handles_missing():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn"}, clear=False):
        assert pick_media_for_results({}) == []
        assert pick_media_for_results({"cust": {}}) == []
        assert pick_media_for_results({"cust": {"guide": {}}}) == []


def test_pick_media_for_results_dedupes_same_type():
    with patch.dict(os.environ, {"MEDIA_PUBLIC_BASE_URL": "https://cdn"}, clear=False):
        # cust 와 emp 가 동일 source 라면 보통 불가능하지만 방어
        results = {
            "cust": {"guide": {"주요_위험유형": "낙상"}},
            "emp": {"guide": {"주요_위험유형": ""}},
        }
        urls = pick_media_for_results(results)
        assert urls == [f"https://cdn/media/cust/{quote('낙상')}/image.png"]

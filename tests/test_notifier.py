"""
test_notifier.py — 카카오 알림 카드(build_template) 정합성 계약 테스트.

감사(2026-06-06)에서 notifier/build_template/safety_visuals 단위 테스트가 0건 →
카드 생성 경로 전체가 무방비였음. 이 파일이 그 경로를 잠근다.

원칙: 네트워크-free·실발송 0건. 이미지 업로드(_image_from_ref)는 fixture로 차단해
항상 기본 이미지로 강등시켜 결정적으로 만든다.
"""
from __future__ import annotations

import glob
import json
from pathlib import Path

import pytest

from core.notifier import KakaoNotifier
from core.safety_visuals import category_for

ROOT = Path(__file__).resolve().parents[1]


@pytest.fixture(autouse=True)
def hermetic_env(monkeypatch):
    """네트워크·환경 의존 제거 — 결정적 테스트."""
    for k in (
        "KAKAO_ACCESS_TOKEN", "KAKAO_DEFAULT_IMAGE_URL", "KAKAO_FALLBACK_IMAGE_URL",
        "FRONTEND_URL", "GUIDE_PAGE_BASE",
    ):
        monkeypatch.delenv(k, raising=False)
    # 이미지 업로드(네트워크) 차단 → 항상 기본 이미지로 강등
    monkeypatch.setattr(KakaoNotifier, "_image_from_ref", lambda self, ref: None)


def _real_alerts() -> list[str]:
    files = sorted(glob.glob(str(ROOT / "alerts" / "*" / "*.json")))
    return [f for f in files if Path(f).name != "index.json"]


# ── build_template 계약: 모든 실 alert에서 유효한 feed JSON ──────────────────
@pytest.mark.parametrize("alert_path", _real_alerts())
def test_build_template_contract(alert_path):
    alert = json.loads(Path(alert_path).read_text(encoding="utf-8"))
    notifier = KakaoNotifier()
    template_str, source = notifier.build_template(
        alert.get("store_name", ""),
        alert.get("date", ""),
        str(alert.get("store_code", "")),
        alert.get("results", {}) or {},
    )
    t = json.loads(template_str)
    assert t["object_type"] == "feed"
    c = t["content"]
    assert isinstance(c["title"], str) and c["title"].strip()
    assert isinstance(c["description"], str) and c["description"].strip()
    assert c["image_url"]
    assert c["link"]["web_url"]
    assert c["link"]["mobile_web_url"]
    btn = t["buttons"][0]
    assert btn["title"] and btn["link"]["web_url"]
    assert len(c["description"]) <= 200  # _truncate 한도(170) + caveat + … 이내
    assert source in ("cust", "emp")


# ── #5 회귀: 손상/비정상 results 에도 크래시 없이 graceful ────────────────────
@pytest.mark.parametrize("bad_results", [
    {},
    {"cust": "garbage"},                  # 문자열 노드
    {"cust": None, "emp": []},            # None·list
    {"cust": {"guide": "x"}},             # guide 가 dict 아님
    {"emp": {"guide": {}, "risk": None}}, # 빈 guide·risk None
])
def test_select_source_handles_corrupt_input(bad_results):
    notifier = KakaoNotifier()
    template_str, source = notifier.build_template("매장", "2026-01-01", "1", bad_results)
    assert json.loads(template_str)["object_type"] == "feed"
    assert source in ("cust", "emp")


# ── #4 회귀: 위험유형 → 카테고리 매칭 ────────────────────────────────────────
@pytest.mark.parametrize("dominant,slug", [
    ("전도", "slip"),
    ("전도(강풍)", "slip"),       # 유형명이 dominant 구절에 포함
    ("질병", "health"),
    ("물체에 맞음", "collision"),
    ("낙상", "fall"),
    ("끼임", "caught"),
    ("자상", "cut"),
    ("기타", "default"),
    ("", "default"),
    ("사", "default"),             # 1자 오매칭 차단 (과거 "사"→health 였음)
    ("알수없는유형", "default"),
])
def test_category_for(dominant, slug):
    assert category_for(dominant)["slug"] == slug


# ── #6 회귀: truncate 고아 마커 제거 + 한글 경계 ─────────────────────────────
def test_truncate_strips_orphan_marker():
    out = KakaoNotifier._truncate("오늘 꼭: ① 첫수칙  ②", 12)
    assert "②" not in out          # 텍스트 없는 마커 제거
    assert out.endswith("…")


def test_truncate_unchanged_under_limit():
    assert KakaoNotifier._truncate("짧은 본문", 170) == "짧은 본문"


# ── #3: 신뢰도 low → '참고용' caveat 주입 / high → 없음 ──────────────────────
def _results(confidence):
    return {"cust": {
        "guide": {"위험_요약": "강풍 주의", "안전_수칙": ["수칙1"]},
        "risk": {"score": 5, "grade": "high"},
        "confidence": confidence,
    }}


def test_low_confidence_caveat_in_card():
    notifier = KakaoNotifier()
    s, _ = notifier.build_template("매장", "2026-01-01", "1", _results("low"))
    assert "참고용" in json.loads(s)["content"]["description"]


def test_high_confidence_no_caveat():
    notifier = KakaoNotifier()
    s, _ = notifier.build_template("매장", "2026-01-01", "1", _results("high"))
    assert "참고용" not in json.loads(s)["content"]["description"]


# ── _precautions 신·구 스키마 양립 (#2 의 정합 기준) ─────────────────────────
def test_precautions_new_schema():
    assert KakaoNotifier._precautions({"오늘의_주의사항": [{"수칙": "A"}, {"수칙": "B"}]}) == ["A", "B"]


def test_precautions_old_schema_fallback():
    assert KakaoNotifier._precautions({"안전_수칙": ["X", "Y"]}) == ["X", "Y"]


def test_precautions_prefers_new_over_old():
    g = {"오늘의_주의사항": [{"수칙": "신"}], "안전_수칙": ["구"]}
    assert KakaoNotifier._precautions(g) == ["신"]


def test_precautions_empty():
    assert KakaoNotifier._precautions({}) == []


# ── _guide_link 우선순위: GUIDE_PAGE_BASE > FRONTEND_URL > daiso ─────────────
def test_guide_link_default_fallback():
    assert KakaoNotifier._guide_link("123", "2026-01-01") == "https://www.daiso.co.kr"


def test_guide_link_frontend(monkeypatch):
    monkeypatch.setenv("FRONTEND_URL", "http://x")
    assert KakaoNotifier._guide_link("123", "2026-01-01") == "http://x/guide/2026-01-01/123.html"


def test_guide_link_base_override(monkeypatch):
    monkeypatch.setenv("GUIDE_PAGE_BASE", "http://g")
    assert KakaoNotifier._guide_link("123", "2026-01-01") == "http://g/2026-01-01/123.html"

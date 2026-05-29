"""core/alert_state.py 쿨다운 판정 단위 테스트 (S3 미사용)."""

from datetime import datetime, timedelta, timezone

from core.alert_state import should_skip_for_cooldown

KST = timezone(timedelta(hours=9))


def test_no_prior_state_does_not_skip():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    skip, reason = should_skip_for_cooldown(None, now, 1, "normal")
    assert skip is False
    assert reason == "no_prior_state"


def test_within_cooldown_skips():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    state = {"last_sent_at": (now - timedelta(hours=6)).isoformat()}
    skip, reason = should_skip_for_cooldown(state, now, 1, "normal")
    assert skip is True
    assert reason.startswith("within_cooldown")


def test_outside_cooldown_does_not_skip():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    state = {"last_sent_at": (now - timedelta(days=2)).isoformat()}
    skip, reason = should_skip_for_cooldown(state, now, 1, "normal")
    assert skip is False
    assert reason == "elapsed"


def test_high_severity_overrides_cooldown():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    state = {"last_sent_at": (now - timedelta(minutes=10)).isoformat()}
    skip, reason = should_skip_for_cooldown(state, now, 7, "high")
    assert skip is False
    assert reason == "severity_override"


def test_cooldown_zero_disabled():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    state = {"last_sent_at": (now - timedelta(minutes=1)).isoformat()}
    skip, reason = should_skip_for_cooldown(state, now, 0, "normal")
    assert skip is False
    assert reason == "cooldown_disabled"


def test_malformed_last_sent_does_not_skip():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    skip, reason = should_skip_for_cooldown({"last_sent_at": "not-a-date"}, now, 1, "normal")
    assert skip is False
    assert reason == "unparseable_last_sent"


def test_empty_last_sent_does_not_skip():
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    skip, reason = should_skip_for_cooldown({"last_sent_at": ""}, now, 1, "normal")
    assert skip is False
    assert reason == "no_last_sent"


def test_future_last_sent_does_not_skip():
    """시계 스큐로 미래 타임스탬프가 저장된 경우 영구 락 방지."""
    now = datetime(2026, 5, 27, 9, tzinfo=KST)
    future_state = {"last_sent_at": (now + timedelta(hours=2)).isoformat()}
    skip, reason = should_skip_for_cooldown(future_state, now, 7, "normal")
    assert skip is False
    assert reason == "clock_skew_future_timestamp"

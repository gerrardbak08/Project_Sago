"""core/recipients.py resolver 단위 테스트."""

import json
import unicodedata
from pathlib import Path

from core.recipients import resolve_recipients


def _data():
    return {
        "version": "2.0",
        "default": ["G1", "G2"],
        "stores": {
            "10130": {
                "_all": ["S1"],
                "depts": {
                    "식품": {
                        "_all": ["D_FOOD"],
                        "teams": {
                            "신선": ["T_FRESH_1", "T_FRESH_2"],
                            "가공": ["T_PROC"],
                        },
                    },
                    "비식품": {
                        "_all": ["D_NF"],
                        "teams": {"잡화": ["T_NF"]},
                    },
                },
            },
            # v1 하위 호환: 리스트 형태
            "20000": ["LEGACY1", "LEGACY2"],
        },
    }


def test_store_scope_flattens_all_depts_and_teams():
    r = resolve_recipients(_data(), "10130")
    assert r == [
        "G1", "G2", "S1",
        "D_FOOD", "T_FRESH_1", "T_FRESH_2", "T_PROC",
        "D_NF", "T_NF",
    ]


def test_dept_scope_includes_dept_all_and_all_its_teams():
    r = resolve_recipients(_data(), "10130", dept="식품")
    assert r == ["G1", "G2", "S1", "D_FOOD", "T_FRESH_1", "T_FRESH_2", "T_PROC"]


def test_team_scope_includes_only_that_team():
    r = resolve_recipients(_data(), "10130", dept="식품", team="신선")
    assert r == ["G1", "G2", "S1", "D_FOOD", "T_FRESH_1", "T_FRESH_2"]


def test_unknown_dept_returns_default_and_store_only():
    r = resolve_recipients(_data(), "10130", dept="없는부서")
    assert r == ["G1", "G2", "S1"]


def test_unknown_team_falls_back_to_dept_baseline():
    r = resolve_recipients(_data(), "10130", dept="식품", team="없는팀")
    assert r == ["G1", "G2", "S1", "D_FOOD"]


def test_v1_legacy_store_list_is_treated_as_store_all():
    r = resolve_recipients(_data(), "20000")
    assert r == ["G1", "G2", "LEGACY1", "LEGACY2"]


def test_unknown_store_returns_default_only():
    r = resolve_recipients(_data(), "99999")
    assert r == ["G1", "G2"]


def test_dedup_preserves_order():
    data = {
        "default": ["X"],
        "stores": {"1": {"_all": ["X", "Y"], "depts": {"A": {"_all": ["Y", "Z"], "teams": {}}}}},
    }
    r = resolve_recipients(data, "1")
    assert r == ["X", "Y", "Z"]


def test_store_code_int_works_same_as_str():
    assert resolve_recipients(_data(), 10130) == resolve_recipients(_data(), "10130")


def test_blank_and_none_uuids_filtered():
    data = {
        "default": ["", None, " A "],
        "stores": {"1": {"_all": ["B", ""], "depts": {}}},
    }
    r = resolve_recipients(data, "1")
    assert r == ["A", "B"]


def test_malformed_returns_empty():
    assert resolve_recipients(None, "1") == []
    assert resolve_recipients({}, "1") == []


def test_nfd_dept_key_matches_nfc_query():
    """macOS 등 NFD 로 저장된 키도 NFC 쿼리와 매칭되어야 한다."""
    nfd_key = unicodedata.normalize("NFD", "식품")
    data = {
        "default": [],
        "stores": {"1": {"_all": [], "depts": {nfd_key: {"_all": ["X"], "teams": {}}}}},
    }
    assert resolve_recipients(data, "1", dept="식품") == ["X"]


def test_dept_query_with_surrounding_whitespace_strips():
    data = {
        "default": [],
        "stores": {"1": {"_all": [], "depts": {"식품": {"_all": ["X"], "teams": {}}}}},
    }
    assert resolve_recipients(data, "1", dept="  식품  ") == ["X"]


def test_team_without_dept_raises():
    try:
        resolve_recipients({"default": [], "stores": {}}, "1", team="신선")
    except ValueError:
        return
    raise AssertionError("ValueError 미발생")


def test_dept_with_non_dict_value_is_skipped():
    data = {
        "default": ["G"],
        "stores": {"1": {"_all": ["S"], "depts": {"쓰레기": "garbage", "식품": {"_all": ["D"], "teams": {}}}}},
    }
    assert resolve_recipients(data, "1") == ["G", "S", "D"]


def test_team_with_non_list_value_is_skipped():
    data = {
        "default": [],
        "stores": {"1": {"_all": [], "depts": {"식품": {"_all": ["D"], "teams": {"신선": "oops"}}}}},
    }
    assert resolve_recipients(data, "1", dept="식품") == ["D"]


def test_sample_recipients_json_loads_and_resolves_empty():
    """저장소 샘플 파일이 스키마와 호환되고 빈 리스트를 반환해야 한다."""
    root = Path(__file__).resolve().parent.parent
    data = json.loads((root / "recipients.json").read_text("utf-8"))
    assert resolve_recipients(data, "10130") == []
    assert resolve_recipients(data, "10130", dept="식품") == []
    assert resolve_recipients(data, "10130", dept="식품", team="신선") == []

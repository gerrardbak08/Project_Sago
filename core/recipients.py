"""
core/recipients.py — 3계층(매장/부서/팀) 수신자 리졸버

스키마 (v2):
{
  "version": "2.0",
  "default": ["uuid_global", ...],        # 전 매장 공통(본부/안전관리자 등)
  "stores": {
    "10130": {
      "_all": ["uuid_store_manager"],      # 매장 단위 수신자(점장 등)
      "depts": {
        "식품": {
          "_all": ["uuid_dept_lead"],      # 부서 단위 수신자(부서 파트장)
          "teams": {
            "신선": ["uuid_team_lead"]      # 팀 단위 수신자(팀 리더)
          }
        }
      }
    }
  }
}

하위 호환 (v1):
{
  "default": [...],
  "stores": { "10130": ["uuid1", "uuid2"] }   # 리스트면 매장 _all 로 해석
}
"""

from __future__ import annotations

import unicodedata
from typing import Any


def _nfc(s: Any) -> str | None:
    """Korean dept/team 키 매칭을 위해 NFC 정규화. None/빈문자 → None."""
    if s is None:
        return None
    t = unicodedata.normalize("NFC", str(s)).strip()
    return t or None


def _as_store_node(node: Any) -> dict:
    """매장 노드를 v2 dict 형태로 정규화한다 (v1 리스트 호환)."""
    if isinstance(node, list):
        return {"_all": list(node), "depts": {}}
    if isinstance(node, dict):
        return {"_all": node.get("_all") or [], "depts": node.get("depts") or {}}
    return {"_all": [], "depts": {}}


def _normalize_depts(depts: dict) -> dict:
    """부서/팀 키를 NFC 정규화한 새 dict 반환 (원본 비파괴)."""
    if not isinstance(depts, dict):
        return {}
    out: dict[str, dict] = {}
    for k, v in depts.items():
        nk = _nfc(k)
        if nk is None or not isinstance(v, dict):
            continue
        teams = v.get("teams") or {}
        norm_teams: dict[str, list] = {}
        if isinstance(teams, dict):
            for tk, tv in teams.items():
                ntk = _nfc(tk)
                if ntk and isinstance(tv, list):
                    norm_teams[ntk] = tv
        out[nk] = {"_all": v.get("_all") or [], "teams": norm_teams}
    return out


def _dedup(uuids: list[str]) -> list[str]:
    """순서 유지 중복 제거."""
    seen: set[str] = set()
    out: list[str] = []
    for u in uuids:
        if not u:
            continue
        s = str(u).strip()
        if not s or s in seen:
            continue
        seen.add(s)
        out.append(s)
    return out


def resolve_recipients(
    recipients_data: dict,
    store_code: str | int,
    dept: str | None = None,
    team: str | None = None,
) -> list[str]:
    """매장/부서/팀 단위 수신자 UUID 리스트를 산출한다.

    범위 규칙:
      - dept None              → 매장 전체 (모든 부서·팀 포함)
      - dept 지정, team None   → 해당 부서 전체 (부서 _all + 그 부서의 모든 팀)
      - dept 지정, team 지정   → 해당 팀만 (부서 _all + 그 팀)
      - team 만 지정(dept None) → 의도 불명확 → ValueError

    항상 포함: default(글로벌) + store._all(매장 공통)
    중복 UUID 는 제거되며 추가된 순서를 유지한다.
    """
    n_dept = _nfc(dept)
    n_team = _nfc(team)
    if n_dept is None and n_team is not None:
        raise ValueError("team 만 지정할 수 없습니다. dept 가 함께 필요합니다.")

    if not isinstance(recipients_data, dict):
        return []

    out: list[str] = list(recipients_data.get("default") or [])

    stores = recipients_data.get("stores") or {}
    store_node = _as_store_node(stores.get(str(store_code).strip()))

    out.extend(store_node.get("_all") or [])

    depts = _normalize_depts(store_node.get("depts") or {})

    if n_dept is None:
        # 매장 전체: 모든 부서·팀 평탄화
        for _, d_node in depts.items():
            out.extend(d_node.get("_all") or [])
            for _, t_uuids in (d_node.get("teams") or {}).items():
                out.extend(t_uuids)
        return _dedup(out)

    d_node = depts.get(n_dept)
    if not isinstance(d_node, dict):
        # 지정된 부서가 스키마에 없으면 default + store._all 만 반환
        return _dedup(out)

    out.extend(d_node.get("_all") or [])
    teams = d_node.get("teams") or {}

    if n_team is None:
        for _, t_uuids in teams.items():
            out.extend(t_uuids)
        return _dedup(out)

    t_uuids = teams.get(n_team)
    if isinstance(t_uuids, list):
        out.extend(t_uuids)

    return _dedup(out)

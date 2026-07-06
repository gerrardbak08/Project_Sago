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


# ---------------------------------------------------------------------------
# 역인덱스 — 수신자 → 자기 조직 스코프 (정기 사고현황 브리핑용)
#
# resolve_recipients 는 "조직 → 담당자 UUID"(발송 대상 산출)인 반면,
# scope_for_user 는 "수신자 UUID → 그 사람의 사고집계 스코프"(무슨 데이터를 보낼지)다.
# 브리핑은 users 맵의 각 사람을 순회하며 자기 소속 범위(부문/영업부/팀/매장)의 현황만 받는다.
#
# ⚠️ recipients.json 의 stores 트리(매장→식품/비식품 부서→신선/가공 팀)는 '상품 부서' 계층이라
#    브리핑이 쓰는 '영업 조직' 계층(부문 수도권/지방 → 영업부 인천영업부 → 팀 일산팀 → 매장)과 다르다.
#    따라서 브리핑 소속은 트리 위치가 아니라 users 맵에 영업조직 값으로 명시한다(org_rollup 키와 일치).
#
# users 맵 스키마:
#   "users": {
#     "<uuid>": {"name":"홍길동","role":"영업부장","phone":"010-...",
#                "부문":"수도권","영업부":"인천영업부","팀":null,"매장":null}
#   }
# 가장 깊게 채워진 소속이 그 사람의 스코프(점장=매장, 팀장=팀, 영업부장=영업부, 부문장=부문).
# ---------------------------------------------------------------------------

def scope_for_user(recipients_data: dict, uuid: str) -> dict | None:
    """수신자 UUID → 사고집계 스코프. users 맵 필요. 없거나 소속 미상이면 None.

    반환: {uuid, name, role, contact, level, key, 부문, 영업부, 팀, 매장}
      level = store|team|dept|bumun (가장 구체적인 소속), key = 그 레벨의 조직명(org_rollup 키).
    """
    if not isinstance(recipients_data, dict):
        return None
    u = (recipients_data.get("users") or {}).get(str(uuid).strip())
    if not isinstance(u, dict):
        return None
    bumun = _nfc(u.get("부문"))
    dept = _nfc(u.get("영업부") or u.get("부서"))
    team = _nfc(u.get("팀"))
    store = _nfc(u.get("매장"))
    level, key = None, None
    if store:
        level, key = "store", store
    elif team:
        level, key = "team", team
    elif dept:
        level, key = "dept", dept
    elif bumun:
        level, key = "bumun", bumun
    if level is None:
        return None
    return {
        "uuid": str(uuid).strip(),
        "name": u.get("name"),
        "role": u.get("role"),
        "phone": u.get("phone"),                 # 알림톡 발송 키
        "contact": u.get("phone") or u.get("kakao_uuid"),
        "consent": u.get("consent", True),        # 수신 근거(정보성 안내·수신거부 반영)
        "level": level,
        "key": key,
        "부문": bumun, "영업부": dept, "팀": team, "매장": store,
    }


def all_user_scopes(recipients_data: dict) -> list[dict]:
    """users 맵 전체를 스코프 리스트로 산출한다 (브리핑 발송 대상 순회용)."""
    users = (recipients_data or {}).get("users") or {}
    out: list[dict] = []
    for uuid in users:
        sc = scope_for_user(recipients_data, uuid)
        if sc:
            out.append(sc)
    return out

"""
core/hr_sync.py — 인사/조직도 레코드 → 브리핑 수신자 디렉터리(users) 변환

"부서로 못 보낸다"의 해결: HR엔 '사람+직책+소속'이 있고 '브리핑 스코프'는 없다.
직책(팀장/영업부장 등)을 스코프 level(team/dept…)로, 소속을 스코프 key로 매핑해
각 개인이 자기 조직 범위의 브리핑을 받도록 users 디렉터리를 만든다.

HR 시스템별 컬럼명은 다르므로, 얇은 어댑터가 아래 정규화 필드로 맞춰 넘긴다:
  record = {name, title, phone, 부문, 영업부, 팀, 매장, active?, consent?}
그다음 hr_records_to_users() 가 스코프를 부여한다. 소속명이 org_rollup 키와 다르면
org_alias 로 보정(예: HR "인천영업부문" → 사고DB "인천영업부").
"""

from __future__ import annotations

import re
import unicodedata

# 직책 키워드 → 스코프 level. 구체적인 것(점장/팀장)부터 검사.
# 주의: '부문장'과 '부장'은 서로 부분문자열이 아니라 안전하게 구분됨.
_TITLE_LEVEL = [
    ("store", ["점장", "점포장", "지점장"]),
    ("team", ["팀장"]),
    ("bumun", ["부문장"]),          # 영업부문장 포함
    ("dept", ["영업부장", "부장"]),  # 영업부장/부장 (부문장 제외 후)
]

# 스코프 level → 소속 key 를 뽑을 필드
_LEVEL_FIELD = {"bumun": "부문", "dept": "영업부", "team": "팀", "store": "매장"}


def _nfc(s) -> str | None:
    if s is None:
        return None
    t = unicodedata.normalize("NFC", str(s)).strip()
    return t or None


def title_to_level(title: str | None) -> str | None:
    """직책 문자열 → 스코프 level. 매칭 없으면 None(브리핑 대상 아님: 사원·파트장 등)."""
    t = _nfc(title) or ""
    for level, kws in _TITLE_LEVEL:
        if any(k in t for k in kws):
            return level
    return None


def _norm_phone(phone) -> str | None:
    """전화번호 정규화 — 숫자만(알림톡 매칭 키). 없으면 None."""
    if phone is None:
        return None
    digits = re.sub(r"\D", "", str(phone))
    return digits or None


def apply_alias(name: str | None, org_alias: dict | None) -> str | None:
    """소속명을 org_rollup 키로 보정(별칭 매핑)."""
    n = _nfc(name)
    if n is None:
        return None
    if org_alias and n in org_alias:
        return org_alias[n]
    return n


def hr_records_to_users(records: list[dict], org_alias: dict | None = None) -> dict:
    """정규화된 HR 레코드 리스트 → users 디렉터리.

    스킵 규칙: 직책이 4개 레벨(부문/영업부/팀/매장 장)에 안 맞거나, 소속 key·전화번호가 없거나,
              active=False 면 제외. consent 는 유지(발송 단계에서 필터).
    id 는 phone 기반(중복 시 소속 접미).
    """
    users: dict[str, dict] = {}
    for r in records:
        level = title_to_level(r.get("title"))
        if level is None:
            continue
        key = apply_alias(r.get(_LEVEL_FIELD[level]), org_alias)
        phone = _norm_phone(r.get("phone"))
        active = r.get("active", True)
        if not key or not phone or active is False:
            continue
        uid = f"hr-{phone}"
        if uid in users:  # 동일 전화 중복 → 소속으로 구분
            uid = f"{uid}-{key}"
        users[uid] = {
            "name": _nfc(r.get("name")),
            "phone": phone,
            "role": _nfc(r.get("title")),
            "consent": bool(r.get("consent", True)),
            "부문": apply_alias(r.get("부문"), org_alias),
            "영업부": apply_alias(r.get("영업부"), org_alias),
            "팀": apply_alias(r.get("팀"), org_alias),
            "매장": apply_alias(r.get("매장"), org_alias),
        }
    return users

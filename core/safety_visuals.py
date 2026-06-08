"""
safety_visuals.py — 위험유형 → 카드 비주얼 메타데이터 (생성기·notifier 공유)

사고 사례 사진이 없을 때, dominant 위험유형에 맞는 '경고 표지판' 대표 이미지를
카드에 쓴다. scripts/make_category_images.py 가 이 메타로 PNG를 생성하고,
core/notifier.py 가 image_ref()로 카드 이미지를 고른다.

런타임 의존성 없음(순수 데이터) — Lambda 에서도 안전하게 import.
"""

from __future__ import annotations

# 각 카테고리: slug(파일명), 표시명, 키워드(부제), accent 색(RGB), 매칭 유형 목록
CATEGORIES: list[dict] = [
    {"slug": "fall", "name": "낙상 위험", "keyword": "물기·미끄럼·단차를 먼저 확인",
     "color": (245, 166, 35), "types": ["낙상", "떨어짐", "추락"]},
    {"slug": "slip", "name": "넘어짐 주의", "keyword": "바닥 물기·결빙·장애물 주의",
     "color": (245, 197, 24), "types": ["넘어짐", "미끄러짐", "전도"]},
    {"slug": "collision", "name": "충돌·부딪힘", "keyword": "이동 동선·돌출물·적재물 주의",
     "color": (229, 72, 77), "types": ["충돌", "부딪힘", "물체에 맞음", "맞음"]},
    {"slug": "cut", "name": "베임·자상", "keyword": "칼·날·금속 모서리 취급 주의",
     "color": (255, 107, 53), "types": ["자상", "베임", "절단"]},
    {"slug": "caught", "name": "끼임·협착", "keyword": "기계·문·적재물 사이 주의",
     "color": (142, 92, 217), "types": ["끼임", "깔림", "협착"]},
    {"slug": "strain", "name": "무리한 동작", "keyword": "중량물·반복작업 자세 주의",
     "color": (48, 164, 108), "types": ["무리한 동작", "근골격"]},
    {"slug": "property", "name": "재물 손상", "keyword": "진열·적재물 파손·낙하 주의",
     "color": (43, 179, 163), "types": ["재물", "재물손상", "파손"]},
    {"slug": "claim", "name": "고객 클레임", "keyword": "응대·안전 안내에 유의",
     "color": (74, 144, 217), "types": ["클레임", "민원"]},
    {"slug": "health", "name": "건강·중대 위험", "keyword": "과로·기저질환 관리 주의",
     "color": (198, 40, 40), "types": ["질병", "사망", "뇌출혈", "만성질환"]},
    {"slug": "default", "name": "안전 경고", "keyword": "오늘 매장 안전에 유의",
     "color": (154, 160, 172), "types": ["기타"]},
]

_BY_SLUG = {c["slug"]: c for c in CATEGORIES}
DEFAULT = _BY_SLUG["default"]


def category_for(dominant: str | None) -> dict:
    """dominant 위험유형 문자열 → 카테고리 메타 (substring 매칭, 미스 시 default)."""
    text = str(dominant or "").strip()
    if text:
        # 첫 토큰(쉼표/슬래시 분리) 기준
        head = text.split(",")[0].split("/")[0].strip()
        cats = [c for c in CATEGORIES if c["slug"] != "default"]
        # 1) 정확 일치 (가장 강한 신호)
        for cat in cats:
            if head in cat["types"]:
                return cat
        # 2) 유형명이 dominant 구절에 포함 (예: "전도(강풍)" ⊃ "전도")
        for cat in cats:
            for t in cat["types"]:
                if t and t in head:
                    return cat
        # 3) dominant가 유형명의 부분 (2자 이상만 — "사"→"사망" 같은 1자 오매칭 차단)
        if len(head) >= 2:
            for cat in cats:
                for t in cat["types"]:
                    if head in t:
                        return cat
    return DEFAULT


def image_ref(dominant: str | None) -> str:
    """dominant → 'images/categories/{slug}.png' (경고 표지판) 상대 경로."""
    return f"images/categories/{category_for(dominant)['slug']}.png"


def scene_ref(dominant: str | None) -> str:
    """dominant → 'images/scenes/{slug}.png' (실사 장면) 상대 경로.

    파일이 아직 없으면 notifier 가 다음 후보(경고 표지판)로 자동 강등하므로,
    실사 장면은 만들어진 유형부터 점진적으로 활성화된다.
    """
    return f"images/scenes/{category_for(dominant)['slug']}.png"

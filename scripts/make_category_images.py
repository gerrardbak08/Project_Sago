#!/usr/bin/env python3
"""
make_category_images.py — 위험유형별 '경고 표지판' 카드 이미지 생성 (PIL)

사고 사례 사진이 유실된 상태에서, dominant 위험유형에 맞는 대표 이미지를 만든다.
디자인: 상단 빨강 경고 띠 + 중앙 노랑 위험 삼각형(!) + 큰 위험유형명 + 키워드 + 브랜드.
모든 핵심 요소를 가운데 세로축에 배치해, 카카오 피드가 좌우를 크롭해도 살아남게 한다.

출력: images/categories/{slug}.png (800×400, 2:1 — 카카오 피드 권장 비율)
메타: core/safety_visuals.CATEGORIES 공유. deploy.sh 가 images/ 를 S3로 동기화.

사용: python3 scripts/make_category_images.py
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from PIL import Image, ImageDraw, ImageFont

from core.safety_visuals import CATEGORIES

OUT_DIR = ROOT / "images" / "categories"
FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"

W, H = 800, 400
BG = (18, 22, 30)            # 근-블랙 배경
ALERT_RED = (230, 0, 18)     # 다이소 레드 — 상단 경고 띠
TRI_FILL = (245, 197, 24)    # 위험 삼각형 노랑
TRI_EDGE = (26, 26, 26)
WHITE = (255, 255, 255)
SUB = (184, 190, 201)
BRAND = (122, 130, 143)


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def _center_text(draw, cx, y, text, font, fill, stroke=0, stroke_fill=None):
    l, t, r, b = draw.textbbox((0, 0), text, font=font, stroke_width=stroke)
    draw.text((cx - (r - l) / 2 - l, y), text, font=font, fill=fill,
              stroke_width=stroke, stroke_fill=stroke_fill)
    return b - t


def _warning_triangle(draw, cx, top, size):
    """정삼각형 위험 표지판 + 느낌표."""
    h = size * 0.88
    pts = [(cx, top), (cx - size / 2, top + h), (cx + size / 2, top + h)]
    draw.polygon(pts, fill=TRI_FILL)
    draw.line([pts[0], pts[1], pts[2], pts[0]], fill=TRI_EDGE, width=8, joint="curve")
    # 느낌표 (삼각형 중앙)
    ex_font = _font(int(size * 0.52))
    l, t, r, b = draw.textbbox((0, 0), "!", font=ex_font)
    draw.text((cx - (r - l) / 2 - l, top + h * 0.30), "!", font=ex_font, fill=TRI_EDGE)


def build(cat: dict) -> Path:
    img = Image.new("RGB", (W, H), BG)
    d = ImageDraw.Draw(img)
    color = tuple(cat["color"])

    # 상단 경고 띠
    strip_h = 60
    d.rectangle([0, 0, W, strip_h], fill=ALERT_RED)
    _center_text(d, W / 2, 13, "안전 경고  ·  SAFETY ALERT", _font(28), WHITE)

    # 콘텐츠 블록(삼각형+유형명+밑줄+키워드)을 본문 영역 세로 중앙에 배치
    name_font, kw_font = _font(72), _font(26)
    tri_size = 116
    tri_h = tri_size * 0.88
    nb = d.textbbox((0, 0), cat["name"], font=name_font, stroke_width=2)
    name_h, name_w = nb[3] - nb[1], nb[2] - nb[0]
    kb = d.textbbox((0, 0), cat["keyword"], font=kw_font)
    kw_h = kb[3] - kb[1]
    GAP1, GAP2, UND_H, GAP3 = 18, 20, 7, 16
    block = tri_h + GAP1 + name_h + GAP2 + UND_H + GAP3 + kw_h

    footer_zone = 48
    y = strip_h + max(0, ((H - footer_zone) - strip_h - block) / 2)

    _warning_triangle(d, W / 2, y, tri_size)
    y += tri_h + GAP1
    _center_text(d, W / 2, y, cat["name"], name_font, WHITE, stroke=2, stroke_fill=BG)
    y += name_h + GAP2
    d.rectangle([W / 2 - name_w / 2, y, W / 2 + name_w / 2, y + UND_H], fill=color)
    y += UND_H + GAP3
    _center_text(d, W / 2, y, cat["keyword"], kw_font, SUB)

    # 브랜드 푸터
    _center_text(d, W / 2, H - 34, "(주)아성다이소 안전보건팀  ·  AI 안전가이드", _font(20), BRAND)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    out = OUT_DIR / f"{cat['slug']}.png"
    img.save(out, "PNG")
    return out


def main() -> int:
    made = [build(c) for c in CATEGORIES]
    print(f"✅ {len(made)}개 생성 → {OUT_DIR.relative_to(ROOT)}/")
    for p in made:
        print("  -", p.name)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

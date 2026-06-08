#!/usr/bin/env python3
"""
annotate_scene.py — 실사 장면 이미지에 안전 카드 주석을 입힌다.

reference 카드 스타일: 하단 어두운 그라데이션 + 굵은 흰 캡션(위험 상황 한 줄) +
위험 지점을 가리키는 빨간 강조 원. 생성된 실사 이미지(Pollinations/Gemini/OpenAI)에
공통으로 적용한다.

CLI:
  python3 scripts/annotate_scene.py --src /tmp/slip_42.png --dst images/scenes/fall.png \
      --caption "물기 있는 바닥에 미끄러져 낙상" --circle 0.42,0.78,0.10
  (--circle 생략 시 원 없음. 값은 가로/세로 대비 비율 cx,cy,r)
"""

from __future__ import annotations

import argparse
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
RED = (255, 38, 38)
WHITE = (255, 255, 255)


def _font(size: int) -> ImageFont.FreeTypeFont:
    return ImageFont.truetype(FONT_PATH, size)


def _fit_caption_font(draw, text, max_w, start, min_size=30):
    size = start
    while size > min_size:
        f = _font(size)
        l, _, r, _ = draw.textbbox((0, 0), text, font=f, stroke_width=2)
        if r - l <= max_w:
            return f
        size -= 2
    return _font(min_size)


def annotate(src, dst, caption: str, circle: tuple[float, float, float] | None = None) -> Path:
    img = Image.open(src).convert("RGB")
    W, H = img.size
    draw = ImageDraw.Draw(img, "RGBA")

    # 빨간 강조 원 (hollow, 두꺼운 테두리 + 옅은 외곽)
    if circle:
        cx, cy, rr = circle[0] * W, circle[1] * H, circle[2] * max(W, H)
        box = [cx - rr, cy - rr, cx + rr, cy + rr]
        draw.ellipse([b + d for b, d in zip(box, (-4, -4, 4, 4))], outline=(255, 38, 38, 90), width=10)
        draw.ellipse(box, outline=RED, width=max(6, W // 150))

    # 하단 그라데이션 (투명 → 어둡게) — 캡션 가독성
    grad_h = int(H * 0.34)
    grad = Image.new("L", (1, grad_h), 0)
    for y in range(grad_h):
        grad.putpixel((0, y), int(225 * (y / grad_h) ** 1.4))
    alpha = grad.resize((W, grad_h))
    shade = Image.new("RGBA", (W, grad_h), (0, 0, 0, 255))
    shade.putalpha(alpha)
    img.paste(Image.new("RGB", (W, grad_h), (0, 0, 0)), (0, H - grad_h), shade)

    # 캡션 (굵게, 외곽선) — 하단 중앙
    draw = ImageDraw.Draw(img)
    pad = int(W * 0.05)
    f = _fit_caption_font(draw, caption, W - 2 * pad, start=int(W * 0.065))
    l, t, r, b = draw.textbbox((0, 0), caption, font=f, stroke_width=3)
    tx = (W - (r - l)) / 2 - l
    ty = H - (b - t) - int(H * 0.055)
    draw.text((tx, ty), caption, font=f, fill=WHITE, stroke_width=3, stroke_fill=(0, 0, 0))

    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    img.save(dst, "PNG")
    return Path(dst)


def _parse_circle(s: str | None):
    if not s:
        return None
    parts = [float(x) for x in s.split(",")]
    return tuple(parts[:3]) if len(parts) == 3 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dst", required=True)
    ap.add_argument("--caption", required=True)
    ap.add_argument("--circle", help="cx,cy,r (가로/세로 대비 비율, 예: 0.42,0.78,0.10)")
    args = ap.parse_args()
    out = annotate(args.src, args.dst, args.caption, _parse_circle(args.circle))
    print(f"✅ 주석 완료 → {out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

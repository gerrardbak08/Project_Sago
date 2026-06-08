#!/usr/bin/env python3
"""
animate_scene.py — 실사 장면을 '무료' 애니메이션(GIF)으로 만든다.

AI 영상이 무료로 불가하므로, 생성된 정지 실사 장면에 프로그래밍 모션을 입힌다:
  - Ken Burns 부드러운 줌인(smoothstep)
  - 위험 지점 빨간 원 '락온'(크게 → 딱 맞게 좁혀짐) 후 맥동
  - 하단 그라데이션 + 캡션 슬라이드업·페이드인
화질: 프레임 공통 256색 팔레트 + Floyd-Steinberg 디더(포스터화·깜빡임 완화).

CLI:
  python3 scripts/animate_scene.py --src /tmp/scene_fall.png --dst images/scenes/anim/fall.gif \
      --caption "물기 있는 바닥에 미끄러져 낙상" --circle 0.50,0.78,0.11
"""

from __future__ import annotations

import argparse
import math
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
RED = (255, 38, 38)


def _font(size: int):
    return ImageFont.truetype(FONT_PATH, size)


def _smoothstep(t: float) -> float:
    t = max(0.0, min(1.0, t))
    return t * t * (3 - 2 * t)


def _ken_burns(img: Image.Image, scale: float, out_w: int, out_h: int) -> Image.Image:
    W, H = img.size
    cw, ch = int(W / scale), int(H / scale)
    left, top = (W - cw) // 2, (H - ch) // 2
    return img.crop((left, top, left + cw, top + ch)).resize((out_w, out_h), Image.LANCZOS)


def _fit_caption_font(draw, text, max_w, start, min_size=22):
    size = start
    while size > min_size:
        f = _font(size)
        l, _, r, _ = draw.textbbox((0, 0), text, font=f, stroke_width=2)
        if r - l <= max_w:
            return f
        size -= 2
    return _font(min_size)


def animate(src, dst, caption: str, circle=None, *, out_w=720, out_h=540,
            frames=26, duration=80) -> Path:
    base = Image.open(src).convert("RGB")
    rgb_seq: list[Image.Image] = []

    for i in range(frames):
        t = i / (frames - 1)
        z = _smoothstep(t / 0.65)                       # 줌은 65%에서 마무리
        scale = 1.04 + 0.12 * z
        frame = _ken_burns(base, scale, out_w, out_h).convert("RGBA")
        draw = ImageDraw.Draw(frame, "RGBA")

        # 빨간 원: 0.15~0.45 락온(크게→타깃), 이후 맥동
        if circle and t > 0.15:
            cx, cy, rr = circle
            fx, fy = (cx - 0.5) * scale + 0.5, (cy - 0.5) * scale + 0.5
            px, py = fx * out_w, fy * out_h
            base_r = rr * max(out_w, out_h) * scale
            if t < 0.45:
                k = _smoothstep((t - 0.15) / 0.30)
                r = base_r * (1.9 - 0.9 * k)
                a = int(255 * k)
            else:
                p = (t - 0.45) / 0.55
                r = base_r * (1 + 0.12 * math.sin(p * math.pi * 3))
                a = int(210 + 45 * math.sin(p * math.pi * 3))
            draw.ellipse([px - r - 5, py - r - 5, px + r + 5, py + r + 5],
                         outline=(255, 38, 38, max(0, a - 150)), width=9)
            draw.ellipse([px - r, py - r, px + r, py + r],
                         outline=(255, 38, 38, a), width=max(5, out_w // 120))

        # 하단 그라데이션
        gh = int(out_h * 0.34)
        grad = Image.new("L", (1, gh), 0)
        for y in range(gh):
            grad.putpixel((0, y), int(225 * (y / gh) ** 1.4))
        shade = Image.new("RGBA", (out_w, gh), (0, 0, 0, 255))
        shade.putalpha(grad.resize((out_w, gh)))
        frame.alpha_composite(shade, (0, out_h - gh))

        # 캡션 슬라이드업 + 페이드 (0.30~0.60)
        ca = _smoothstep((t - 0.30) / 0.30)
        if ca > 0:
            d2 = ImageDraw.Draw(frame)
            f = _fit_caption_font(d2, caption, int(out_w * 0.9), int(out_w * 0.060))
            l, tt, r2, b = d2.textbbox((0, 0), caption, font=f, stroke_width=3)
            tx = (out_w - (r2 - l)) / 2 - l
            ty = out_h - (b - tt) - int(out_h * 0.05) + int((1 - ca) * 26)
            txt = Image.new("RGBA", (out_w, out_h), (0, 0, 0, 0))
            ImageDraw.Draw(txt).text((tx, ty), caption, font=f,
                                     fill=(255, 255, 255, int(255 * ca)),
                                     stroke_width=3, stroke_fill=(0, 0, 0, int(255 * ca)))
            frame = Image.alpha_composite(frame, txt)

        rgb_seq.append(frame.convert("RGB"))

    # 공통 256색 팔레트(후반 프레임 기준) + 디더 → 포스터화·깜빡임 완화
    pal = rgb_seq[frames * 2 // 3].quantize(colors=256, method=Image.MEDIANCUT)
    seq = [f.quantize(palette=pal, dither=Image.FLOYDSTEINBERG) for f in rgb_seq]

    Path(dst).parent.mkdir(parents=True, exist_ok=True)
    seq[0].save(dst, save_all=True, append_images=seq[1:], duration=duration,
                loop=0, optimize=True, disposal=2)
    return Path(dst)


def _parse_circle(s):
    if not s:
        return None
    p = [float(x) for x in s.split(",")]
    return tuple(p[:3]) if len(p) == 3 else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True)
    ap.add_argument("--dst", required=True)
    ap.add_argument("--caption", required=True)
    ap.add_argument("--circle")
    ap.add_argument("--width", type=int, default=720)
    ap.add_argument("--height", type=int, default=540)
    ap.add_argument("--frames", type=int, default=26)
    a = ap.parse_args()
    out = animate(a.src, a.dst, a.caption, _parse_circle(a.circle),
                  out_w=a.width, out_h=a.height, frames=a.frames)
    print(f"✅ {out} ({out.stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

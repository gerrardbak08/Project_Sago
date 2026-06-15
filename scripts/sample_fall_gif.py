#!/usr/bin/env python3
"""
sample_fall_gif.py — 낙상(fall) 18프레임 모션 GIF 샘플 생성기

설계: 서있음(0~3) → 균형상실·기울어짐(4~11) → 쓰러짐(12~17) → 정지(hold)
이징: ease-in-out. 전신을 발 피벗 기준으로 회전 + 팔 허우적.
파이프라인: SVG 프레임 → rsvg-convert → PIL GIF 합성.
"""
import math
import os
import subprocess
import tempfile

from PIL import Image

W = H = 480
NAVY = "#1a1a2e"
RED = "#e63946"
YELLOW = "#f4c430"
OUT = os.path.join(os.path.dirname(__file__), "out", "pictogram_samples")
os.makedirs(OUT, exist_ok=True)

# 발 피벗(바닥에 닿는 지점)
PIVOT_X, PIVOT_Y = 230, 330
GROUND_Y = 330


def ease_in_out(t: float) -> float:
    return 0.5 * (1 - math.cos(math.pi * t)) if 0 <= t <= 1 else (0.0 if t < 0 else 1.0)


def rot(px, py, cx, cy, deg):
    """(px,py)를 (cx,cy) 기준 deg도 회전."""
    r = math.radians(deg)
    dx, dy = px - cx, py - cy
    return (cx + dx * math.cos(r) - dy * math.sin(r),
            cy + dx * math.sin(r) + dy * math.cos(r))


def line(x1, y1, x2, y2, w=12, color=NAVY):
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')


def circle(cx, cy, r, color=NAVY):
    return f'<circle cx="{cx:.1f}" cy="{cy:.1f}" r="{r}" fill="{color}"/>'


def frame_svg(i: int, n: int) -> str:
    """프레임 i의 SVG 문자열 생성.

    핵심: 전신을 '하나의 강체'로 발 피벗 기준 같은 각도로 회전시킨다.
    팔만 어깨 관절을 축으로 추가 회전(허우적)시켜 항상 붙어있게 한다.
    → 어떤 관절도 분리되지 않음.
    """
    # 단계별 진행도
    if i <= 3:
        fall = 0.0
        wobble = math.sin(i * 1.2) * 1.5  # 미세 흔들림
    else:
        t = (i - 3) / (n - 1 - 3)
        fall = ease_in_out(min(t, 1.0))
        wobble = 0

    angle = 80 * fall  # 전신 회전 (강체)

    # 직립 자세 골격 (관절 좌표)
    hip = (PIVOT_X, PIVOT_Y - 110)      # 골반
    neck = (PIVOT_X, PIVOT_Y - 190)     # 목/어깨
    head = (PIVOT_X, PIVOT_Y - 217)     # 머리 중심
    foot_l = (PIVOT_X - 28, PIVOT_Y)    # 왼발
    foot_r = (PIVOT_X + 24, PIVOT_Y)    # 오른발
    shoulder = neck                     # 팔이 붙는 관절

    # 팔: 어깨(shoulder) 축으로만 허우적 → 어깨에서 절대 분리 안 됨
    arm_l_end = (neck[0] - 52, neck[1] + 22)
    arm_r_end = (neck[0] + 48, neck[1] + 26)
    flail = fall * 40
    arm_l_end = rot(*arm_l_end, *shoulder, -flail)        # 왼팔 위로
    arm_r_end = rot(*arm_r_end, *shoulder, flail * 1.2)   # 오른팔 위로

    # 전신 강체 회전 — 모든 관절에 동일 각도 적용
    cx, cy = PIVOT_X + wobble, PIVOT_Y
    hip = rot(*hip, cx, cy, angle)
    neck = rot(*neck, cx, cy, angle)
    head = rot(*head, cx, cy, angle)
    foot_l = rot(*foot_l, cx, cy, angle)
    foot_r = rot(*foot_r, cx, cy, angle)
    arm_l_end = rot(*arm_l_end, cx, cy, angle)
    arm_r_end = rot(*arm_r_end, cx, cy, angle)

    parts = [f'<rect width="{W}" height="{H}" fill="white"/>']
    # 바닥
    parts.append(line(70, GROUND_Y, 410, GROUND_Y, 10, YELLOW))
    # 하강 화살표 (기울기 시작 후 페이드/이동)
    if fall > 0.1:
        ay = 150 + fall * 120
        op = min(fall * 1.5, 1.0)
        parts.append(f'<g opacity="{op:.2f}">')
        parts.append(line(360, 150, 360, ay, 7, RED))
        parts.append(f'<path d="M352 {ay} L368 {ay} L360 {ay+16} Z" fill="{RED}"/>')
        parts.append('</g>')
    # 다리
    parts.append(line(hip[0], hip[1], foot_l[0], foot_l[1]))
    parts.append(line(hip[0], hip[1], foot_r[0], foot_r[1]))
    # 몸통
    parts.append(line(hip[0], hip[1], neck[0], neck[1], 13))
    # 팔
    parts.append(line(neck[0], neck[1], arm_l_end[0], arm_l_end[1], 11))
    parts.append(line(neck[0], neck[1], arm_r_end[0], arm_r_end[1], 11))
    # 머리
    parts.append(circle(head[0], head[1], 27))
    # 충격 표시 (쓰러진 직후)
    if fall > 0.85:
        op = (fall - 0.85) / 0.15
        parts.append(f'<g opacity="{op:.2f}" stroke="{RED}" stroke-width="4" stroke-linecap="round">')
        for a in range(0, 360, 45):
            r = math.radians(a)
            x1 = head[0] + math.cos(r) * 32
            y1 = head[1] + math.sin(r) * 32
            x2 = head[0] + math.cos(r) * 46
            y2 = head[1] + math.sin(r) * 46
            parts.append(f'<line x1="{x1:.0f}" y1="{y1:.0f}" x2="{x2:.0f}" y2="{y2:.0f}"/>')
        parts.append('</g>')
    # 캡션
    parts.append(f'<text x="{W/2}" y="440" font-family="sans-serif" font-size="28" '
                 f'font-weight="700" fill="{NAVY}" text-anchor="middle">낙상 주의</text>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(parts) + '</svg>')


def main():
    n = 18
    images = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            svg = frame_svg(i, n)
            svg_path = os.path.join(tmp, f"f{i:02d}.svg")
            png_path = os.path.join(tmp, f"f{i:02d}.png")
            with open(svg_path, "w") as fp:
                fp.write(svg)
            subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H),
                            svg_path, "-o", png_path], check=True)
            images.append(Image.open(png_path).convert("RGBA").convert("P", palette=Image.ADAPTIVE))

    # 끝 프레임 정지(hold): 마지막 프레임 6장 추가 → 0.5초 멈춤
    durations = [83] * n
    for _ in range(6):
        images.append(images[-1].copy())
        durations.append(83)

    out = os.path.join(OUT, "fall_gif.gif")
    images[0].save(out, save_all=True, append_images=images[1:],
                   duration=durations, loop=0, disposal=2)
    print(f"GIF 생성: {out} ({len(images)}프레임)")


if __name__ == "__main__":
    main()

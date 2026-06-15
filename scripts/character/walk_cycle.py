#!/usr/bin/env python3
"""
walk_cycle.py — 매장 근로자 캐릭터 걷기 사이클 (게임 애니메이션 원칙 적용)

원칙:
  · 다리/팔 역위상 (왼다리 앞 ↔ 오른팔 앞)
  · 몸통 2회 바운스/사이클 (contact 낮음 → passing 높음)
  · 무릎 굽힘: 뒤→앞 들어올릴 때 최대
  · 상체 미세 전방 기울기 + 좌우 흔들림
  · 머리 카운터 바운스 (follow-through)
출력: PNG 프레임 시퀀스 → 애니메이션 WebP + GIF.
"""
import math
import os
import subprocess
import tempfile

from PIL import Image

import worker

OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)


def lerp(a, b, t):
    return a + (b - a) * t


def walk_pose(t: float) -> dict:
    """t∈[0,1) 걷기 사이클 한 주기의 포즈."""
    tau = 2 * math.pi
    # 다리 스윙 (역위상)
    swing = 26
    leg_l = swing * math.sin(tau * t)
    leg_r = swing * math.sin(tau * t + math.pi)
    # 무릎: 다리가 뒤→앞 이동(스윙 중) 굽힘 최대, 디딤(스탠스) 시 거의 폄
    knee_l = max(0, -math.cos(tau * t)) * 38       # t=0.5 부근(왼다리 뒤) 굽힘
    knee_r = max(0, -math.cos(tau * t + math.pi)) * 38
    # 팔 스윙 (다리와 반대)
    arm_sw = 22
    arm_l = arm_sw * math.sin(tau * t + math.pi) + 6
    arm_r = arm_sw * math.sin(tau * t) - 6
    arm_l_bend = 14 + max(0, math.sin(tau * t)) * 12
    arm_r_bend = 14 + max(0, math.sin(tau * t + math.pi)) * 12
    # 몸통 바운스: 2회/사이클, contact(t=0,0.5) 낮고 passing(t=0.25,0.75) 높음
    bob = -math.cos(2 * tau * t) * 5 - 3            # 위로 갈수록 음수(y 작아짐)
    # 좌우 무게이동 흔들림 (1회/사이클)
    tilt = math.sin(tau * t) * 3.5
    # 머리 카운터 바운스 (살짝 늦게)
    head_tilt = -tilt * 0.4 + math.sin(tau * t + 0.6) * 1.5

    return {
        "cx": 240, "cy": 250,
        "bob": bob, "tilt": tilt, "head_tilt": head_tilt,
        "leg_l": leg_l, "leg_r": leg_r,
        "leg_l_bend": knee_l, "leg_r_bend": knee_r,
        "arm_l": arm_l, "arm_r": arm_r,
        "arm_l_bend": arm_l_bend, "arm_r_bend": arm_r_bend,
        "face": "smile",
    }


def render_frames(pose_fn, n, prefix):
    """pose_fn(t) → n프레임 PNG 렌더 → PIL 이미지 리스트."""
    imgs = []
    with tempfile.TemporaryDirectory() as tmp:
        for i in range(n):
            t = i / n
            svg = worker.draw(pose_fn(t))
            sp = os.path.join(tmp, f"{prefix}{i:02d}.svg")
            pp = os.path.join(tmp, f"{prefix}{i:02d}.png")
            open(sp, "w").write(svg)
            subprocess.run(["rsvg-convert", "-w", str(worker.W), "-h", str(worker.H),
                            sp, "-o", pp], check=True)
            imgs.append(Image.open(pp).convert("RGBA"))
    return imgs


def save_anim(imgs, name, fps=16):
    dur = int(1000 / fps)
    # WebP (풀컬러, 경량)
    webp = os.path.join(OUT, f"{name}.webp")
    imgs[0].save(webp, save_all=True, append_images=imgs[1:],
                 duration=dur, loop=0, format="WEBP", quality=90, method=6)
    # GIF (폴백)
    gif = os.path.join(OUT, f"{name}.gif")
    pal = [im.convert("P", palette=Image.ADAPTIVE, colors=128) for im in imgs]
    pal[0].save(gif, save_all=True, append_images=pal[1:],
                duration=dur, loop=0, disposal=2)
    # 정적 프레임 스트립 (검수용)
    strip = Image.new("RGBA", (worker.W * 6, worker.H), "white")
    for i in range(6):
        strip.paste(imgs[int(i / 6 * len(imgs))], (i * worker.W, 0))
    strip.convert("RGB").save(os.path.join(OUT, f"{name}_strip.png"))
    print(f"{name}: webp {os.path.getsize(webp)//1024}KB · gif {os.path.getsize(gif)//1024}KB · {len(imgs)}f")


if __name__ == "__main__":
    frames = render_frames(walk_pose, 16, "walk")
    save_anim(frames, "walk", fps=16)

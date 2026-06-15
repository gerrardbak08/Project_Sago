#!/usr/bin/env python3
"""
scenarios.py — 매장 근로자 캐릭터 10대 사고 시나리오 애니메이션 생성

물리(낙상)=pymunk 래그돌 / 절차적(나머지)=worker.draw 키프레임 + 소품·이펙트.
각 시나리오 → WebP. 전체 → 컨택트 시트(대표 프레임).
시나리오는 '베이스'로 1회 렌더 → 발송 시 매장명 오버레이만 합성(stamp).
"""
import math
import os
import subprocess
import tempfile

import pymunk
from PIL import Image

import worker
import physics_fall as pf

OUT = os.path.join(os.path.dirname(__file__), "out")
SCN = os.path.join(OUT, "scenarios")
os.makedirs(SCN, exist_ok=True)
W = H = 480
GY = pf.GROUND_Y
RED, APRON, NAVY, SKIN = worker.RED, worker.APRON, worker.NAVY, worker.SKIN
SHOE = worker.SHOE


def ease(t):
    return 0.5 * (1 - math.cos(math.pi * max(0, min(1, t))))


# ── SVG 합성: 배경 + 뒤소품 + 캐릭터 + 앞소품 ──────────────
_SVG_HEAD = (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
             f'viewBox="0 0 {W} {H}">')
_WHITE = f'<rect width="{W}" height="{H}" fill="white"/>'
_GROUND = f'<line x1="60" y1="{GY}" x2="420" y2="{GY}" stroke="#C9CBD6" stroke-width="6" stroke-linecap="round"/>'


def char_inner(pose):
    """worker.draw(bg=False) 본문만 추출."""
    s = worker.draw(pose, bg=False)
    i = s.index(">") + 1
    j = s.rindex("</svg>")
    return s[i:j]


def scene(pose, back="", front="", ground=True):
    g = _GROUND if ground else ""
    return _SVG_HEAD + _WHITE + g + back + char_inner(pose) + front + "</svg>"


# ── 렌더 파이프라인 ─────────────────────────────────────
def svg_to_img(svg):
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg); sp = f.name
    pp = sp.replace(".svg", ".png")
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), sp, "-o", pp], check=True)
    img = Image.open(pp).convert("RGBA").copy()
    os.remove(sp); os.remove(pp)
    return img


def save_webp(imgs, name, dur=60, hold=8):
    imgs = list(imgs) + [imgs[-1].copy() for _ in range(hold)]
    p = os.path.join(SCN, f"{name}.webp")
    imgs[0].save(p, save_all=True, append_images=imgs[1:], duration=dur,
                 loop=0, format="WEBP", quality=88, method=6)
    return p, imgs


# ── 소품 헬퍼 ──────────────────────────────────────────
def box(x, y, w, h, color="#E0A030", rot=0):
    cx, cy = x + w / 2, y + h / 2
    return (f'<g transform="rotate({rot} {cx} {cy})">'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{color}"/>'
            f'<rect x="{x}" y="{y}" width="{w}" height="{h*0.32:.0f}" rx="4" fill="#000" opacity="0.10"/></g>')


def flash(x, y, r=16, color="#FFD23F"):
    pts = []
    for k in range(10):
        a = math.radians(k * 36)
        rr = r if k % 2 == 0 else r * 0.45
        pts.append(f"{x+math.cos(a)*rr:.0f},{y+math.sin(a)*rr:.0f}")
    return f'<polygon points="{" ".join(pts)}" fill="{color}" stroke="#E60012" stroke-width="2"/>'


def warning_tri(cx, cy, s, op=1.0):
    return (f'<g opacity="{op:.2f}"><path d="M{cx} {cy-s} L{cx+s*0.92:.0f} {cy+s*0.6:.0f} '
            f'L{cx-s*0.92:.0f} {cy+s*0.6:.0f} Z" fill="#F4C430" stroke="{NAVY}" stroke-width="4" stroke-linejoin="round"/>'
            f'<rect x="{cx-3}" y="{cy-s*0.35:.0f}" width="6" height="{s*0.6:.0f}" rx="3" fill="{NAVY}"/>'
            f'<circle cx="{cx}" cy="{cy+s*0.4:.0f}" r="4" fill="{NAVY}"/></g>')


# ═══════════════════════════════════════════════════════
# 물리 시나리오: 낙상(앞으로 넘어짐)
# ═══════════════════════════════════════════════════════
def physics_scene(seed_fn, n=46, settle=40, friction=0.7, puddle=False):
    space = pymunk.Space()
    space.gravity = (0, 1400); space.damping = 0.985
    g = pymunk.Segment(space.static_body, (0, GY), (W, GY), 5)
    g.friction = friction; space.add(g)
    R, springs = pf.build_ragdoll(space)
    B = lambda k: R[k][0]
    for _ in range(settle):
        space.step(1 / 120)
    frames = [pf.draw_frame(R, puddle=puddle)]
    for s in springs:
        space.remove(s)
    seed_fn(R, B)
    for i in range(n):
        for _ in range(4):
            space.step(1 / 240)
        frames.append(pf.draw_frame(R, puddle=puddle))
    return [svg_to_img(s) for s in frames]


def seed_fall(R, B):
    # 발이 무언가에 걸려(뒤로 임펄스) 상체가 앞으로 고꾸라짐
    for k in ("shin_l", "shin_r"):
        B(k).velocity = (-90, 0)
    B("torso").velocity = (140, 0); B("torso").angular_velocity = 3.0
    B("head").angular_velocity = 3.2
    for k in ("uarm_l", "uarm_r"):  # 팔로 바닥 짚으려 앞으로
        B(k).velocity = (240, 30); B(k).angular_velocity = 3.0


# ═══════════════════════════════════════════════════════
# 절차적 시나리오들
# ═══════════════════════════════════════════════════════
def make_strain(n=20):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        lift = ease(min(t / 0.5, 1))
        pain = t > 0.55
        pose = dict(cx=240, cy=252, tilt=18 + lift * 8,
                    arm_l=26, arm_r=-26, arm_l_bend=40, arm_r_bend=40,
                    leg_l=10, leg_r=-10, leg_l_bend=14, leg_r_bend=14,
                    face="pain" if pain else "worried", head_tilt=10)
        # 손 앞 상자
        bx = box(208, 252, 64, 44)
        fr = bx
        if pain:  # 허리 통증 ⚡
            op = (t - 0.55) / 0.45
            fr += f'<g opacity="{op:.2f}">{flash(208, 250, 15, "#E60012")}</g>'
            fr += f'<text x="186" y="248" font-size="22" fill="#E60012">⚡</text>'
        imgs.append(svg_to_img(scene(pose, front=fr)))
    return imgs


def make_cut(n=20):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        reach = ease(min(t / 0.5, 1))
        hit = 0.5 <= t < 0.7
        recoil = t >= 0.7
        ar = -20 - reach * 30
        if recoil:
            ar = -20
        pose = dict(cx=235, cy=250, arm_r=ar, arm_r_bend=20 + reach * 20,
                    arm_l=14, arm_l_bend=14,
                    face="shock" if (hit or recoil) else "smile")
        # 작업대 + 칼
        back = box(250, 300, 90, 16, "#9AA0B5")  # 작업대 상판
        front = (f'<rect x="300" y="282" width="6" height="22" rx="2" fill="#C9CDDA"/>'
                 f'<rect x="296" y="278" width="14" height="8" rx="2" fill="{NAVY}"/>')  # 칼
        if hit:
            front += flash(300, 296, 14, "#E60012")
            front += (f'<g stroke="#E60012" stroke-width="3" stroke-linecap="round">'
                      f'<line x1="312" y1="290" x2="322" y2="284"/>'
                      f'<line x1="314" y1="298" x2="326" y2="298"/></g>')
        imgs.append(svg_to_img(scene(pose, back=back, front=front)))
    return imgs


def make_caught(n=20):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        reach = ease(min(t / 0.4, 1))
        caught = t > 0.45
        jitter = math.sin(t * 40) * 3 if caught else 0
        pose = dict(cx=224 + jitter, cy=250,
                    arm_r=-46 - reach * 14, arm_r_bend=10,
                    arm_l=12, arm_l_bend=14,
                    face="shock" if caught else "worried")
        # 기계(롤러)
        back = (f'<rect x="300" y="250" width="74" height="70" rx="8" fill="#6B7088"/>'
                f'<circle cx="318" cy="284" r="13" fill="#9AA0B5"/>'
                f'<circle cx="346" cy="284" r="13" fill="#9AA0B5"/>'
                f'<rect x="300" y="276" width="74" height="6" fill="#4A4F66"/>')
        front = ""
        if caught:
            op = min((t - 0.45) / 0.3, 1)
            front += (f'<g opacity="{op:.2f}"><path d="M300 268 L276 268" stroke="#E60012" '
                      f'stroke-width="6" stroke-linecap="round"/>'
                      f'<path d="M282 262 L274 268 L282 274 Z" fill="#E60012"/></g>')
            front += flash(300, 268, 12, "#FFD23F")
        imgs.append(svg_to_img(scene(pose, back=back, front=front)))
    return imgs


def make_health(n=22):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        sink = ease(t)
        pose = dict(cx=240, cy=250 + sink * 40, tilt=sink * 12,
                    arm_l=8, arm_l_bend=70,  # 가슴 움켜쥠
                    arm_r=-14, arm_r_bend=20,
                    leg_l=14, leg_r=-14, leg_l_bend=sink * 50, leg_r_bend=sink * 50,
                    face="pain", head_tilt=sink * 14)
        # 심장 + ECG
        hb = 1 + 0.18 * math.sin(t * 18)
        chest_y = 235 + sink * 40
        front = (f'<g transform="translate(228 {chest_y}) scale({hb:.2f})">'
                 f'<path d="M0 -4 C-5 -12 -16 -6 0 8 C16 -6 5 -12 0 -4 Z" fill="#E60012"/></g>')
        front += (f'<path d="M70 440 L120 440 L135 420 L150 460 L165 440 L410 440" '
                  f'fill="none" stroke="#E60012" stroke-width="3"/>')
        imgs.append(svg_to_img(scene(pose, front=front)))
    return imgs


def make_default(n=18):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        pulse = 1 + 0.10 * math.sin(t * 2 * math.pi * 2)
        op = 0.7 + 0.3 * abs(math.sin(t * math.pi * 2))
        pose = dict(cx=250, cy=255, arm_l=42, arm_l_bend=10,
                    face="worried", head_tilt=-4)
        front = f'<g transform="translate(150 130) scale({pulse:.2f}) translate(-150 -130)">{warning_tri(150, 130, 46, op)}</g>'
        imgs.append(svg_to_img(scene(pose, front=front)))
    return imgs


def make_property(n=20):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        drop = ease(min(t / 0.7, 1))
        broke = t > 0.72
        box_y = 250 + drop * 120
        pose = dict(cx=160, cy=252, tilt=-8, arm_l=30, arm_r=-30,
                    arm_l_bend=20, arm_r_bend=20,
                    face="shock" if t > 0.5 else "worried")
        # 선반
        back = (f'<rect x="280" y="248" width="120" height="10" rx="3" fill="#8A6240"/>'
                f'<rect x="288" y="258" width="8" height="60" fill="#8A6240"/>'
                f'<rect x="384" y="258" width="8" height="60" fill="#8A6240"/>')
        front = box(318, box_y, 44, 40, "#E0A030", rot=drop * 60)
        if broke:
            op = min((t - 0.72) / 0.28, 1)
            front += f'<g opacity="{op:.2f}">' + flash(340, GY - 6, 20, "#FFD23F")
            front += (f'<g stroke="#8A6240" stroke-width="3">'
                      f'<line x1="320" y1="{GY-4}" x2="305" y2="{GY-20}"/>'
                      f'<line x1="360" y1="{GY-4}" x2="375" y2="{GY-22}"/></g></g>')
        imgs.append(svg_to_img(scene(pose, back=back, front=front)))
    return imgs


def draw_customer(cx, cy, angry=0):
    """간단 고객 캐릭터 (회색, 캡·앞치마 없음). angry=팔 올림."""
    arm = -40 - angry * 20
    parts = []
    # 다리
    parts.append(worker.capsule(cx-12, cy+40, cx-14, cy+88, 16, "#4A4F66"))
    parts.append(worker.capsule(cx+12, cy+40, cx+14, cy+88, 16, "#4A4F66"))
    # 몸통
    parts.append(f'<rect x="{cx-30}" y="{cy-28}" width="60" height="72" rx="22" fill="#7C8298"/>')
    # 팔 (왼: 허리, 오른: 화났으면 위로)
    parts.append(worker.capsule(cx-28, cy-20, cx-44, cy+10, 13, "#7C8298"))
    ax = cx + 28 + math.sin(math.radians(arm)) * 30
    ay = cy - 20 + math.cos(math.radians(arm)) * 30
    parts.append(worker.capsule(cx+28, cy-20, ax, ay, 13, "#7C8298"))
    parts.append(f'<circle cx="{ax:.0f}" cy="{ay:.0f}" r="8" fill="#C8A07A"/>')
    # 머리
    parts.append(f'<rect x="{cx-28}" y="{cy-92}" width="56" height="60" rx="26" fill="#C8A07A"/>')
    parts.append(f'<path d="M{cx-30} {cy-60} Q{cx-32} {cy-96} {cx} {cy-96} Q{cx+32} {cy-96} {cx+30} {cy-60} '
                 f'Q{cx+14} {cy-74} {cx} {cy-72} Q{cx-14} {cy-74} {cx-30} {cy-60} Z" fill="#4A4F66"/>')
    # 화난 표정 (왼쪽 보며)
    parts.append(f'<path d="M{cx-16} {cy-66} L{cx-6} {cy-62}" stroke="{NAVY}" stroke-width="3" stroke-linecap="round"/>')
    parts.append(f'<circle cx="{cx-10}" cy="{cy-58}" r="4" fill="{NAVY}"/>')
    parts.append(f'<circle cx="{cx+10}" cy="{cy-58}" r="4" fill="{NAVY}"/>')
    parts.append(f'<path d="M{cx-8} {cy-42} Q{cx} {cy-48} {cx+8} {cy-42}" stroke="{NAVY}" stroke-width="3" fill="none" stroke-linecap="round"/>')
    return "".join(parts)


def make_claim(n=18):
    imgs = []
    for i in range(n):
        t = i / (n - 1)
        ang = abs(math.sin(t * math.pi * 2))
        # 근로자(왼쪽, 오른쪽 봄) — 약간 굽신
        pose = dict(cx=165, cy=255, tilt=6, arm_r=-30, arm_r_bend=30,
                    arm_l=16, face="worried", head_tilt=6)
        cust = draw_customer(330, 250, angry=ang)
        # 말풍선 ⚠
        bub = (f'<g opacity="{0.6+0.4*ang:.2f}"><rect x="210" y="120" width="80" height="46" rx="12" fill="#F4C430"/>'
               f'<path d="M232 166 L226 184 L250 166 Z" fill="#F4C430"/>'
               f'<text x="250" y="152" font-size="26" fill="{NAVY}" text-anchor="middle">⚠!</text></g>')
        imgs.append(svg_to_img(scene(pose, front=cust + bub)))
    return imgs


# ═══════════════════════════════════════════════════════
def main():
    jobs = {
        "fall": lambda: physics_scene(seed_fall, n=46),
        "strain": make_strain,
        "cut": make_cut,
        "health": make_health,
        "claim": make_claim,
        "property": make_property,
        "default": make_default,
    }
    reps = {}
    for name, fn in jobs.items():
        imgs = fn()
        save_webp(imgs, name)
        reps[name] = imgs[int(len(imgs) * 0.7)]
        print(f"  {name}: {len(imgs)}f")
    # collision 은 slip 재사용본과 함께 별도(2인) — 후속. 지금은 8종.
    # 컨택트 시트 (slip 포함 9칸)
    order = ["fall", "strain", "cut", "caught", "health", "claim", "property", "default"]
    slip = Image.open(os.path.join(OUT, "slip_fall.webp")); slip.seek(slip.n_frames // 2)
    cells = [("slip", slip.convert("RGBA").copy())] + [(k, reps[k]) for k in order]
    cols, rows = 3, 3
    sheet = Image.new("RGB", (W * cols, H * rows), "white")
    for idx, (k, im) in enumerate(cells):
        sheet.paste(im, ((idx % cols) * W, (idx // cols) * H))
    sheet.save(os.path.join(OUT, "scenarios_sheet.png"))
    print("컨택트 시트:", os.path.join(OUT, "scenarios_sheet.png"))


if __name__ == "__main__":
    main()

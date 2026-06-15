#!/usr/bin/env python3
"""
physics_fall.py — pymunk 래그돌로 매장 근로자 '미끄러져 넘어짐' 시뮬레이션

설계:
  · 스크린 좌표(y-down, gravity +y)에서 시뮬 → 좌표 변환 불필요
  · 10바디 휴머노이드: torso/head/상박·하박(L/R)/대퇴·정강이(L/R)
  · PivotJoint(관절) + RotaryLimitJoint(과신전 방지) + 약한 DampedRotarySpring(근긴장)
  · 동일 shape_filter group → 자기충돌 제거
  · 슬립: 발에 전방 임펄스 + 바닥 마찰 0 → 발 빠지고 상체 뒤로 낙하
  · 렌더: 물리 바디 transform에서 캐릭터를 직접 그림 (pose dict 우회)
"""
import math
import os
import subprocess
import tempfile

import pymunk
from PIL import Image

import worker  # 색상·스타일 재사용

W = H = 480
GROUND_Y = 400
GROUP = 1  # 자기충돌 제거용 shape_filter group
OUT = os.path.join(os.path.dirname(__file__), "out")
os.makedirs(OUT, exist_ok=True)


def seg_body(space, a, b, radius, mass):
    """a→b 캡슐 바디 생성."""
    a = pymunk.Vec2d(*a); b = pymunk.Vec2d(*b)
    moment = pymunk.moment_for_segment(mass, a, b, radius)
    body = pymunk.Body(mass, moment)
    body.position = (0, 0)
    shape = pymunk.Segment(body, a, b, radius)
    shape.filter = pymunk.ShapeFilter(group=GROUP)
    shape.friction = 0.6
    space.add(body, shape)
    return body, a, b


def pin(space, b1, p1, b2, p2):
    j = pymunk.PivotJoint(b1, b2, b1.local_to_world(p1))
    j.collide_bodies = False
    space.add(j)


def limit(space, b1, b2, lo, hi):
    j = pymunk.RotaryLimitJoint(b1, b2, lo, hi)
    space.add(j)


def spring(space, b1, b2, rest, stiff=4e6, damp=8e4):
    s = pymunk.DampedRotarySpring(b1, b2, rest, stiff, damp)
    space.add(s)
    return s


def build_ragdoll(space):
    """직립 자세 래그돌. 반환: 바디 dict + 각 캡슐의 로컬 끝점."""
    R = {}
    springs = []
    # 좌표(직립, 스크린): torso 중심 (240,250)
    cx = 240
    # torso: 어깨(222) ~ 엉덩이(288)
    R["torso"] = seg_body(space, (cx, 222), (cx, 288), 22, 8)
    # head: 목(193) ~ 정수리(128)
    R["head"] = seg_body(space, (cx, 193), (cx, 130), 26, 3)
    # 팔 (어깨 218/262)
    R["uarm_l"] = seg_body(space, (cx-22, 224), (cx-30, 252), 8, 1)
    R["larm_l"] = seg_body(space, (cx-30, 252), (cx-32, 280), 7, 0.8)
    R["uarm_r"] = seg_body(space, (cx+22, 224), (cx+30, 252), 8, 1)
    R["larm_r"] = seg_body(space, (cx+30, 252), (cx+32, 280), 7, 0.8)
    # 다리 (엉덩이 ±16)
    R["thigh_l"] = seg_body(space, (cx-16, 288), (cx-18, 320), 11, 2)
    R["shin_l"] = seg_body(space, (cx-18, 320), (cx-20, 352), 9, 1.5)
    R["thigh_r"] = seg_body(space, (cx+16, 288), (cx+18, 320), 11, 2)
    R["shin_r"] = seg_body(space, (cx+18, 320), (cx+20, 352), 9, 1.5)

    def B(name): return R[name][0]
    # 관절 연결 (월드 좌표 기준 PivotJoint)
    def pinw(b1, b2, p):
        j = pymunk.PivotJoint(b1, b2, p); j.collide_bodies = False; space.add(j)
    pinw(B("head"), B("torso"), (cx, 200))
    pinw(B("uarm_l"), B("torso"), (cx-22, 224))
    pinw(B("larm_l"), B("uarm_l"), (cx-30, 252))
    pinw(B("uarm_r"), B("torso"), (cx+22, 224))
    pinw(B("larm_r"), B("uarm_r"), (cx+30, 252))
    pinw(B("thigh_l"), B("torso"), (cx-16, 288))
    pinw(B("shin_l"), B("thigh_l"), (cx-18, 320))
    pinw(B("thigh_r"), B("torso"), (cx+16, 288))
    pinw(B("shin_r"), B("thigh_r"), (cx+18, 320))

    # 관절 가동범위 (라디안, 상대각) — 과신전/꺾임 방지
    limit(space, B("torso"), B("head"), -0.5, 0.5)
    limit(space, B("torso"), B("uarm_l"), -2.4, 2.4)
    limit(space, B("uarm_l"), B("larm_l"), -2.6, 0.1)   # 팔꿈치 한방향
    limit(space, B("torso"), B("uarm_r"), -2.4, 2.4)
    limit(space, B("uarm_r"), B("larm_r"), -0.1, 2.6)
    limit(space, B("torso"), B("thigh_l"), -1.4, 1.4)
    limit(space, B("thigh_l"), B("shin_l"), -0.1, 2.4)  # 무릎 한방향
    limit(space, B("torso"), B("thigh_r"), -1.4, 1.4)
    limit(space, B("thigh_r"), B("shin_r"), -0.1, 2.4)

    # 근긴장 스프링 (직립 유지용) — 슬립 트리거 시 제거해 풀 래그돌 전환
    springs.append(spring(space, B("torso"), B("head"), 0, 3e6, 5e4))
    springs.append(spring(space, B("torso"), B("uarm_l"), 0, 2e6, 4e4))
    springs.append(spring(space, B("uarm_l"), B("larm_l"), -0.3, 1e6, 2e4))
    springs.append(spring(space, B("torso"), B("uarm_r"), 0, 2e6, 4e4))
    springs.append(spring(space, B("uarm_r"), B("larm_r"), 0.3, 1e6, 2e4))
    springs.append(spring(space, B("torso"), B("thigh_l"), 0, 3e6, 6e4))
    springs.append(spring(space, B("thigh_l"), B("shin_l"), 0.2, 2e6, 4e4))
    springs.append(spring(space, B("torso"), B("thigh_r"), 0, 3e6, 6e4))
    springs.append(spring(space, B("thigh_r"), B("shin_r"), 0.2, 2e6, 4e4))
    return R, springs


def draw_frame(R, puddle=True):
    """물리 바디 transform에서 캐릭터 직접 렌더."""
    def world(name, local):
        return R[name][0].local_to_world(local)
    def cap(name, color, w):
        b, a, c = R[name]
        pa = b.local_to_world(a); pc = b.local_to_world(c)
        return worker.capsule(pa.x, pa.y, pc.x, pc.y, w, color)

    P = [f'<rect width="{W}" height="{H}" fill="white"/>']
    # 바닥
    P.append(f'<line x1="60" y1="{GROUND_Y}" x2="420" y2="{GROUND_Y}" stroke="#C9CBD6" stroke-width="6" stroke-linecap="round"/>')
    if puddle:  # 물기(미끄럼 표시)
        P.append(f'<ellipse cx="210" cy="{GROUND_Y-2}" rx="46" ry="7" fill="#7EC8E3" opacity="0.55"/>')

    # 뒤 레이어 (오른팔·오른다리)
    P.append(cap("thigh_r", worker.NAVY, 22))
    P.append(cap("shin_r", worker.NAVY, 18))
    P.append(cap("uarm_r", worker.SHIRT_D, 16))
    P.append(cap("larm_r", worker.SKIN_D, 14))
    hand_r = world("larm_r", R["larm_r"][2])
    P.append(f'<circle cx="{hand_r.x:.1f}" cy="{hand_r.y:.1f}" r="8" fill="{worker.SKIN_D}"/>')

    # 왼다리
    P.append(cap("thigh_l", worker.NAVY, 22))
    P.append(cap("shin_l", worker.NAVY, 18))
    foot_l = world("shin_l", R["shin_l"][2])
    P.append(f'<ellipse cx="{foot_l.x:.1f}" cy="{foot_l.y+3:.1f}" rx="16" ry="9" fill="{worker.SHOE}"/>')
    foot_r = world("shin_r", R["shin_r"][2])
    P.append(f'<ellipse cx="{foot_r.x:.1f}" cy="{foot_r.y+3:.1f}" rx="16" ry="9" fill="{worker.SHOE}"/>')

    # 몸통 (셔츠+앞치마) — torso 바디 각도로 회전
    tb = R["torso"][0]
    # torso 중심 = 두 끝점 평균
    ta = tb.local_to_world(R["torso"][1]); td = tb.local_to_world(R["torso"][2])
    mx, my = (ta.x+td.x)/2, (ta.y+td.y)/2
    ang = math.degrees(tb.angle)
    P.append(f'<g transform="rotate({ang:.1f} {mx:.1f} {my:.1f})">')
    P.append(f'<rect x="{mx-30:.1f}" y="{my-36:.1f}" width="60" height="74" rx="24" fill="{worker.SHIRT}"/>')
    P.append(f'<path d="M{mx-28:.1f} {my-22:.1f} Q{mx-32:.1f} {my+24:.1f} {mx-24:.1f} {my+40:.1f} '
             f'L{mx+24:.1f} {my+40:.1f} Q{mx+32:.1f} {my+24:.1f} {mx+28:.1f} {my-22:.1f} Z" fill="{worker.APRON}"/>')
    P.append(f'<rect x="{mx-16:.1f}" y="{my-30:.1f}" width="32" height="22" rx="5" fill="{worker.APRON}"/>')
    P.append(f'<rect x="{mx-11:.1f}" y="{my-24:.1f}" width="22" height="9" rx="2" fill="white"/>')
    P.append('</g>')

    # 앞 레이어 (왼팔)
    P.append(cap("uarm_l", worker.SHIRT, 16))
    P.append(cap("larm_l", worker.SKIN, 14))
    hand_l = world("larm_l", R["larm_l"][2])
    P.append(f'<circle cx="{hand_l.x:.1f}" cy="{hand_l.y:.1f}" r="8" fill="{worker.SKIN}"/>')

    # 머리 (head 바디 각도로 회전)
    hb = R["head"][0]
    ha = hb.local_to_world(R["head"][1]); hd = hb.local_to_world(R["head"][2])
    hcx, hcy = (ha.x+hd.x)/2, (ha.y+hd.y)/2 + 4
    hang = math.degrees(hb.angle)
    P.append(f'<g transform="rotate({hang:.1f} {hcx:.1f} {hcy:.1f})">')
    P.append(f'<rect x="{hcx-32:.1f}" y="{hcy-32:.1f}" width="64" height="66" rx="28" fill="{worker.SKIN}"/>')
    P.append(f'<path d="M{hcx-34:.1f} {hcy-16:.1f} Q{hcx:.1f} {hcy-48:.1f} {hcx+34:.1f} {hcy-16:.1f} '
             f'L{hcx+28:.1f} {hcy-10:.1f} Q{hcx:.1f} {hcy-28:.1f} {hcx-28:.1f} {hcy-10:.1f} Z" fill="{worker.RED}"/>')
    P.append(f'<ellipse cx="{hcx:.1f}" cy="{hcy-12:.1f}" rx="38" ry="8" fill="{worker.RED}"/>')
    # 놀란 표정
    P.append(f'<ellipse cx="{hcx-12:.1f}" cy="{hcy+4:.1f}" rx="5" ry="7" fill="{worker.NAVY}"/>')
    P.append(f'<ellipse cx="{hcx+12:.1f}" cy="{hcy+4:.1f}" rx="5" ry="7" fill="{worker.NAVY}"/>')
    P.append(f'<ellipse cx="{hcx:.1f}" cy="{hcy+22:.1f}" rx="6" ry="8" fill="{worker.NAVY}"/>')
    P.append('</g>')

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(P) + '</svg>')


def simulate():
    space = pymunk.Space()
    space.gravity = (0, 1400)  # y-down, 강한 중력으로 확실히 낙하
    space.damping = 0.985      # 거의 무손실 (움직임 살림)
    # 바닥
    static = space.static_body
    g = pymunk.Segment(static, (0, GROUND_Y), (W, GROUND_Y), 5)
    g.friction = 0.05  # 미끄러운 바닥(물기)
    g.elasticity = 0.0
    space.add(g)

    R, springs = build_ragdoll(space)
    B = lambda k: R[k][0]

    frames = []

    def grab(n_steps):
        for _ in range(n_steps):
            for _ in range(3):
                space.step(1/180)
        frames.append(draw_frame(R))

    # 1단계: 바닥에 안착 + 직립 안정 (발이 바닥에 닿도록 충분히)
    for _ in range(40):
        space.step(1/120)
    frames.append(draw_frame(R))  # 직립 1컷

    # 2단계: 슬립! 근긴장 스프링 제거 → 풀 래그돌
    for s in springs:
        space.remove(s)

    # 발은 바닥 따라 앞으로 미끄러지고(수평만), 상체는 뒤로 천천히 회전
    # → 무게중심이 발 뒤로 넘어가며 등/엉덩이로 주저앉는 슬립. 위쪽 속도 없음.
    for k in ("shin_l", "shin_r"):
        B(k).velocity = (200, 0)        # 발 앞으로 미끄럼 (수평, 절제)
    for k in ("thigh_l", "thigh_r"):
        B(k).velocity = (110, 0)
    B("torso").velocity = (-20, 0)
    B("torso").angular_velocity = -2.6  # 상체 뒤로 ~90°
    B("head").angular_velocity = -2.6
    for k in ("uarm_l", "uarm_r"):
        B(k).velocity = (-50, -40)      # 팔 살짝 허우적
        B(k).angular_velocity = -2.0

    # 3단계: 낙하~착지~정착까지 길게 캡처
    n = 48
    for i in range(n):
        for _ in range(4):
            space.step(1/240)
        frames.append(draw_frame(R))
        ty = (R["torso"][0].local_to_world(R["torso"][1]).y +
              R["torso"][0].local_to_world(R["torso"][2]).y) / 2
        if i % 8 == 0:
            print(f"  f{i:02d} torso_y={ty:.0f}")
    return frames


def main():
    frames = simulate()
    imgs = []
    with tempfile.TemporaryDirectory() as tmp:
        for i, svg in enumerate(frames):
            sp = os.path.join(tmp, f"{i:02d}.svg"); pp = os.path.join(tmp, f"{i:02d}.png")
            open(sp, "w").write(svg)
            subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), sp, "-o", pp], check=True)
            imgs.append(Image.open(pp).convert("RGBA"))
    # hold 끝프레임
    for _ in range(8):
        imgs.append(imgs[-1].copy())
    webp = os.path.join(OUT, "slip_fall.webp")
    imgs[0].save(webp, save_all=True, append_images=imgs[1:], duration=55, loop=0, format="WEBP", quality=90, method=6)
    # 검수 스트립
    strip = Image.new("RGBA", (W*6, H), "white")
    for i in range(6):
        strip.paste(imgs[int(i/6*len(frames))], (i*W, 0))
    strip.convert("RGB").save(os.path.join(OUT, "slip_fall_strip.png"))
    print(f"slip_fall: webp {os.path.getsize(webp)//1024}KB · {len(imgs)}f")


if __name__ == "__main__":
    main()

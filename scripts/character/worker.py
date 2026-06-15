#!/usr/bin/env python3
"""
worker.py — 다이소 매장 근로자 캐릭터 (둥근 마스코트)

빨간 앞치마 유니폼. 부위별 리깅(머리/몸통/팔/다리)으로 포즈 제어 가능.
draw(pose) → SVG. 포즈 dict로 각 관절 각도·위치 조정 → 걷기·사고 연출.
"""
import math

# 브랜드 색
RED = "#E60012"       # 다이소 레드 (앞치마)
RED_D = "#B3000E"     # 앞치마 그림자
NAVY = "#2B2D42"      # 외곽선/머리카락
SKIN = "#FBD0A8"      # 피부
SKIN_D = "#E8B589"    # 피부 그림자
SHIRT = "#E60012"     # 상의 (다이소 레드)
SHIRT_D = "#C20010"   # 상의 그림자
APRON = "#B3000E"     # 앞치마 (상의와 구분되는 진한 레드)
APRON_D = "#8F000B"   # 앞치마 그림자
SHOE = "#2B2D42"      # 신발 (진곤색)

W = H = 480


def _stroke(w=0):
    return f' stroke="{NAVY}" stroke-width="{w}"' if w else ""


def rot(px, py, cx, cy, deg):
    r = math.radians(deg)
    dx, dy = px - cx, py - cy
    return (cx + dx * math.cos(r) - dy * math.sin(r),
            cy + dx * math.sin(r) + dy * math.cos(r))


def capsule(x1, y1, x2, y2, w, color):
    """둥근 끝 캡슐(팔다리)."""
    return (f'<line x1="{x1:.1f}" y1="{y1:.1f}" x2="{x2:.1f}" y2="{y2:.1f}" '
            f'stroke="{color}" stroke-width="{w}" stroke-linecap="round"/>')


def default_pose():
    return {
        "cx": 240, "cy": 250,      # 몸통 중심
        "tilt": 0,                 # 몸통 기울기(도)
        "bob": 0,                  # 상하 바운스
        "head_tilt": 0,
        # 팔: 어깨 기준 각도 (0=아래, +앞쪽)
        "arm_l": 8, "arm_r": -8,
        "arm_l_bend": 10, "arm_r_bend": 10,
        # 다리: 엉덩이 기준 각도
        "leg_l": 6, "leg_r": -6,
        "leg_l_bend": 0, "leg_r_bend": 0,
        "face": "smile",           # smile | shock | pain | worried
    }


def draw(pose=None, bg=True):
    p = default_pose()
    if pose:
        p.update(pose)
    cx, cy = p["cx"], p["cy"] + p["bob"]
    tilt = p["tilt"]

    parts = [f'<rect width="{W}" height="{H}" fill="white"/>'] if bg else []

    # ── 기준 관절 좌표 (직립, 몸통중심 기준) ──
    hip = (cx, cy + 38)
    shoulder_l = (cx - 30, cy - 28)
    shoulder_r = (cx + 30, cy - 28)
    hip_l = (cx - 16, cy + 40)
    hip_r = (cx + 16, cy + 40)
    neck = (cx, cy - 42)
    head_c = (cx, cy - 92)

    # 몸통 기울기 회전 적용 (어깨/머리/목, 엉덩이는 고정축)
    def T(pt):
        return rot(*pt, hip[0], hip[1], tilt)
    shoulder_l = T(shoulder_l); shoulder_r = T(shoulder_r)
    neck = T(neck); head_c = T(head_c)

    # ── 다리 (몸통 뒤) ──
    def leg(hip_pt, ang, bend, flip):
        thigh_len, shin_len = 30, 30
        knee = (hip_pt[0] + math.sin(math.radians(ang)) * thigh_len,
                hip_pt[1] + math.cos(math.radians(ang)) * thigh_len)
        foot_ang = ang - bend * flip
        foot = (knee[0] + math.sin(math.radians(foot_ang)) * shin_len,
                knee[1] + math.cos(math.radians(foot_ang)) * shin_len)
        s = capsule(*hip_pt, *knee, 17, NAVY) + capsule(*knee, *foot, 15, NAVY)
        # 신발
        s += (f'<ellipse cx="{foot[0]:.1f}" cy="{foot[1]+4:.1f}" rx="15" ry="9" '
              f'fill="{SHOE}" transform="rotate({foot_ang*0.3:.1f} {foot[0]:.1f} {foot[1]:.1f})"/>')
        return s
    parts.append(leg(hip_r, p["leg_r"], p["leg_r_bend"], 1))
    parts.append(leg(hip_l, p["leg_l"], p["leg_l_bend"], 1))

    # ── 뒤쪽 팔 (오른팔, 몸 뒤) ──
    def arm(sh, ang, bend, flip, behind=False):
        up_len, fore_len = 26, 24
        elbow = (sh[0] + math.sin(math.radians(ang)) * up_len,
                 sh[1] + math.cos(math.radians(ang)) * up_len)
        fa = ang + bend * flip
        hand = (elbow[0] + math.sin(math.radians(fa)) * fore_len,
                elbow[1] + math.cos(math.radians(fa)) * fore_len)
        col = SKIN
        s = capsule(*sh, *elbow, 14, SHIRT if not behind else SHIRT_D)
        s += capsule(*elbow, *hand, 12, col)
        s += f'<circle cx="{hand[0]:.1f}" cy="{hand[1]:.1f}" r="8" fill="{col}"/>'
        return s
    parts.append(arm(shoulder_r, p["arm_r"], p["arm_r_bend"], 1, behind=True))

    # ── 몸통 (셔츠 + 앞치마) ──
    # 셔츠 베이스
    bx, by = cx, cy
    parts.append(f'<g transform="rotate({tilt} {hip[0]} {hip[1]})">')
    parts.append(f'<rect x="{bx-34}" y="{by-30}" width="68" height="76" rx="26" fill="{SHIRT}"/>')
    # 앞치마 (진한 레드 — 상의와 구분)
    parts.append(f'<path d="M{bx-30} {by-20} '
                 f'Q{bx-34} {by+30} {bx-26} {by+48} '
                 f'L{bx+26} {by+48} Q{bx+34} {by+30} {bx+30} {by-20} '
                 f'Z" fill="{APRON}"/>')
    # 앞치마 가슴받이
    parts.append(f'<rect x="{bx-18}" y="{by-30}" width="36" height="26" rx="6" fill="{APRON}"/>')
    # 앞치마 끈
    parts.append(f'<line x1="{bx-16}" y1="{by-30}" x2="{bx-26}" y2="{by-40}" stroke="{APRON}" stroke-width="6" stroke-linecap="round"/>')
    parts.append(f'<line x1="{bx+16}" y1="{by-30}" x2="{bx+26}" y2="{by-40}" stroke="{APRON}" stroke-width="6" stroke-linecap="round"/>')
    # 이름표
    parts.append(f'<rect x="{bx-12}" y="{by-22}" width="24" height="10" rx="2" fill="white"/>')
    parts.append(f'<rect x="{bx-9}" y="{by-19}" width="18" height="2.4" rx="1" fill="{APRON_D}"/>')
    # 앞치마 주머니
    parts.append(f'<rect x="{bx-22}" y="{by+12}" width="44" height="20" rx="4" fill="{APRON_D}" opacity="0.55"/>')
    parts.append('</g>')

    # ── 머리 ──
    hx, hy = head_c
    parts.append(f'<g transform="rotate({tilt + p["head_tilt"]} {hx} {hy})">')
    # 목
    parts.append(capsule(neck[0], neck[1], hx, hy + 28, 16, SKIN))
    # 얼굴
    parts.append(f'<rect x="{hx-34}" y="{hy-34}" width="68" height="70" rx="30" fill="{SKIN}"/>')
    # 머리카락
    parts.append(f'<path d="M{hx-35} {hy-6} '
                 f'Q{hx-38} {hy-44} {hx} {hy-44} '
                 f'Q{hx+38} {hy-44} {hx+35} {hy-6} '
                 f'Q{hx+20} {hy-22} {hx} {hy-20} '
                 f'Q{hx-20} {hy-22} {hx-35} {hy-6} Z" fill="{NAVY}"/>')
    # 다이소 빨강 캡(앞 챙)
    parts.append(f'<path d="M{hx-36} {hy-18} Q{hx} {hy-50} {hx+36} {hy-18} '
                 f'L{hx+30} {hy-12} Q{hx} {hy-30} {hx-30} {hy-12} Z" fill="{RED}"/>')
    parts.append(f'<ellipse cx="{hx}" cy="{hy-14}" rx="40" ry="9" fill="{RED}"/>')
    parts.append(f'<circle cx="{hx}" cy="{hy-30}" r="3.5" fill="white"/>')
    # 얼굴 표정
    face = p["face"]
    if face == "shock":
        eyes = (f'<ellipse cx="{hx-13}" cy="{hy+2}" rx="5" ry="7" fill="{NAVY}"/>'
                f'<ellipse cx="{hx+13}" cy="{hy+2}" rx="5" ry="7" fill="{NAVY}"/>')
        mouth = f'<ellipse cx="{hx}" cy="{hy+20}" rx="7" ry="9" fill="{NAVY}"/>'
    elif face == "pain":
        eyes = (f'<path d="M{hx-19} {hy} L{hx-7} {hy+4} M{hx-19} {hy+5} L{hx-7} {hy+1}" stroke="{NAVY}" stroke-width="3" stroke-linecap="round" fill="none"/>'
                f'<path d="M{hx+19} {hy} L{hx+7} {hy+4} M{hx+19} {hy+5} L{hx+7} {hy+1}" stroke="{NAVY}" stroke-width="3" stroke-linecap="round" fill="none"/>')
        mouth = f'<path d="M{hx-9} {hy+22} Q{hx} {hy+14} {hx+9} {hy+22}" stroke="{NAVY}" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    elif face == "worried":
        eyes = (f'<circle cx="{hx-13}" cy="{hy+2}" r="5" fill="{NAVY}"/>'
                f'<circle cx="{hx+13}" cy="{hy+2}" r="5" fill="{NAVY}"/>')
        mouth = f'<path d="M{hx-8} {hy+22} Q{hx} {hy+16} {hx+8} {hy+22}" stroke="{NAVY}" stroke-width="3" fill="none" stroke-linecap="round"/>'
    else:  # smile
        eyes = (f'<circle cx="{hx-13}" cy="{hy+2}" r="5" fill="{NAVY}"/>'
                f'<circle cx="{hx+13}" cy="{hy+2}" r="5" fill="{NAVY}"/>'
                f'<circle cx="{hx-11}" cy="{hy}" r="1.6" fill="white"/>'
                f'<circle cx="{hx+15}" cy="{hy}" r="1.6" fill="white"/>')
        mouth = f'<path d="M{hx-10} {hy+18} Q{hx} {hy+27} {hx+10} {hy+18}" stroke="{NAVY}" stroke-width="3.5" fill="none" stroke-linecap="round"/>'
    # 볼터치
    parts.append(f'<circle cx="{hx-22}" cy="{hy+12}" r="6" fill="#F7A8A8" opacity="0.5"/>')
    parts.append(f'<circle cx="{hx+22}" cy="{hy+12}" r="6" fill="#F7A8A8" opacity="0.5"/>')
    parts.append(eyes)
    parts.append(mouth)
    parts.append('</g>')

    # ── 앞쪽 팔 (왼팔, 몸 앞) ──
    parts.append(arm(shoulder_l, p["arm_l"], p["arm_l_bend"], -1, behind=False))

    return (f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" '
            f'viewBox="0 0 {W} {H}">' + "".join(parts) + '</svg>')


if __name__ == "__main__":
    import os
    out = os.path.join(os.path.dirname(__file__), "out")
    os.makedirs(out, exist_ok=True)
    with open(os.path.join(out, "worker_idle.svg"), "w") as f:
        f.write(draw())
    print("idle SVG 생성")

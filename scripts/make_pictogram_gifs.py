#!/usr/bin/env python3
"""
make_pictogram_gifs.py — ISO 7010 스타일 졸라맨 픽토그램 GIF 생성
rsvg-convert(librsvg) + PIL 사용. 외부 의존 없이 SVG 직접 작성.

사고 유형 10종:
  fall, slip, collision, cut, caught, strain, property, claim, health, default
"""

from __future__ import annotations
import subprocess, tempfile, shutil
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).parent.parent
ANIM_DIR = ROOT / "images" / "scenes" / "anim"
ANIM_DIR.mkdir(parents=True, exist_ok=True)

GIF_W, GIF_H = 480, 480   # 정사각형 (픽토그램은 정사각)
RSVG = shutil.which("rsvg-convert") or "/opt/homebrew/bin/rsvg-convert"

# ─── 공통 색상 ───────────────────────────────────────────────
BG       = "#FFFFFF"
FIG_COL  = "#1A1A2E"   # 졸라맨 (진남)
WARN_COL = "#E8B923"   # 경고 노랑
RED      = "#D62828"   # 위험 빨강
GREEN    = "#2D6A4F"   # 안전 초록
GRAY     = "#6B7280"
BLUE     = "#1E40AF"

# ─── 졸라맨 기본 컴포넌트 (SVG path/element 문자열 반환) ──────

def head(cx, cy, r=28, fill=FIG_COL):
    return f'<circle cx="{cx}" cy="{cy}" r="{r}" fill="{fill}"/>'

def body(x1,y1,x2,y2, col=FIG_COL, sw=10):
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{col}" stroke-width="{sw}" stroke-linecap="round"/>'

def arm(x1,y1,x2,y2, col=FIG_COL, sw=9):
    return body(x1,y1,x2,y2,col,sw)

def leg(x1,y1,x2,y2, col=FIG_COL, sw=9):
    return body(x1,y1,x2,y2,col,sw)

def warning_triangle(cx, cy, size=60, col=WARN_COL, stroke="#000", sw=4):
    h = int(size * 0.866)
    pts = f"{cx},{cy-h//1} {cx-size//2},{cy+h//2} {cx+size//2},{cy+h//2}"
    return (f'<polygon points="{pts}" fill="{col}" stroke="{stroke}" '
            f'stroke-width="{sw}" stroke-linejoin="round"/>'
            f'<text x="{cx}" y="{cy+h//2-8}" text-anchor="middle" '
            f'font-size="28" font-weight="bold" fill="#000">!</text>')

def arrow_down(cx, y1, y2, col=RED, sw=8):
    return (f'<line x1="{cx}" y1="{y1}" x2="{cx}" y2="{y2}" stroke="{col}" '
            f'stroke-width="{sw}" stroke-linecap="round"/>'
            f'<polygon points="{cx-10},{y2-12} {cx+10},{y2-12} {cx},{y2+4}" fill="{col}"/>')

def caption(text, y=440, col="#1A1A2E", size=26):
    return (f'<text x="240" y="{y}" text-anchor="middle" '
            f'font-family="sans-serif" font-size="{size}" font-weight="bold" '
            f'fill="{col}">{text}</text>')

def rect(x, y, w, h, fill=GRAY, rx=6):
    return f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"/>'

def svg_wrap(body_content: str, w=480, h=480) -> str:
    return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{w}" height="{h}" viewBox="0 0 {w} {h}">
  <rect width="{w}" height="{h}" fill="{BG}"/>
  {body_content}
</svg>'''

# ─── 10종 SVG 정의 ────────────────────────────────────────────

PICTOGRAMS: dict[str, list[str]] = {}

# 1. fall — 낙상: 사람이 45도 기울어 바닥에 쓰러지는 모습
PICTOGRAMS["fall"] = [
    svg_wrap(
        head(240, 120, 28)
        + body(240,148, 200,230)           # 몸통 (기울어짐)
        + arm(215,170, 170,140)            # 왼팔 (올라감)
        + arm(215,170, 255,155)            # 오른팔
        + leg(200,230, 160,300)            # 왼다리
        + leg(200,230, 240,300)            # 오른다리
        + f'<line x1="100" y1="310" x2="380" y2="310" stroke="{WARN_COL}" stroke-width="8"/>'
        + arrow_down(320, 130, 280)        # 낙하 화살표
        + caption("낙상 주의")
    ),
    svg_wrap(
        head(240, 160, 28)                 # 쓰러진 자세
        + body(240,188, 180,240)
        + arm(210,210, 160,180)
        + arm(210,210, 260,195)
        + leg(180,240, 140,290)
        + leg(180,240, 220,300)
        + f'<line x1="100" y1="310" x2="380" y2="310" stroke="{WARN_COL}" stroke-width="8"/>'
        + warning_triangle(330, 200, 40)
        + caption("낙상 주의")
    ),
]

# 2. slip — 미끄럼: 발이 앞으로 미끄러지며 뒤로 넘어지는 모습
PICTOGRAMS["slip"] = [
    svg_wrap(
        head(240, 115, 28)
        + body(240,143, 250,220)
        + arm(245,175, 190,145)            # 왼팔 위로
        + arm(245,175, 295,150)            # 오른팔 위로
        + leg(250,220, 200,300)            # 왼다리 앞으로
        + leg(250,220, 310,280)
        + f'<line x1="120" y1="305" x2="360" y2="305" stroke="{BLUE}" stroke-width="6" stroke-dasharray="12,6"/>'
        + f'<text x="240" y="330" text-anchor="middle" font-size="18" fill="{BLUE}">미끄러운 바닥</text>'
        + caption("미끄럼 주의")
    ),
    svg_wrap(
        head(230, 145, 28)                 # 뒤로 기울어짐
        + body(230,173, 270,240)
        + arm(250,195, 190,160)
        + arm(250,195, 300,165)
        + leg(270,240, 310,310)
        + leg(270,240, 230,295)
        + f'<line x1="120" y1="315" x2="360" y2="315" stroke="{BLUE}" stroke-width="6" stroke-dasharray="12,6"/>'
        + warning_triangle(330, 210, 40)
        + caption("미끄럼 주의")
    ),
]

# 3. collision — 충돌: 두 사람이 맞닥뜨리는 모습
PICTOGRAMS["collision"] = [
    svg_wrap(
        # 왼쪽 사람
        head(150, 120, 26)
        + body(150,146, 150,220)
        + arm(150,170, 110,145)
        + arm(150,170, 185,155)
        + leg(150,220, 120,300)
        + leg(150,220, 175,300)
        # 오른쪽 사람
        + head(330, 120, 26)
        + body(330,146, 330,220)
        + arm(330,170, 295,155)
        + arm(330,170, 365,145)
        + leg(330,220, 305,300)
        + leg(330,220, 355,300)
        # 충돌 별표
        + f'<text x="240" y="200" text-anchor="middle" font-size="52" fill="{RED}">✸</text>'
        + caption("충돌 주의")
    ),
    svg_wrap(
        head(160, 120, 26)
        + body(160,146, 160,220)
        + arm(160,170, 120,145)
        + arm(160,170, 200,155)
        + leg(160,220, 130,300)
        + leg(160,220, 185,300)
        + head(320, 120, 26)
        + body(320,146, 320,220)
        + arm(320,170, 285,155)
        + arm(320,170, 355,145)
        + leg(320,220, 295,300)
        + leg(320,220, 345,300)
        + f'<text x="240" y="200" text-anchor="middle" font-size="60" fill="{WARN_COL}">✸</text>'
        + warning_triangle(240, 340, 40, col=RED)
        + caption("충돌 주의")
    ),
]

# 4. cut — 절상: 손에 칼/커터 작업 중 부상
PICTOGRAMS["cut"] = [
    svg_wrap(
        head(240, 110, 28)
        + body(240,138, 240,210)
        + arm(240,165, 185,200)            # 왼팔 → 작업대
        + arm(240,165, 295,185)
        + leg(240,210, 210,300)
        + leg(240,210, 270,300)
        # 작업대
        + rect(140, 240, 200, 20, GRAY)
        # 커터 칼
        + f'<line x1="165" y1="200" x2="165" y2="240" stroke="#888" stroke-width="6"/>'
        + f'<polygon points="155,240 175,240 165,260" fill="{RED}"/>'
        # 부상 표시
        + f'<circle cx="165" cy="200" r="10" fill="{RED}" opacity="0.8"/>'
        + f'<text x="165" y="205" text-anchor="middle" font-size="11" fill="white" font-weight="bold">!</text>'
        + caption("절상 주의")
    ),
    svg_wrap(
        head(240, 110, 28)
        + body(240,138, 240,210)
        + arm(240,165, 180,205)
        + arm(240,165, 295,185)
        + leg(240,210, 210,300)
        + leg(240,210, 270,300)
        + rect(140, 240, 200, 20, GRAY)
        + f'<line x1="165" y1="205" x2="165" y2="240" stroke="#888" stroke-width="6"/>'
        + f'<polygon points="155,240 175,240 165,260" fill="{RED}"/>'
        + f'<circle cx="165" cy="205" r="12" fill="{RED}" opacity="0.9"/>'
        + warning_triangle(330, 200, 45, col=RED)
        + caption("절상 주의")
    ),
]

# 5. caught — 협착: 손/팔이 기계에 끼이는 모습
PICTOGRAMS["caught"] = [
    svg_wrap(
        head(200, 110, 28)
        + body(200,138, 200,210)
        + arm(200,160, 260,180)            # 오른팔 → 기계 쪽
        + arm(200,160, 155,145)
        + leg(200,210, 170,300)
        + leg(200,210, 230,300)
        # 기계 (롤러)
        + rect(275, 155, 80, 60, "#555", 4)
        + f'<circle cx="295" cy="185" r="18" fill="{GRAY}"/>'
        + f'<circle cx="335" cy="185" r="18" fill="{GRAY}"/>'
        # 협착 화살표
        + f'<line x1="253" y1="175" x2="278" y2="175" stroke="{RED}" stroke-width="5"/>'
        + f'<polygon points="274,168 286,175 274,182" fill="{RED}"/>'
        + caption("협착 주의")
    ),
    svg_wrap(
        head(200, 110, 28)
        + body(200,138, 200,210)
        + arm(200,160, 275,175)
        + arm(200,160, 155,145)
        + leg(200,210, 170,300)
        + leg(200,210, 230,300)
        + rect(275, 155, 80, 60, "#555", 4)
        + f'<circle cx="295" cy="185" r="18" fill="{GRAY}"/>'
        + f'<circle cx="335" cy="185" r="18" fill="{GRAY}"/>'
        + f'<line x1="253" y1="175" x2="278" y2="175" stroke="{RED}" stroke-width="5"/>'
        + f'<polygon points="274,168 286,175 274,182" fill="{RED}"/>'
        + warning_triangle(330, 300, 45, col=RED)
        + caption("협착 주의")
    ),
]

# 6. strain — 근골격 부담: 무거운 물건을 허리 굽혀 드는 모습
PICTOGRAMS["strain"] = [
    svg_wrap(
        # 허리 굽힌 자세
        head(200, 130, 28)
        + f'<line x1="200" y1="158" x2="280" y2="210" stroke="{FIG_COL}" stroke-width="10" stroke-linecap="round"/>'  # 상체 기울어짐
        + arm(220, 168, 175, 145)
        + arm(255, 190, 295, 175)
        + leg(280,210, 260,300)
        + leg(280,210, 310,295)
        # 박스
        + rect(295, 175, 70, 60, WARN_COL, 4)
        # 허리 통증 표시
        + f'<circle cx="240" cy="210" r="12" fill="{RED}" opacity="0.7"/>'
        + f'<text x="240" y="215" text-anchor="middle" font-size="13" fill="white" font-weight="bold">!</text>'
        + caption("중량물 주의")
    ),
    svg_wrap(
        head(200, 130, 28)
        + f'<line x1="200" y1="158" x2="285" y2="215" stroke="{FIG_COL}" stroke-width="10" stroke-linecap="round"/>'
        + arm(225, 170, 175, 148)
        + arm(258, 193, 300, 180)
        + leg(285,215, 265,305)
        + leg(285,215, 315,298)
        + rect(298, 180, 70, 60, WARN_COL, 4)
        + f'<circle cx="242" cy="213" r="14" fill="{RED}" opacity="0.85"/>'
        + f'<text x="242" y="218" text-anchor="middle" font-size="14" fill="white" font-weight="bold">!</text>'
        + warning_triangle(120, 250, 50)
        + caption("중량물 주의")
    ),
]

# 7. property — 물적 손해: 물건이 선반에서 떨어지는 모습
PICTOGRAMS["property"] = [
    svg_wrap(
        rect(80, 180, 320, 14, "#555")
        + rect(80, 280, 320, 14, "#555")
        + rect(80, 180, 14, 120, "#555")
        + rect(386, 180, 14, 120, "#555")
        # 떨어지는 박스
        + rect(180, 145, 60, 50, WARN_COL, 4)
        + f'<text x="210" y="176" text-anchor="middle" font-size="22" fill="#000">📦</text>'
        # 낙하 화살표
        + arrow_down(210, 200, 260, col=RED)
        # 바닥의 깨진 물건
        + f'<text x="210" y="310" text-anchor="middle" font-size="28" fill="{RED}">✸</text>'
        + caption("물적 손해")
    ),
    svg_wrap(
        rect(80, 180, 320, 14, "#555")
        + rect(80, 280, 320, 14, "#555")
        + rect(80, 180, 14, 120, "#555")
        + rect(386, 180, 14, 120, "#555")
        + rect(180, 200, 60, 50, WARN_COL, 4)   # 박스 더 낮아짐
        + f'<text x="210" y="231" text-anchor="middle" font-size="22" fill="#000">📦</text>'
        + arrow_down(210, 255, 278, col=RED)
        + f'<text x="210" y="320" text-anchor="middle" font-size="32" fill="{RED}">✸</text>'
        + warning_triangle(330, 230, 45)
        + caption("물적 손해")
    ),
]

# 8. claim — 민원: 직원과 고객이 마주서는 모습 + 말풍선
PICTOGRAMS["claim"] = [
    svg_wrap(
        # 직원 (왼쪽)
        head(155, 115, 26)
        + body(155,141, 155,215)
        + arm(155,170, 115,145)
        + arm(155,170, 188,155)
        + leg(155,215, 125,300)
        + leg(155,215, 180,300)
        # 고객 (오른쪽)
        + head(325, 115, 26)
        + body(325,141, 325,215)
        + arm(325,170, 292,155)
        + arm(325,170, 362,145)
        + leg(325,215, 298,300)
        + leg(325,215, 350,300)
        # 고객 말풍선
        + f'<rect x="195" y="60" width="120" height="44" rx="10" fill="{WARN_COL}"/>'
        + f'<polygon points="230,104 250,120 270,104" fill="{WARN_COL}"/>'
        + f'<text x="255" y="88" text-anchor="middle" font-size="22" fill="#000">⚠ !</text>'
        + caption("민원 주의")
    ),
    svg_wrap(
        head(155, 115, 26)
        + body(155,141, 155,215)
        + arm(155,170, 112,148)
        + arm(155,170, 188,155)
        + leg(155,215, 125,300)
        + leg(155,215, 180,300)
        + head(325, 115, 26)
        + body(325,141, 325,215)
        + arm(325,170, 292,155)
        + arm(325,170, 365,148)
        + leg(325,215, 298,300)
        + leg(325,215, 350,300)
        + f'<rect x="192" y="55" width="126" height="48" rx="10" fill="{RED}"/>'
        + f'<polygon points="228,103 250,122 272,103" fill="{RED}"/>'
        + f'<text x="255" y="85" text-anchor="middle" font-size="24" fill="white">⚠ !!</text>'
        + warning_triangle(240, 355, 40)
        + caption("민원 주의")
    ),
]

# 9. health — 건강 이상: 사람이 가슴을 잡고 쓰러지는 모습
PICTOGRAMS["health"] = [
    svg_wrap(
        head(240, 115, 28)
        + body(240,143, 240,215)
        + arm(240,170, 200,155)
        + arm(240,170, 240,190)            # 오른팔 가슴에
        + leg(240,215, 210,300)
        + leg(240,215, 270,300)
        # 가슴 통증
        + f'<heart/>'
        + f'<circle cx="248" cy="185" r="18" fill="{RED}" opacity="0.25"/>'
        + f'<text x="248" y="191" text-anchor="middle" font-size="20" fill="{RED}">♥</text>'
        # EKG 라인
        + f'<polyline points="140,340 170,340 185,310 200,370 215,320 230,340 340,340" '
          f'stroke="{RED}" stroke-width="4" fill="none"/>'
        + caption("건강 이상")
    ),
    svg_wrap(
        # 쓰러지는 자세
        head(230, 140, 28)
        + f'<line x1="230" y1="168" x2="200" y2="240" stroke="{FIG_COL}" stroke-width="10" stroke-linecap="round"/>'
        + arm(215,190, 170,170)
        + arm(215,190, 240,195)
        + leg(200,240, 160,300)
        + leg(200,240, 230,305)
        + f'<circle cx="235" cy="195" r="20" fill="{RED}" opacity="0.3"/>'
        + f'<text x="235" y="201" text-anchor="middle" font-size="22" fill="{RED}">♥</text>'
        + f'<polyline points="140,345 170,345 185,315 200,375 215,325 230,345 340,345" '
          f'stroke="{RED}" stroke-width="4" fill="none"/>'
        + warning_triangle(330, 220, 45, col=RED)
        + caption("건강 이상")
    ),
]

# 10. default — 기본 경고
PICTOGRAMS["default"] = [
    svg_wrap(
        warning_triangle(240, 190, 110, col=WARN_COL, stroke="#1A1A2E", sw=6)
        + f'<text x="240" y="240" text-anchor="middle" font-size="44" font-weight="bold" fill="#1A1A2E">!</text>'
        + caption("안전 경고")
    ),
    svg_wrap(
        warning_triangle(240, 180, 120, col=RED, stroke="#1A1A2E", sw=6)
        + f'<text x="240" y="232" text-anchor="middle" font-size="48" font-weight="bold" fill="white">!</text>'
        + caption("안전 경고")
    ),
]

# ─── SVG → PNG → GIF 변환 ─────────────────────────────────────

def svg_to_pil(svg_str: str, size: int = GIF_W) -> Image.Image:
    with tempfile.NamedTemporaryFile(suffix=".svg", delete=False, mode="w") as f:
        f.write(svg_str)
        svg_path = f.name
    with tempfile.NamedTemporaryFile(suffix=".png", delete=False) as f:
        png_path = f.name
    subprocess.run(
        [RSVG, "--width", str(size), "--height", str(size),
         "--output", png_path, svg_path],
        check=True, capture_output=True
    )
    img = Image.open(png_path).convert("RGBA")
    Path(svg_path).unlink(missing_ok=True)
    Path(png_path).unlink(missing_ok=True)
    return img

def make_gif(key: str, frames_svg: list[str]):
    frames = []
    for svg in frames_svg:
        img = svg_to_pil(svg)
        # 흰 배경 합성 (GIF 팔레트 변환용)
        bg = Image.new("RGB", img.size, "white")
        bg.paste(img, mask=img.split()[3])
        frames.append(bg.convert("P", palette=Image.ADAPTIVE, colors=128))

    # 마지막 프레임을 한 번 더 추가해 자연스러운 루프
    frames.append(frames[-1].copy())

    out = ANIM_DIR / f"{key}.gif"
    frames[0].save(
        out,
        save_all=True,
        append_images=frames[1:],
        duration=[600, 600, 1200],   # 프레임별 지속시간(ms): 기본/강조/정지
        loop=0,
        optimize=True,
    )
    print(f"  ✓ {key}.gif → {out.relative_to(ROOT)}")

# ─── main ──────────────────────────────────────────────────────

if __name__ == "__main__":
    print(f"졸라맨 픽토그램 GIF 생성 ({len(PICTOGRAMS)}종)...")
    for key, svgs in PICTOGRAMS.items():
        try:
            make_gif(key, svgs)
        except Exception as e:
            print(f"  ✗ {key}: {e}")
    print("\n완료! images/scenes/anim/ 에 저장됨.")

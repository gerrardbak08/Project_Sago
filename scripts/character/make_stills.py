#!/usr/bin/env python3
"""
make_stills.py — 레퍼런스 캐릭터로 사고유형별 정지컷 PNG 생성

scenario_expression_map.json 의 face 매핑을 따라 표정을 고르고, 사고별 소품을 더해
proj/public/character/still/{slug}.png 로 출력 (CharacterPlayer .riv 폴백용).

캐릭터 본체·표정 = daiso_worker_rig.svg 와 동일 좌표/색.
"""
import json
import os
import subprocess
import tempfile

from PIL import Image

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "proj", "public", "character", "still")
MAP = os.path.join(ROOT, "assets", "character", "scenario_expression_map.json")
os.makedirs(OUT, exist_ok=True)

VB = "-14 0 148 186"   # 소품 여백 포함
W, H = 400, 504        # 2:3 비율 근사

O = "#1A1A1A"

# ── 캐릭터 본체 (얼굴 제외) — rig SVG 와 동일 ──
BODY_BACK = (
    '<path d="M74,24 Q92,30 92,52 Q92,66 82,64 Q86,48 72,30 Z" fill="#3A3A3A"/>'
    '<circle cx="75" cy="25" r="3.5" fill="#2B5CB8" stroke="#1E4488" stroke-width="1"/>'
    '<path d="M46,116 L44,158 Q44,162 49,162 L56,162 L58,116 Z" fill="#2D3340"/>'
    '<path d="M74,116 L76,158 Q76,162 71,162 L64,162 L62,116 Z" fill="#2D3340"/>'
    '<path d="M42,158 L57,158 L57,165 Q57,167 55,167 L44,167 Q42,167 42,165 Z" fill="#1A1A1A"/>'
    '<path d="M78,158 L63,158 L63,165 Q63,167 65,167 L76,167 Q78,167 78,165 Z" fill="#1A1A1A"/>'
    '<path d="M79,66 L78,102 L83,105 Q89,106 89,100 L91,80 Q90,68 79,66 Z" fill="#E84B4B"/>'
    '<circle cx="86" cy="104" r="5.5" fill="#F2C9A0"/>'
    '<path d="M40,64 Q60,58 80,64 L82,114 Q60,118 38,114 Z" fill="#E84B4B"/>'
    '<path d="M48,70 L72,70 L72,84 L79,86 L77,120 L43,120 L41,86 L48,84 Z" fill="#2B5CB8"/>'
    '<line x1="44" y1="100" x2="76" y2="100" stroke="#1E4488"/>'
    '<line x1="60" y1="100" x2="60" y2="120" stroke="#1E4488"/>'
    '<path d="M50,70 L54,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>'
    '<path d="M70,70 L66,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>'
    '<rect x="52" y="74" width="16" height="7" rx="1.5" fill="#FFFFFF"/>'
    '<circle cx="55.5" cy="77.5" r="1.6" fill="#E84B4B" stroke="none"/>'
    '<path d="M41,66 L42,102 L37,105 Q31,106 31,100 L29,80 Q30,68 41,66 Z" fill="#E84B4B"/>'
    '<circle cx="34" cy="104" r="5.5" fill="#F2C9A0"/>'
    '<rect x="54" y="50" width="12" height="14" rx="3" fill="#F2C9A0"/>'
    '<circle cx="60" cy="36" r="19" fill="#F2C9A0"/>'
)
HAIR_FRONT = ('<path d="M41,40 C40,20 51,14 60,14 C69,14 80,20 79,40 '
              'C75,30 68,27 60,28 C52,27 45,30 41,40 Z" fill="#3A3A3A"/>')

FACES = {
    "face_default": (
        f'<circle cx="53" cy="37" r="1.9" fill="{O}" stroke="none"/>'
        f'<circle cx="67" cy="37" r="1.9" fill="{O}" stroke="none"/>'
        f'<path d="M55,44 Q60,47 65,44" fill="none" stroke="{O}" stroke-width="1.6"/>'),
    "face_safe": (
        f'<path d="M50,38 Q53,34.5 56,38" fill="none" stroke="{O}" stroke-width="1.8"/>'
        f'<path d="M64,38 Q67,34.5 70,38" fill="none" stroke="{O}" stroke-width="1.8"/>'
        f'<path d="M53,43 Q60,50 67,43" fill="none" stroke="{O}" stroke-width="1.8"/>'),
    "face_shock": (
        f'<path d="M49,31 Q53,29 57,31" fill="none" stroke="{O}" stroke-width="1.4"/>'
        f'<path d="M63,31 Q67,29 71,31" fill="none" stroke="{O}" stroke-width="1.4"/>'
        f'<circle cx="53" cy="38" r="3" fill="#fff" stroke="{O}" stroke-width="1.4"/>'
        f'<circle cx="53" cy="38" r="1.2" fill="{O}" stroke="none"/>'
        f'<circle cx="67" cy="38" r="3" fill="#fff" stroke="{O}" stroke-width="1.4"/>'
        f'<circle cx="67" cy="38" r="1.2" fill="{O}" stroke="none"/>'
        f'<ellipse cx="60" cy="46" rx="3" ry="3.5" fill="#fff" stroke="{O}" stroke-width="1.6"/>'),
    "face_pain": (
        f'<path d="M50,36 L56,39 M50,39 L56,36" stroke="{O}" stroke-width="1.6"/>'
        f'<path d="M64,36 L70,39 M64,39 L70,36" stroke="{O}" stroke-width="1.6"/>'
        f'<path d="M54,46 Q57,42 60,46 Q63,42 66,46" fill="none" stroke="{O}" stroke-width="1.7"/>'),
    "face_warn": (
        f'<path d="M49,32 L57,35" stroke="{O}" stroke-width="1.6"/>'
        f'<path d="M71,32 L63,35" stroke="{O}" stroke-width="1.6"/>'
        f'<circle cx="53" cy="38.5" r="1.9" fill="{O}" stroke="none"/>'
        f'<circle cx="67" cy="38.5" r="1.9" fill="{O}" stroke="none"/>'
        f'<line x1="55" y1="45" x2="65" y2="45" stroke="{O}" stroke-width="1.7"/>'),
}

# ── 사고별 소품 (120x180 좌표계, 캐릭터 옆/위) ──
def _tri(cx, cy, s):
    return (f'<path d="M{cx} {cy-s} L{cx+s*0.9:.0f} {cy+s*0.6:.0f} L{cx-s*0.9:.0f} {cy+s*0.6:.0f} Z" '
            f'fill="#F4C430" stroke="{O}" stroke-width="1.4" stroke-linejoin="round"/>'
            f'<rect x="{cx-1}" y="{cy-s*0.3:.0f}" width="2" height="{s*0.55:.0f}" fill="{O}"/>'
            f'<circle cx="{cx}" cy="{cy+s*0.42:.0f}" r="1.4" fill="{O}"/>')

def _star(cx, cy, r, color="#E84B4B"):
    import math
    pts = []
    for k in range(10):
        a = math.radians(k * 36 - 90)
        rr = r if k % 2 == 0 else r * 0.45
        pts.append(f"{cx+math.cos(a)*rr:.1f},{cy+math.sin(a)*rr:.1f}")
    return f'<polygon points="{" ".join(pts)}" fill="{color}" stroke="{O}" stroke-width="1"/>'

PROPS = {
    "fall":     f'<path d="M100,40 L100,70" stroke="#E84B4B" stroke-width="3" stroke-linecap="round"/><path d="M96,66 L104,66 L100,74 Z" fill="#E84B4B"/>',
    "property": '<rect x="90" y="30" width="34" height="5" rx="1" fill="#8A6240"/><g transform="rotate(22 108 56)"><rect x="100" y="48" width="16" height="14" rx="2" fill="#E0A030"/></g>',
    "collision": lambda: _star(102, 70, 11),
    "slip":     '<ellipse cx="60" cy="170" rx="30" ry="4" fill="#7EC8E3" opacity="0.6"/>',
    "cut":      lambda: _star(30, 104, 7, "#E84B4B"),
    "strain":   '<rect x="92" y="92" width="26" height="22" rx="2" fill="#E0A030"/>' + (lambda: _star(84, 100, 6, "#E84B4B"))(),
    "health":   '<path d="M96,40 c-4,-6 -13,-1 0,9 c13,-10 4,-15 0,-9 Z" fill="#E84B4B"/><path d="M88,150 l8,0 l3,-7 l4,12 l3,-5 l30,0" fill="none" stroke="#E84B4B" stroke-width="1.6"/>',
    "claim":    f'<rect x="86" y="22" width="34" height="20" rx="5" fill="#F4C430"/><path d="M96,42 l-4,7 l10,-7 Z" fill="#F4C430"/><text x="103" y="36" font-size="11" fill="{O}" text-anchor="middle">⚠</text>',
    "default":  lambda: _tri(100, 44, 18),
    "safe":     f'<circle cx="100" cy="46" r="13" fill="#30A46C"/><path d="M93,46 l5,5 l9,-10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>',
}


def render_one(slug, face_id):
    prop = PROPS.get(slug, "")
    if callable(prop):
        prop = prop()
    face = FACES.get(face_id, FACES["face_default"])
    svg = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{VB}" width="{W}" height="{H}">'
           f'<g stroke="{O}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">'
           f'{BODY_BACK}{face}{HAIR_FRONT}{prop}</g></svg>')
    with tempfile.NamedTemporaryFile("w", suffix=".svg", delete=False) as f:
        f.write(svg); sp = f.name
    pp = os.path.join(OUT, f"{slug}.png")
    subprocess.run(["rsvg-convert", "-w", str(W), "-h", str(H), sp, "-o", pp], check=True)
    os.remove(sp)
    return pp


def main():
    spec = json.load(open(MAP, encoding="utf-8"))
    reps = []
    for sc in spec["scenarios"]:
        slug, face = sc["slug"], sc["face"]
        p = render_one(slug, face)
        reps.append((slug, p))
        print(f"  {slug:10s} ({face}) → {os.path.relpath(p, ROOT)}")
    # 컨택트 시트
    cols = 5
    rows = (len(reps) + cols - 1) // cols
    sheet = Image.new("RGB", (W * cols, H * rows), "white")
    for i, (slug, p) in enumerate(reps):
        im = Image.open(p).convert("RGBA")
        bg = Image.new("RGBA", im.size, "white"); bg.alpha_composite(im)
        sheet.paste(bg.convert("RGB"), ((i % cols) * W, (i // cols) * H))
    sheet_path = os.path.join(HERE, "out", "stills_sheet.png")
    sheet.save(sheet_path)
    print("컨택트 시트:", os.path.relpath(sheet_path, ROOT))


if __name__ == "__main__":
    main()

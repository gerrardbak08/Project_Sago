#!/usr/bin/env python3
"""
animate.py — 레퍼런스 캐릭터 CSS 애니메이션 SVG 생성 (웹 인라인 재생)

분해된 레이어(ponytail/arm_L/arm_R/character/effect)에 CSS keyframes 를 입혀
호흡·포니테일 흔들림·팔 스윙 + 사고별 리액션·이펙트가 살아 움직이는 자체완결 SVG.

출력: assets/character/animated/{slug}.svg  (build_guide_page 가 인라인 임베드)
Rive 없이 즉시 동작. Rive .riv 가 준비되면 그쪽으로 업그레이드.
"""
import json
import os

HERE = os.path.dirname(__file__)
ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))
OUT = os.path.join(ROOT, "assets", "character", "animated")
MAP = os.path.join(ROOT, "assets", "character", "scenario_expression_map.json")
os.makedirs(OUT, exist_ok=True)
O = "#1A1A1A"

# ── 부위별 조각 (rig SVG 와 동일 좌표/색) ──
PONYTAIL = ('<path d="M74,24 Q92,30 92,52 Q92,66 82,64 Q86,48 72,30 Z" fill="#3A3A3A"/>'
            '<circle cx="75" cy="25" r="3.5" fill="#2B5CB8" stroke="#1E4488" stroke-width="1"/>')
LEGS = ('<path d="M46,116 L44,158 Q44,162 49,162 L56,162 L58,116 Z" fill="#2D3340"/>'
        '<path d="M74,116 L76,158 Q76,162 71,162 L64,162 L62,116 Z" fill="#2D3340"/>'
        '<path d="M42,158 L57,158 L57,165 Q57,167 55,167 L44,167 Q42,167 42,165 Z" fill="#1A1A1A"/>'
        '<path d="M78,158 L63,158 L63,165 Q63,167 65,167 L76,167 Q78,167 78,165 Z" fill="#1A1A1A"/>')
ARM_R = ('<path d="M79,66 L78,102 L83,105 Q89,106 89,100 L91,80 Q90,68 79,66 Z" fill="#E84B4B"/>'
         '<circle cx="86" cy="104" r="5.5" fill="#F2C9A0"/>')
ARM_L = ('<path d="M41,66 L42,102 L37,105 Q31,106 31,100 L29,80 Q30,68 41,66 Z" fill="#E84B4B"/>'
         '<circle cx="34" cy="104" r="5.5" fill="#F2C9A0"/>')
TORSO = ('<path d="M40,64 Q60,58 80,64 L82,114 Q60,118 38,114 Z" fill="#E84B4B"/>'
         '<path d="M48,70 L72,70 L72,84 L79,86 L77,120 L43,120 L41,86 L48,84 Z" fill="#2B5CB8"/>'
         '<line x1="44" y1="100" x2="76" y2="100" stroke="#1E4488"/>'
         '<line x1="60" y1="100" x2="60" y2="120" stroke="#1E4488"/>'
         '<path d="M50,70 L54,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>'
         '<path d="M70,70 L66,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>'
         '<rect x="52" y="74" width="16" height="7" rx="1.5" fill="#FFFFFF"/>'
         '<circle cx="55.5" cy="77.5" r="1.6" fill="#E84B4B" stroke="none"/>')
HEAD_BASE = ('<rect x="54" y="50" width="12" height="14" rx="3" fill="#F2C9A0"/>'
             '<circle cx="60" cy="36" r="19" fill="#F2C9A0"/>')
HAIR = ('<path d="M41,40 C40,20 51,14 60,14 C69,14 80,20 79,40 '
        'C75,30 68,27 60,28 C52,27 45,30 41,40 Z" fill="#3A3A3A"/>')

FACES = {
    "face_default": (f'<circle cx="53" cy="37" r="1.9" fill="{O}" stroke="none"/>'
                     f'<circle cx="67" cy="37" r="1.9" fill="{O}" stroke="none"/>'
                     f'<path d="M55,44 Q60,47 65,44" fill="none" stroke="{O}" stroke-width="1.6"/>'),
    "face_safe": (f'<path d="M50,38 Q53,34.5 56,38" fill="none" stroke="{O}" stroke-width="1.8"/>'
                  f'<path d="M64,38 Q67,34.5 70,38" fill="none" stroke="{O}" stroke-width="1.8"/>'
                  f'<path d="M53,43 Q60,50 67,43" fill="none" stroke="{O}" stroke-width="1.8"/>'),
    "face_shock": (f'<path d="M49,31 Q53,29 57,31" fill="none" stroke="{O}" stroke-width="1.4"/>'
                   f'<path d="M63,31 Q67,29 71,31" fill="none" stroke="{O}" stroke-width="1.4"/>'
                   f'<circle cx="53" cy="38" r="3" fill="#fff" stroke="{O}" stroke-width="1.4"/>'
                   f'<circle cx="53" cy="38" r="1.2" fill="{O}" stroke="none"/>'
                   f'<circle cx="67" cy="38" r="3" fill="#fff" stroke="{O}" stroke-width="1.4"/>'
                   f'<circle cx="67" cy="38" r="1.2" fill="{O}" stroke="none"/>'
                   f'<ellipse cx="60" cy="46" rx="3" ry="3.5" fill="#fff" stroke="{O}" stroke-width="1.6"/>'),
    "face_pain": (f'<path d="M50,36 L56,39 M50,39 L56,36" stroke="{O}" stroke-width="1.6"/>'
                  f'<path d="M64,36 L70,39 M64,39 L70,36" stroke="{O}" stroke-width="1.6"/>'
                  f'<path d="M54,46 Q57,42 60,46 Q63,42 66,46" fill="none" stroke="{O}" stroke-width="1.7"/>'),
    "face_warn": (f'<path d="M49,32 L57,35" stroke="{O}" stroke-width="1.6"/>'
                  f'<path d="M71,32 L63,35" stroke="{O}" stroke-width="1.6"/>'
                  f'<circle cx="53" cy="38.5" r="1.9" fill="{O}" stroke="none"/>'
                  f'<circle cx="67" cy="38.5" r="1.9" fill="{O}" stroke="none"/>'
                  f'<line x1="55" y1="45" x2="65" y2="45" stroke="{O}" stroke-width="1.7"/>'),
}

# ── 공통 모션 CSS (호흡·포니테일·팔) + 리액션 클래스 ──
BASE_CSS = """
.character{animation:breathe 3s ease-in-out infinite;transform-origin:60px 116px}
@keyframes breathe{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.5px)}}
.ponytail{animation:sway 2.4s ease-in-out infinite;transform-origin:74px 26px;transform-box:fill-box}
@keyframes sway{0%,100%{transform:rotate(-4deg)}50%{transform:rotate(5deg)}}
.armL{animation:swingL 2.8s ease-in-out infinite;transform-origin:41px 66px;transform-box:fill-box}
@keyframes swingL{0%,100%{transform:rotate(-2deg)}50%{transform:rotate(4deg)}}
.armR{animation:swingR 2.8s ease-in-out infinite;transform-origin:79px 66px;transform-box:fill-box}
@keyframes swingR{0%,100%{transform:rotate(2deg)}50%{transform:rotate(-4deg)}}
"""

# ── 사고별 리액션(캐릭터 움직임) + 이펙트 CSS·요소 ──
def scene_extra(slug):
    """(react_css, effect_svg, effect_css) — 캐릭터 리액션과 소품 모션."""
    if slug == "fall":
        css = ".character{animation:fallReact 1.6s ease-in-out infinite}@keyframes fallReact{0%,55%{transform:rotate(0)}75%{transform:rotate(12deg) translateY(4px)}100%{transform:rotate(0)}}"
        eff = '<g class="fx"><path d="M104,38 L104,66" stroke="#E84B4B" stroke-width="3" stroke-linecap="round"/><path d="M100,62 L108,62 L104,70 Z" fill="#E84B4B"/></g>'
        ecss = ".fx{animation:drop 1.6s ease-in infinite}@keyframes drop{0%{opacity:0;transform:translateY(-8px)}40%{opacity:1}70%{opacity:1;transform:translateY(6px)}100%{opacity:0}}"
    elif slug == "slip":
        css = ".character{animation:slipReact 1.8s ease-in-out infinite}@keyframes slipReact{0%,50%{transform:rotate(0)}72%{transform:rotate(-13deg) translateY(5px)}100%{transform:rotate(0)}}"
        eff = '<ellipse class="fx" cx="60" cy="170" rx="28" ry="4" fill="#7EC8E3"/>'
        ecss = ".fx{animation:shimmer 1.8s ease-in-out infinite}@keyframes shimmer{0%,100%{opacity:.35;rx:24px}50%{opacity:.7}}"
    elif slug == "property":
        css = ".character{animation:back 2s ease-in-out infinite}@keyframes back{0%,50%{transform:rotate(0)}70%{transform:rotate(-7deg)}100%{transform:rotate(0)}}"
        eff = '<rect x="90" y="30" width="34" height="5" rx="1" fill="#8A6240"/><g class="fx"><rect x="100" y="44" width="16" height="14" rx="2" fill="#E0A030"/></g>'
        ecss = ".fx{transform-origin:108px 50px;animation:tipfall 2s ease-in infinite}@keyframes tipfall{0%,30%{transform:translateY(0) rotate(0);opacity:1}75%{transform:translateY(70px) rotate(80deg);opacity:1}85%{opacity:0}100%{opacity:0}}"
    elif slug == "collision":
        css = ".character{animation:shake .5s ease-in-out infinite}@keyframes shake{0%,100%{transform:translateX(0)}25%{transform:translateX(-2px)}75%{transform:translateX(2px)}}"
        eff = '<polygon class="fx" points="102,58 106,68 116,68 108,75 111,86 102,79 93,86 96,75 88,68 98,68" fill="#E84B4B" stroke="#1A1A1A" stroke-width="1"/>'
        ecss = ".fx{transform-origin:102px 72px;animation:pop 1s ease-out infinite}@keyframes pop{0%{transform:scale(.2);opacity:0}30%{transform:scale(1.1);opacity:1}60%{transform:scale(1)}100%{opacity:0;transform:scale(1.2)}}"
    elif slug == "cut":
        css = ".armL{animation:flinch .9s ease-in-out infinite;transform-origin:41px 66px;transform-box:fill-box}@keyframes flinch{0%,40%{transform:rotate(0)}55%{transform:rotate(-14deg)}100%{transform:rotate(0)}}"
        eff = '<polygon class="fx" points="30,98 32,104 38,104 33,108 35,114 30,110 25,114 27,108 22,104 28,104" fill="#E84B4B" stroke="#1A1A1A" stroke-width=".8"/>'
        ecss = ".fx{transform-origin:30px 104px;animation:pop .9s ease-out infinite}@keyframes pop{0%,45%{opacity:0;transform:scale(.3)}60%{opacity:1;transform:scale(1.1)}100%{opacity:0;transform:scale(1.2)}}"
    elif slug == "strain":
        css = ".character{animation:lift 2s ease-in-out infinite}@keyframes lift{0%,100%{transform:translateY(0)}30%{transform:translateY(-2px)}60%{transform:translateY(1px) rotate(2deg)}}"
        eff = '<rect x="90" y="92" width="26" height="22" rx="2" fill="#E0A030"/><g class="fx"><path d="M84,96 l-3,5 l5,-1 l-3,5" stroke="#E84B4B" stroke-width="2" fill="none" stroke-linecap="round"/></g>'
        ecss = ".fx{transform-origin:84px 100px;animation:zap 1s steps(2) infinite}@keyframes zap{0%,60%{opacity:0}70%,100%{opacity:1}}"
    elif slug == "health":
        css = ".character{animation:sink 2.4s ease-in-out infinite}@keyframes sink{0%,40%{transform:translateY(0)}70%{transform:translateY(5px) rotate(-3deg)}100%{transform:translateY(0)}}"
        eff = '<path class="fx" d="M96,40 c-4,-6 -13,-1 0,9 c13,-10 4,-15 0,-9 Z" fill="#E84B4B"/><path d="M86,150 l8,0 l3,-7 l4,12 l3,-5 l28,0" fill="none" stroke="#E84B4B" stroke-width="1.6"/>'
        ecss = ".fx{transform-origin:96px 44px;animation:beat .8s ease-in-out infinite}@keyframes beat{0%,100%{transform:scale(1)}30%{transform:scale(1.25)}}"
    elif slug == "claim":
        css = ".character{animation:bow 2.2s ease-in-out infinite}@keyframes bow{0%,60%{transform:rotate(0)}80%{transform:rotate(5deg) translateY(2px)}100%{transform:rotate(0)}}"
        eff = f'<g class="fx"><rect x="86" y="20" width="34" height="20" rx="5" fill="#F4C430"/><path d="M96,40 l-4,7 l10,-7 Z" fill="#F4C430"/><text x="103" y="34" font-size="11" fill="{O}" text-anchor="middle">⚠</text></g>'
        ecss = ".fx{transform-origin:103px 30px;animation:bob 1.4s ease-in-out infinite}@keyframes bob{0%,100%{transform:translateY(0);opacity:.8}50%{transform:translateY(-3px);opacity:1}}"
    elif slug == "safe":
        css = ".character{animation:hop 1.8s ease-in-out infinite}@keyframes hop{0%,100%{transform:translateY(0)}40%{transform:translateY(-4px)}}"
        eff = '<g class="fx"><circle cx="100" cy="46" r="13" fill="#30A46C"/><path d="M93,46 l5,5 l9,-10" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></g>'
        ecss = ".fx{transform-origin:100px 46px;animation:pop 1.8s ease-out infinite}@keyframes pop{0%{transform:scale(0);opacity:0}30%{transform:scale(1.15);opacity:1}45%{transform:scale(1)}100%{transform:scale(1);opacity:1}}"
    else:  # default 경고
        css = ""
        eff = '<g class="fx"><path d="M100,28 L116,55 L84,55 Z" fill="#F4C430" stroke="#1A1A1A" stroke-width="1.4" stroke-linejoin="round"/><rect x="99" y="38" width="2" height="10" fill="#1A1A1A"/><circle cx="100" cy="51" r="1.4" fill="#1A1A1A"/></g>'
        ecss = ".fx{transform-origin:100px 44px;animation:pulse 1.2s ease-in-out infinite}@keyframes pulse{0%,100%{transform:scale(1);opacity:.8}50%{transform:scale(1.12);opacity:1}}"
    return css, eff, ecss


def build_svg(slug, face_id):
    react_css, eff, eff_css = scene_extra(slug)
    face = FACES.get(face_id, FACES["face_default"])
    css = BASE_CSS + react_css + eff_css
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 0 148 186" width="320" height="402">
<style>{css}
svg *{{stroke-linejoin:round;stroke-linecap:round}}</style>
<g class="character" stroke="{O}" stroke-width="1.6">
  <g class="ponytail">{PONYTAIL}</g>
  {LEGS}
  <g class="armR">{ARM_R}</g>
  {TORSO}
  <g class="armL">{ARM_L}</g>
  <g>{HEAD_BASE}{face}{HAIR}</g>
</g>
<g stroke="{O}" stroke-width="1.6">{eff}</g>
</svg>"""


def main():
    spec = json.load(open(MAP, encoding="utf-8"))
    for sc in spec["scenarios"]:
        slug, face = sc["slug"], sc["face"]
        svg = build_svg(slug, face)
        open(os.path.join(OUT, f"{slug}.svg"), "w").write(svg)
        print(f"  {slug:10s} ({face}) → assets/character/animated/{slug}.svg")
    # 미리보기 HTML
    cells = "".join(
        f'<div class=c><object type="image/svg+xml" data="{sc["slug"]}.svg"></object>'
        f'<small>{sc["label"]}</small></div>' for sc in spec["scenarios"])
    html = f"""<!doctype html><meta charset=utf-8><title>움직이는 캐릭터</title>
<style>body{{font-family:sans-serif;background:#f4f5f8;margin:0;padding:24px}}
h2{{text-align:center}}.g{{display:grid;grid-template-columns:repeat(5,1fr);gap:10px;max-width:1000px;margin:0 auto}}
.c{{background:#fff;border-radius:14px;padding:10px;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,.06)}}
.c object{{width:100%;max-width:170px;height:auto}}.c small{{display:block;font-weight:700;color:#555;margin-top:4px}}</style>
<h2>🎬 움직이는 캐릭터 — 사고유형별 (CSS 애니메이션)</h2><div class=g>{cells}</div>"""
    open(os.path.join(OUT, "preview.html"), "w").write(html)
    print("미리보기:", os.path.join(OUT, "preview.html"))


if __name__ == "__main__":
    main()

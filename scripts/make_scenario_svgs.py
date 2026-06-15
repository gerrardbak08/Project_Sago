#!/usr/bin/env python3
"""
make_scenario_svgs.py — 시나리오 스토리 애니메이션 SVG 생성

전략:
  · transform-box:fill-box 제거 → SVG 뷰포트 기준 transform-origin 정상 동작
  · 어깨 커버 circle로 팔-몸통 접합부 은닉
  · 각 시나리오: 상황 등장 → 캐릭터 반응 → 충격·결과 (3단계 스토리)
  · 팔/다리 CSS animation에 transform-origin만, fill-box 없음
"""
from __future__ import annotations
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT  = ROOT / "assets" / "character" / "animated"
OUT.mkdir(parents=True, exist_ok=True)

O = "#1A1A1A"

# ── 표정 ─────────────────────────────────────────────────────────────────────
FACES = {
    "shock": f"""
    <circle cx="53" cy="36" r="3.2" fill="#fff" stroke="{O}" stroke-width="1.4"/>
    <circle cx="53" cy="36" r="1.5" fill="{O}" stroke="none"/>
    <circle cx="67" cy="36" r="3.2" fill="#fff" stroke="{O}" stroke-width="1.4"/>
    <circle cx="67" cy="36" r="1.5" fill="{O}" stroke="none"/>
    <path d="M49,29 Q53,27 57,29" fill="none" stroke="{O}" stroke-width="1.4"/>
    <path d="M63,29 Q67,27 71,29" fill="none" stroke="{O}" stroke-width="1.4"/>
    <ellipse cx="60" cy="45" rx="4" ry="3.5" fill="{O}"/>
    <ellipse cx="60" cy="45" rx="3" ry="2.4" fill="#CC3333"/>""",

    "pain": f"""
    <path d="M50,35 L56,39 M50,39 L56,35" stroke="{O}" stroke-width="1.8"/>
    <path d="M64,35 L70,39 M64,39 L70,35" stroke="{O}" stroke-width="1.8"/>
    <path d="M49,30 Q53,27 57,30" fill="none" stroke="{O}" stroke-width="1.4"/>
    <path d="M63,30 Q67,27 71,30" fill="none" stroke="{O}" stroke-width="1.4"/>
    <path d="M54,46 Q57,42 60,45 Q63,42 66,46" fill="none" stroke="{O}" stroke-width="1.7"/>""",

    "warn": f"""
    <path d="M49,32 L57,35" stroke="{O}" stroke-width="1.6"/>
    <path d="M71,32 L63,35" stroke="{O}" stroke-width="1.6"/>
    <circle cx="53" cy="39" r="2" fill="{O}" stroke="none"/>
    <circle cx="67" cy="39" r="2" fill="{O}" stroke="none"/>
    <line x1="55" y1="46" x2="65" y2="46" stroke="{O}" stroke-width="1.7"/>""",

    "safe": f"""
    <path d="M50,38 Q53,34 56,38" fill="none" stroke="{O}" stroke-width="1.8"/>
    <path d="M64,38 Q67,34 70,38" fill="none" stroke="{O}" stroke-width="1.8"/>
    <path d="M53,44 Q60,51 67,44" fill="none" stroke="{O}" stroke-width="1.8"/>""",
}

# ── 캐릭터 베이스 (어깨 커버 포함) ────────────────────────────────────────────
def body(face_key: str) -> str:
    """어깨 커버 circle이 포함된 캐릭터. CSS class로 각 파트를 개별 애니메이션."""
    face = FACES[face_key]
    return f"""<g class="char" stroke="{O}" stroke-width="1.6" stroke-linejoin="round" stroke-linecap="round">
  <!-- 다리 -->
  <g class="legL">
    <path d="M46,116 L44,158 Q44,162 49,162 L56,162 L58,116 Z" fill="#2D3340"/>
    <path d="M42,158 L57,158 L57,165 Q57,167 55,167 L44,167 Q42,167 42,165 Z" fill="{O}"/>
  </g>
  <g class="legR">
    <path d="M74,116 L76,158 Q76,162 71,162 L64,162 L62,116 Z" fill="#2D3340"/>
    <path d="M78,158 L63,158 L63,165 Q63,167 65,167 L76,167 Q78,167 78,165 Z" fill="{O}"/>
  </g>
  <!-- 몸통·앞치마 -->
  <g class="torso">
    <path d="M40,64 Q60,58 80,64 L82,114 Q60,118 38,114 Z" fill="#E84B4B"/>
    <path d="M48,70 L72,70 L72,84 L79,86 L77,120 L43,120 L41,86 L48,84 Z" fill="#2B5CB8"/>
    <line x1="44" y1="100" x2="76" y2="100" stroke="#1E4488" stroke-width="1.2"/>
    <line x1="60" y1="100" x2="60" y2="120" stroke="#1E4488" stroke-width="1.2"/>
    <path d="M50,70 L54,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>
    <path d="M70,70 L66,58" stroke="#2B5CB8" stroke-width="3" fill="none"/>
    <rect x="52" y="74" width="16" height="7" rx="1.5" fill="#FFFFFF"/>
    <circle cx="55.5" cy="77.5" r="1.6" fill="#E84B4B" stroke="none"/>
  </g>
  <!-- 팔 R (armL 뒤에) -->
  <g class="armR">
    <path d="M79,66 L78,102 L83,105 Q89,106 89,100 L91,80 Q90,68 79,66 Z" fill="#E84B4B"/>
    <circle cx="86" cy="104" r="5.5" fill="#F2C9A0"/>
  </g>
  <!-- 팔 L -->
  <g class="armL">
    <path d="M41,66 L42,102 L37,105 Q31,106 31,100 L29,80 Q30,68 41,66 Z" fill="#E84B4B"/>
    <circle cx="34" cy="104" r="5.5" fill="#F2C9A0"/>
  </g>
  <!-- 어깨 커버: 팔-몸통 접합부 은닉 (팔 위에 그려짐) -->
  <circle cx="41" cy="67" r="7" fill="#E84B4B" stroke="{O}" stroke-width="1.2"/>
  <circle cx="79" cy="67" r="7" fill="#E84B4B" stroke="{O}" stroke-width="1.2"/>
  <!-- 머리 그룹 -->
  <g class="headGrp">
    <rect x="54" y="50" width="12" height="14" rx="3" fill="#F2C9A0"/>
    <circle cx="60" cy="36" r="19" fill="#F2C9A0"/>
    {face}
    <path d="M41,40 C40,20 51,14 60,14 C69,14 80,20 79,40 C75,30 68,27 60,28 C52,27 45,30 41,40 Z" fill="#3A3A3A"/>
    <g class="ponytail">
      <path d="M74,24 Q92,30 92,52 Q92,66 82,64 Q86,48 72,30 Z" fill="#3A3A3A"/>
      <circle cx="75" cy="25" r="3.5" fill="#2B5CB8" stroke="#1E4488" stroke-width="1"/>
    </g>
  </g>
</g>"""


def make_svg(comment: str, css: str, char_html: str, fx_html: str = "") -> str:
    return f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="-14 0 148 186" width="320" height="402">
<!-- {comment} -->
<style>
/* 공통: ponytail 흔들기 */
.ponytail{{animation:ponySway 2.8s ease-in-out infinite;transform-origin:74px 24px}}
@keyframes ponySway{{0%,100%{{transform:rotate(-4deg)}}50%{{transform:rotate(5deg)}}}}
{css}
</style>
{char_html}
{fx_html}
</svg>"""


# ════════════════════════════════════════════════════════════════════════════
# 시나리오별 스토리 애니메이션
# ════════════════════════════════════════════════════════════════════════════
SVGS: dict[str, str] = {}

# ── 1. fall (낙상): 서있음 → 균형 잃음 → 쓰러짐 → 충격 ───────────────────────
SVGS["fall"] = make_svg("낙상: 균형상실→낙하→착지충격", css="""
/* 전신: 서있다가 뒤로 넘어짐 */
.char{animation:fallChar 3s cubic-bezier(.4,0,.6,1) infinite;transform-origin:60px 165px}
@keyframes fallChar{
  0%,18%{transform:rotate(0)}              /* 서있음 */
  38%   {transform:rotate(-16deg)}          /* 균형 흔들림 */
  58%,72%{transform:rotate(-34deg)}        /* 완전히 쓰러짐 */
  80%   {transform:rotate(-30deg)}          /* 착지 후 정지 */
  100%  {transform:rotate(0)}              /* 복구 */
}
/* 팔 L: 왼쪽으로 뻗음 (허우적) */
.armL{animation:fallArmL 3s cubic-bezier(.4,0,.6,1) infinite;transform-origin:41px 66px}
@keyframes fallArmL{
  0%,18%{transform:rotate(0)}
  35%   {transform:rotate(-28deg)}
  55%,75%{transform:rotate(-54deg)}
  100%  {transform:rotate(0)}
}
/* 팔 R: 오른쪽으로 뻗음 (허우적) */
.armR{animation:fallArmR 3s cubic-bezier(.4,0,.6,1) infinite;transform-origin:79px 66px}
@keyframes fallArmR{
  0%,18%{transform:rotate(0)}
  35%   {transform:rotate(28deg)}
  55%,75%{transform:rotate(54deg)}
  100%  {transform:rotate(0)}
}
/* 포니테일: 빠르게 뒤로 */
.ponytail{animation:fallPony 3s ease-in-out infinite;transform-origin:74px 24px}
@keyframes fallPony{0%,18%{transform:rotate(-4deg)}55%{transform:rotate(20deg)}100%{transform:rotate(-4deg)}}
/* 이펙트: 쓰러질 때 등장 */
.fx{animation:fallFx 3s ease-in-out infinite}
@keyframes fallFx{0%,50%{opacity:0}65%,80%{opacity:1}95%,100%{opacity:0}}""",
    char_html=body("shock"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.3">
  <path d="M98,158 L99,154 L100,158 L104,157 L101,160 L102,164 L99,161 L96,164 L97,160 L94,157 Z" fill="#FFD700"/>
  <path d="M112,163 L113,160 L114,163 L117,162 L115,165 L116,168 L113,166 L110,168 L111,165 L109,162 Z" fill="#FFD700"/>
  <path d="M94,170 L95,167 L96,170 L99,169 L97,172 L98,175 L95,173 L92,175 L93,172 L91,169 Z" fill="#FFD700"/>
  <path d="M107,169 L108,166 L109,169 L112,168 L110,171 L111,174 L108,172 L105,174 L106,171 L104,168 Z" fill="#FF8C00"/>
</g>""")

# ── 2. slip (미끄러짐): 걷다가 → 발 미끄러짐 → 뒤로 넘어짐 ─────────────────
SVGS["slip"] = make_svg("미끄러짐: 걷기→발미끄러짐→뒤로넘어짐", css="""
.char{animation:slipChar 3s cubic-bezier(.4,0,.6,1) infinite;transform-origin:60px 165px}
@keyframes slipChar{
  0%,15%{transform:rotate(0) translateX(0)}       /* 걷기 */
  35%   {transform:rotate(-14deg) translateX(4px)} /* 발 미끄러짐 */
  55%,70%{transform:rotate(-28deg) translateX(8px)} /* 쓰러짐 */
  80%   {transform:rotate(-24deg) translateX(6px)} /* 바닥 충격 */
  100%  {transform:rotate(0) translateX(0)}
}
/* 미끄러질 때 다리 벌어짐 */
.legL{animation:slipLegL 3s ease-in-out infinite;transform-origin:52px 116px}
@keyframes slipLegL{
  0%,15%{transform:rotate(0)}
  38%,60%{transform:rotate(22deg)}
  100%{transform:rotate(0)}
}
.legR{animation:slipLegR 3s ease-in-out infinite;transform-origin:68px 116px}
@keyframes slipLegR{
  0%,15%{transform:rotate(0)}
  38%,60%{transform:rotate(-18deg)}
  100%{transform:rotate(0)}
}
/* 팔: 균형 잡으려 벌어짐 */
.armL{animation:slipArmL 3s ease-in-out infinite;transform-origin:41px 66px}
@keyframes slipArmL{0%,15%{transform:rotate(0)}40%,65%{transform:rotate(-40deg)}100%{transform:rotate(0)}}
.armR{animation:slipArmR 3s ease-in-out infinite;transform-origin:79px 66px}
@keyframes slipArmR{0%,15%{transform:rotate(0)}40%,65%{transform:rotate(38deg)}100%{transform:rotate(0)}}
.ponytail{animation:slipPony 3s ease-in-out infinite;transform-origin:74px 24px}
@keyframes slipPony{0%,15%{transform:rotate(-4deg)}55%{transform:rotate(18deg)}100%{transform:rotate(-4deg)}}
/* 물 이펙트: 초반에 바닥에 물이 보임 */
.fx{animation:slipFx 3s ease-in-out infinite}
@keyframes slipFx{0%{opacity:0.8}30%,100%{opacity:0.9}}""",
    char_html=body("shock"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.2">
  <ellipse cx="56" cy="173" rx="24" ry="5" fill="#B8E0FF" stroke="#5BA4D4" stroke-width="1.1"/>
  <ellipse cx="56" cy="173" rx="15" ry="3" fill="none" stroke="#7CC4F0" stroke-width="0.8"/>
  <path d="M32,169 Q28,162 34,159" fill="none" stroke="#5BA4D4" stroke-width="1.4"/>
  <path d="M80,169 Q84,162 80,159" fill="none" stroke="#5BA4D4" stroke-width="1.4"/>
  <circle cx="28" cy="158" r="2.8" fill="#B8E0FF" stroke="#5BA4D4" stroke-width="1"/>
  <circle cx="85" cy="158" r="2.8" fill="#B8E0FF" stroke="#5BA4D4" stroke-width="1"/>
  <!-- 미끄럼 주의 삼각형 -->
  <path d="M-6,162 L4,176 L-16,176 Z" fill="#FEF9C3" stroke="#F59E0B" stroke-width="1.3"/>
  <line x1="-6" y1="166" x2="-6" y2="171" stroke="#D97706" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="-6" cy="174" r="1.5" fill="#D97706"/>
</g>""")

# ── 3. collision (충돌): 정상 → 충돌 순간 정지 → 뒤로 튕겨남 ─────────────────
SVGS["collision"] = make_svg("충돌: 걷기→충돌정지→반동", css="""
.char{animation:colChar 2.8s cubic-bezier(.4,0,.6,1) infinite}
@keyframes colChar{
  0%,20%{transform:translateX(0) rotate(0)}     /* 정상 */
  28%   {transform:translateX(-6px) rotate(-4deg)} /* 충돌 순간 */
  38%,60%{transform:translateX(10px) rotate(8deg)} /* 뒤로 튕김 */
  75%   {transform:translateX(5px) rotate(4deg)}
  100%  {transform:translateX(0) rotate(0)}
}
/* 충돌 시 팔이 앞으로 뻗어짐 */
.armL{animation:colArmL 2.8s ease-in-out infinite;transform-origin:41px 66px}
@keyframes colArmL{0%,20%{transform:rotate(0)}28%,50%{transform:rotate(-25deg)}100%{transform:rotate(0)}}
.armR{animation:colArmR 2.8s ease-in-out infinite;transform-origin:79px 66px}
@keyframes colArmR{0%,20%{transform:rotate(0)}28%,50%{transform:rotate(-20deg)}100%{transform:rotate(0)}}
.ponytail{animation:colPony 2.8s ease-in-out infinite;transform-origin:74px 24px}
@keyframes colPony{0%,25%{transform:rotate(-3deg)}40%{transform:rotate(-12deg)}100%{transform:rotate(-3deg)}}
/* 충돌 이펙트: 충돌 순간에만 등장 */
.fx{animation:colFx 2.8s ease-in-out infinite}
@keyframes colFx{0%,22%{opacity:0}32%,52%{opacity:1}68%,100%{opacity:0}}""",
    char_html=body("shock"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.3">
  <path d="M-5,76 L-3,68 L-1,76 L7,74 L2,80 L4,88 L-3,83 L-10,88 L-8,80 L-13,74 Z" fill="#FFD700"/>
  <line x1="-3" y1="63" x2="-3" y2="57" stroke="#FFD700" stroke-width="2"/>
  <line x1="6"  y1="67" x2="11" y2="62" stroke="#FFD700" stroke-width="2"/>
  <line x1="-12" y1="67" x2="-17" y2="62" stroke="#FFD700" stroke-width="2"/>
  <line x1="-3" y1="93" x2="-3" y2="99" stroke="#FFD700" stroke-width="2"/>
  <line x1="-18" y1="78" x2="-24" y2="78" stroke="#FFD700" stroke-width="2"/>
</g>""")

# ── 4. property (재물손상): 상자 낙하 → 충격 → 방어자세 ──────────────────────
SVGS["property"] = make_svg("재물손상: 상자낙하→충격→방어", css="""
/* 낙하 상자: 위에서 내려와 충격 */
.box{animation:boxFall 3s cubic-bezier(.4,0,.6,1) infinite}
@keyframes boxFall{
  0%,5%  {transform:translateY(-70px);opacity:0}
  15%    {opacity:1}
  45%    {transform:translateY(0)}        /* 도착 */
  55%    {transform:translateY(5px)}      /* 충격 바운스 */
  70%,85%{transform:translateY(0)}        /* 정지 */
  100%   {transform:translateY(-70px);opacity:0}
}
/* 캐릭터: 상자 도착 전 정상, 충격 후 웅크림 */
.char{animation:propChar 3s ease-in-out infinite}
@keyframes propChar{
  0%,40%{transform:translateY(0)}         /* 정상 */
  50%   {transform:translateY(8px)}        /* 충격 웅크림 */
  68%,85%{transform:translateY(5px)}      /* 웅크린 자세 유지 */
  100%  {transform:translateY(0)}
}
/* 팔: 충격 후 머리 보호를 위해 올라감 */
.armL{animation:propArmL 3s ease-in-out infinite;transform-origin:41px 66px}
@keyframes propArmL{0%,42%{transform:rotate(0)}54%,82%{transform:rotate(-58deg)}100%{transform:rotate(0)}}
.armR{animation:propArmR 3s ease-in-out infinite;transform-origin:79px 66px}
@keyframes propArmR{0%,42%{transform:rotate(0)}54%,82%{transform:rotate(58deg)}100%{transform:rotate(0)}}
/* 충격 이펙트 */
.fx{animation:propFx 3s ease-in-out infinite}
@keyframes propFx{0%,43%{opacity:0}52%,65%{opacity:1}80%,100%{opacity:0}}""",
    char_html=body("shock"),
    fx_html=f"""<g class="box" stroke="{O}" stroke-width="1.4">
  <rect x="40" y="4" width="40" height="30" rx="3" fill="#E8C87A"/>
  <rect x="40" y="4" width="40" height="9" rx="2" fill="#D4A844"/>
  <line x1="60" y1="4"  x2="60" y2="34" stroke="#C49030" stroke-width="1.2"/>
  <line x1="40" y1="13" x2="80" y2="13" stroke="#C49030" stroke-width="1" opacity="0.6"/>
</g>
<g class="fx" stroke="{O}" stroke-width="1.3">
  <circle cx="60" cy="30" r="10" fill="none" stroke="#FF6B35" stroke-width="1.8"/>
  <line x1="60" y1="17" x2="56" y2="10" stroke="#FF6B35" stroke-width="1.8"/>
  <line x1="60" y1="17" x2="64" y2="10" stroke="#FF6B35" stroke-width="1.8"/>
  <line x1="48" y1="24" x2="42" y2="22" stroke="#FF6B35" stroke-width="1.8"/>
  <line x1="72" y1="24" x2="78" y2="22" stroke="#FF6B35" stroke-width="1.8"/>
</g>""")

# ── 5. cut (자상): 작업 → 베임 순간 → 손 움츠림 ──────────────────────────────
SVGS["cut"] = make_svg("자상: 작업→베임→손움츠림", css="""
/* 캐릭터: 작업 중 앞으로 약간 기울어짐 → 충격 */
.char{animation:cutChar 2.6s cubic-bezier(.4,0,.6,1) infinite;transform-origin:60px 165px}
@keyframes cutChar{
  0%,15%{transform:rotate(0)}
  30%   {transform:rotate(6deg)}            /* 작업 중 앞으로 */
  38%   {transform:rotate(2deg)}            /* 베임 순간 정지 */
  55%,75%{transform:rotate(-4deg)}          /* 뒤로 움찔 */
  100%  {transform:rotate(0)}
}
/* 팔 R: 작업 아래→위로 → 베임 후 급격히 뒤로 당김 */
.armR{animation:cutArmR 2.6s cubic-bezier(.4,0,.6,1) infinite;transform-origin:79px 66px}
@keyframes cutArmR{
  0%,12%{transform:rotate(0)}
  28%   {transform:rotate(-18deg)}           /* 작업: 아래로 */
  37%   {transform:rotate(-20deg)}           /* 베임 순간 */
  42%   {transform:rotate(55deg)}            /* 급격히 뒤로! */
  60%,78%{transform:rotate(48deg)}           /* 통증으로 굳음 */
  100%  {transform:rotate(0)}
}
/* 팔 L: 베임 직후 다친 손 쪽으로 이동 */
.armL{animation:cutArmL 2.6s ease-in-out infinite;transform-origin:41px 66px}
@keyframes cutArmL{0%,38%{transform:rotate(0)}48%,75%{transform:rotate(-15deg)}100%{transform:rotate(0)}}
/* 베임 이펙트: 순간적으로 밝게 */
.fx{animation:cutFx 2.6s ease-in-out infinite}
@keyframes cutFx{0%,34%{opacity:0}38%,48%{opacity:1}58%,100%{opacity:0}}""",
    char_html=body("pain"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.4">
  <path d="M90,80 L104,96" stroke="#E53030" stroke-width="3" stroke-linecap="round"/>
  <path d="M94,77 L108,93" stroke="#E53030" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="102" cy="98" r="3" fill="#C0392B"/>
  <path d="M97,100 Q98,106 96,110 Q94,106 95,100 Z" fill="#C0392B"/>
  <circle cx="88" cy="76" r="7" fill="#FFF0F0" stroke="#E53030" stroke-width="1.3"/>
  <line x1="84" y1="72" x2="92" y2="80" stroke="#E53030" stroke-width="1.4"/>
  <line x1="84" y1="80" x2="92" y2="72" stroke="#E53030" stroke-width="1.4"/>
</g>""")

# ── 6. strain (무리한동작): 박스 들기 → 허리 통증 ────────────────────────────
SVGS["strain"] = make_svg("무리한동작: 박스들기→허리통증", css="""
/* 캐릭터: 앞으로 굽혀 들기 → 서기 → 허리 통증 */
.char{animation:strainChar 3.2s cubic-bezier(.4,0,.6,1) infinite;transform-origin:60px 116px}
@keyframes strainChar{
  0%,10% {transform:rotate(0)}
  25%    {transform:rotate(22deg)}            /* 박스 잡으러 앞으로 굽힘 */
  42%    {transform:rotate(10deg)}            /* 들어올리는 중 */
  52%    {transform:rotate(0)}                /* 섬 */
  60%    {transform:rotate(-8deg)}            /* 허리 통증: 뒤로 젖혀짐 */
  70%,85%{transform:rotate(-6deg)}            /* 통증으로 굳음 */
  100%   {transform:rotate(0)}
}
/* 박스: 바닥에 있다가 들려올라감 */
.box{animation:strainBox 3.2s ease-in-out infinite}
@keyframes strainBox{
  0%,18%{transform:translateY(30px);opacity:1}  /* 바닥의 박스 */
  36%   {transform:translateY(20px);opacity:1}
  50%   {transform:translateY(0);opacity:1}      /* 다 들어올림 */
  88%   {transform:translateY(0);opacity:0.4}
  100%  {transform:translateY(30px);opacity:1}
}
/* 팔: 박스 잡기 */
.armL{animation:strainArmL 3.2s ease-in-out infinite;transform-origin:41px 66px}
@keyframes strainArmL{0%,10%{transform:rotate(0)}22%,48%{transform:rotate(-22deg)}56%{transform:rotate(25deg)}72%,87%{transform:rotate(22deg)}100%{transform:rotate(0)}}
.armR{animation:strainArmR 3.2s ease-in-out infinite;transform-origin:79px 66px}
@keyframes strainArmR{0%,10%{transform:rotate(0)}22%,48%{transform:rotate(22deg)}56%{transform:rotate(-20deg)}72%,87%{transform:rotate(-18deg)}100%{transform:rotate(0)}}
/* 번개: 허리 통증 */
.fx{animation:strainFx 3.2s ease-in-out infinite}
@keyframes strainFx{
  0%,54%{opacity:0}
  58%,62%{opacity:1}64%,68%{opacity:0.1}
  70%,75%{opacity:1}78%,100%{opacity:0}
}""",
    char_html=body("pain"),
    fx_html=f"""<g class="box" stroke="{O}" stroke-width="1.3">
  <rect x="38" y="128" width="44" height="28" rx="3" fill="#D4A844"/>
  <line x1="60" y1="128" x2="60" y2="156" stroke="#B8892E" stroke-width="1.2"/>
  <line x1="38" y1="140" x2="82" y2="140" stroke="#B8892E" stroke-width="1" opacity="0.5"/>
</g>
<g class="fx" stroke="{O}" stroke-width="1.3">
  <path d="M88,88 L82,103 L89,103 L80,122" stroke="#F59E0B" stroke-width="2.8"
        fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M94,86 L88,101 L95,101 L86,120" stroke="#FDE68A" stroke-width="1.6"
        fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  <circle cx="86" cy="105" r="11" fill="#FEF3C7" opacity="0.5"/>
</g>""")

# ── 7. health (건강장해): 정상 → 가슴 통증 → 무너짐 ──────────────────────────
SVGS["health"] = make_svg("건강장해: 정상→흉통→쓰러짐", css="""
/* 캐릭터: 점점 아래로 가라앉음 (무릎 꺾임 표현) */
.char{animation:healthChar 3.5s cubic-bezier(.4,0,.6,1) infinite}
@keyframes healthChar{
  0%,20%{transform:translateY(0) scaleY(1)}       /* 정상 */
  45%   {transform:translateY(8px) scaleY(0.96)}   /* 다리 꺾이기 시작 */
  62%,80%{transform:translateY(18px) scaleY(0.88)} /* 주저앉음 */
  92%,100%{transform:translateY(0) scaleY(1)}
}
/* 팔 L: 가슴으로 올라감 */
.armL{animation:healthArmL 3.5s ease-in-out infinite;transform-origin:41px 66px}
@keyframes healthArmL{
  0%,22%{transform:rotate(0)}
  40%,80%{transform:rotate(-42deg)}
  100%{transform:rotate(0)}
}
/* 팔 R: 약간 들어올려짐 */
.armR{animation:healthArmR 3.5s ease-in-out infinite;transform-origin:79px 66px}
@keyframes healthArmR{0%,28%{transform:rotate(0)}45%,78%{transform:rotate(15deg)}100%{transform:rotate(0)}}
/* 심장 + ECG 이펙트 */
.fx{animation:healthFx 3.5s ease-in-out infinite}
@keyframes healthFx{0%,18%{opacity:0}35%,82%{opacity:1}95%,100%{opacity:0}}
.ecg{animation:ecgAnim 3.5s linear infinite;stroke-dasharray:80;stroke-dashoffset:80}
@keyframes ecgAnim{0%,30%{stroke-dashoffset:80}65%,100%{stroke-dashoffset:0}}""",
    char_html=body("pain"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.2">
  <path d="M96,38 Q90,32 90,42 Q90,50 102,56 Q114,50 114,42 Q114,32 108,38 Q102,32 96,38"
        fill="#FF6B8A" stroke="#C0392B" stroke-width="1.3"/>
  <circle cx="102" cy="46" r="13" fill="none" stroke="#FF9999" stroke-width="1.3" opacity="0.5"/>
  <path class="ecg" d="M78,72 L84,72 L86,64 L88,82 L92,58 L96,72 L120,72"
        fill="none" stroke="#22C55E" stroke-width="2"
        stroke-linecap="round" stroke-linejoin="round"/>
</g>""")

# ── 8. claim (고객불만): 정상 → 고객 항의 등장 → 달래는 자세 ──────────────────
SVGS["claim"] = make_svg("고객불만: 정상→항의등장→달래기", css="""
.char{animation:claimChar 2.8s ease-in-out infinite;transform-origin:60px 165px}
@keyframes claimChar{
  0%,20%{transform:rotate(0)}
  35%,75%{transform:rotate(-6deg)}     /* 항의 받고 뒤로 약간 */
  100%{transform:rotate(0)}
}
/* 팔: 서서히 올라와 달래는 손짓 */
.armL{animation:claimArmL 2.8s ease-in-out infinite;transform-origin:41px 66px}
@keyframes claimArmL{0%,22%{transform:rotate(0)}38%,72%{transform:rotate(-26deg)}100%{transform:rotate(0)}}
.armR{animation:claimArmR 2.8s ease-in-out infinite;transform-origin:79px 66px}
@keyframes claimArmR{0%,22%{transform:rotate(0)}38%,72%{transform:rotate(26deg)}100%{transform:rotate(0)}}
/* 말풍선: 위아래 흔들림 */
.fx{animation:claimFx 1.6s ease-in-out infinite}
@keyframes claimFx{0%,100%{transform:translateY(0)}50%{transform:translateY(-5px)}}""",
    char_html=body("warn"),
    fx_html=f"""<g class="fx" stroke="{O}" stroke-width="1.3">
  <rect x="78" y="8" width="48" height="30" rx="6" fill="#FFF9C4" stroke="#F59E0B" stroke-width="1.4"/>
  <path d="M86,38 L82,50 L96,38 Z" fill="#FFF9C4" stroke="#F59E0B" stroke-width="1.2"/>
  <text x="102" y="29" font-size="17" text-anchor="middle"
        font-family="'Apple Color Emoji',sans-serif">⚠️</text>
</g>""")

# ── 9. default (경고): 경고 감지 → 포인팅 자세 ───────────────────────────────
SVGS["default"] = make_svg("경고: 경고감지→포인팅", css="""
.char{animation:defChar 2.4s ease-in-out infinite;transform-origin:60px 165px}
@keyframes defChar{
  0%,20%{transform:rotate(0)}
  35%,75%{transform:rotate(-7deg)}     /* 경고 확인 후 기울기 */
  100%{transform:rotate(0)}
}
/* 팔 R: 천천히 위로 들어올려짐 (포인팅) */
.armR{animation:defArmR 2.4s cubic-bezier(.2,.7,.3,1) infinite;transform-origin:79px 66px}
@keyframes defArmR{0%,18%{transform:rotate(0)}36%,78%{transform:rotate(-68deg)}100%{transform:rotate(0)}}
/* 경고 삼각형 펄스 */
.fx{animation:defFx 1.3s ease-in-out infinite;transform-origin:100px 22px}
@keyframes defFx{0%,100%{transform:scale(0.88)}50%{transform:scale(1.12)}}""",
    char_html=body("warn"),
    fx_html=f"""<g class="fx" style="transform-origin:100px 22px" stroke="{O}" stroke-width="1.4">
  <path d="M100,6 L118,36 L82,36 Z" fill="#FEF3C7" stroke="#F59E0B" stroke-width="1.6"/>
  <line x1="100" y1="14" x2="100" y2="25" stroke="#D97706" stroke-width="2.4" stroke-linecap="round"/>
  <circle cx="100" cy="30" r="2" fill="#D97706"/>
</g>""")

# ── 10. safe (안전/예방성공): 밝게 손 흔들기 ──────────────────────────────────
SVGS["safe"] = make_svg("안전: 예방성공→밝게손흔들기", css="""
.char{animation:safeHop 1.6s cubic-bezier(.2,.7,.3,1) infinite}
@keyframes safeHop{0%,100%{transform:translateY(0)}40%{transform:translateY(-6px)}}
/* 팔 R: 신나게 흔들기 */
.armR{animation:safeWave 0.8s ease-in-out infinite;transform-origin:79px 66px}
@keyframes safeWave{0%,100%{transform:rotate(-52deg)}50%{transform:rotate(-20deg)}}
.armL{animation:safeArmL 1.6s ease-in-out infinite;transform-origin:41px 66px}
@keyframes safeArmL{0%,100%{transform:rotate(8deg)}50%{transform:rotate(0)}}
.ponytail{animation:safePony 0.8s ease-in-out infinite;transform-origin:74px 24px}
@keyframes safePony{0%,100%{transform:rotate(-9deg)}50%{transform:rotate(8deg)}}
/* 체크 팝인 */
.fx{animation:safeFx 1.6s cubic-bezier(.2,.7,.3,1) infinite;transform-origin:100px 38px}
@keyframes safeFx{0%,100%{transform:scale(0.6);opacity:0}20%,70%{transform:scale(1);opacity:1}}""",
    char_html=body("safe"),
    fx_html=f"""<g class="fx" style="transform-origin:100px 38px" stroke="{O}" stroke-width="1.3">
  <circle cx="100" cy="38" r="17" fill="#D1FAE5" stroke="#10B981" stroke-width="1.6"/>
  <path d="M90,38 L97,46 L112,28" fill="none" stroke="#10B981" stroke-width="2.8"
        stroke-linecap="round" stroke-linejoin="round"/>
  <line x1="84" y1="19" x2="84" y2="12" stroke="#FCD34D" stroke-width="2"/>
  <line x1="80" y1="23" x2="74" y2="18" stroke="#FCD34D" stroke-width="2"/>
  <line x1="116" y1="21" x2="121" y2="16" stroke="#FCD34D" stroke-width="2"/>
  <line x1="119" y1="30" x2="125" y2="28" stroke="#FCD34D" stroke-width="2"/>
</g>""")


# ── 파일 저장 + preview.html ───────────────────────────────────────────────────
TITLES = {
    "fall": "낙상", "slip": "미끄러짐", "collision": "충돌",
    "property": "재물손상", "cut": "자상", "strain": "무리한동작",
    "health": "건강장해", "claim": "고객불만", "default": "경고", "safe": "안전",
}

for slug, svg_content in SVGS.items():
    p = OUT / f"{slug}.svg"
    p.write_text(svg_content, encoding="utf-8")
    print(f"✓ {slug}.svg  ({len(svg_content):,} bytes)")

# preview HTML
items = "\n".join(
    f'<div style="background:#2a2a2a;border-radius:10px;padding:16px;text-align:center">'
    f'<div style="font-size:12px;color:#aaa;margin-bottom:6px">{slug} · {TITLES[slug]}</div>'
    f'<img src="{slug}.svg" width="130" height="173"/></div>'
    for slug in SVGS
)
preview = f"""<!doctype html><html><head><meta charset="utf-8">
<title>SAGO 캐릭터 시나리오 프리뷰</title></head>
<body style="background:#111;margin:20px;font-family:sans-serif">
<h2 style="color:#eee;margin-bottom:16px">SAGO AI 시나리오 캐릭터 (스토리 애니메이션)</h2>
<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:12px;max-width:800px">
{items}
</div></body></html>"""
(OUT / "preview.html").write_text(preview, encoding="utf-8")
print(f"\n✓ preview.html 갱신 완료")
print(f"경로: {OUT}")

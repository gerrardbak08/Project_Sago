#!/usr/bin/env python3
"""
build_scenes.py — 위험유형별 실사 장면 이미지를 '고정 캐릭터'로 일관되게 생성·주석.

핵심: 등장 직원을 단일 상수 CHARACTER(여성 + 고정 다이소 유니폼)로 고정해, 전 장면의
성별·복장을 통일한다. 장면 정의(SCENES)는 한 곳에 모아 재현 가능하게 한다.

흐름(장면당): gen_scene(Pollinations flux, 순차) → annotate_scene(빨간 원 + 캡션)
  → images/scenes/{slug}.png

Pollinations는 IP당 1개 동시요청 제한이라 반드시 순차로 호출한다(병렬 금지).

사용:
  python3 scripts/build_scenes.py                 # 전체 재생성
  python3 scripts/build_scenes.py --only cut strain
  python3 scripts/build_scenes.py --provider gemini   # 결제 켜면 승급
"""

from __future__ import annotations

import argparse
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.gen_scene import PROVIDERS, _load_env
from scripts.annotate_scene import annotate
from scripts.animate_scene import animate

# ── 고정 캐릭터: 모든 장면 공통 (성별=여성, 복장=다이소 유니폼 고정) ──────────────
CHARACTER = (
    "a real Korean woman in her late 20s, retail store employee, "
    "natural Asian facial features, realistic human proportions, "
    "wearing a simple red work polo shirt, authentic human skin texture"
)

STYLE = (
    "ultra-realistic photograph, Canon EOS 5D, 50mm lens, natural workplace lighting, "
    "sharp focus on subject, anatomically correct human body, natural skin texture, "
    "real person not CGI, candid documentary style"
)

# ── 장면 정의: slug, 동작, 배경, 캡션, 빨간 원(cx,cy,r 비율; None=원 없음) ──────────
SCENES = [
    {"slug": "fall", "caption": "물기 있는 바닥에 미끄러져 낙상",
     "circle": (0.50, 0.65, 0.10),
     "action": (
         "slipping on a wet floor, her right foot sliding forward on water, "
         "body tilting backward, both arms thrown wide for balance, face showing surprise, "
         "motion blur on feet, yellow wet-floor sign visible in background"
     ),
     "setting": "inside a bright fluorescent-lit Korean variety store aisle, shelves of products on both sides, shiny linoleum floor"},
    {"slug": "slip", "caption": "통로에 둔 적재물에 걸려 넘어짐",
     "circle": (0.38, 0.75, 0.11),
     "action": (
         "tripping forward over a brown cardboard box left on the floor, "
         "leaning sharply forward, arms stretched out instinctively to catch herself, "
         "one foot still caught on the box edge"
     ),
     "setting": "in a Korean variety store back aisle, shelves and fluorescent overhead lights"},
    {"slug": "collision", "caption": "운반 카트로 모퉁이에서 충돌",
     "circle": (0.50, 0.58, 0.12),
     "action": (
         "pushing a metal flatbed cart loaded with stacked boxes around a blind aisle corner, "
         "her head turning in alarm as she realizes another person is around the corner, "
         "cart wheels leaving slight motion blur"
     ),
     "setting": "at a blind corner in a Korean retail stockroom, concrete floor, metal shelving"},
    {"slug": "cut", "caption": "박스 개봉 중 커터칼에 베임", "framing": "closeup",
     "circle": (0.50, 0.55, 0.13),
     "action": (
         "a pair of hands holding a yellow box cutter against a taped cardboard box, "
         "the blade angled dangerously toward the left index finger, "
         "finger visibly close to the sharp blade edge, "
         "realistic hand anatomy with natural skin, no gloves"
     ),
     "setting": "extreme close-up on hands and box cutter on a stockroom table, blurred background"},
    {"slug": "caught", "caption": "적재물 사이 손 끼임 위험",
     "circle": (0.52, 0.48, 0.11),
     "action": (
         "her left hand caught and squeezed between two heavy sliding cardboard boxes on a shelf, "
         "face turned in pain, other hand trying to push the boxes apart"
     ),
     "setting": "in a retail stockroom with metal shelving units full of boxes, dim lighting"},
    {"slug": "strain", "caption": "중량물 잘못 들어 허리 부상",
     "circle": (0.48, 0.50, 0.11),
     "action": (
         "bending at the waist with a dangerously curved spine to lift a heavy brown cardboard box from the floor, "
         "face showing strain and pain, right hand reaching back to her lower back"
     ),
     "setting": "in a warehouse storage aisle, concrete floor, tall shelving units loaded with boxes"},
    {"slug": "property", "caption": "상단 적재물 낙하·파손",
     "circle": (0.60, 0.28, 0.12),
     "action": (
         "looking up in alarm as a stack of products and boxes falls from a high shelf above her, "
         "items caught in mid-air falling, her arm raised instinctively to shield her head"
     ),
     "setting": "in a Korean retail store aisle, tall product shelves, items in motion blur"},
    {"slug": "claim", "caption": "고객 응대 중 클레임 발생", "circle": None,
     "action": (
         "standing behind a store service counter, listening with a composed expression "
         "while a middle-aged male customer in casual clothes leans over the counter gesturing animatedly"
     ),
     "setting": "at a Korean variety store service counter, product displays in background, natural store lighting"},
    {"slug": "health", "caption": "과로·건강 이상 징후 주의",
     "circle": (0.50, 0.45, 0.11),
     "action": (
         "pausing mid-aisle with her hand pressed flat against her chest, "
         "face visibly pale and fatigued, eyes half-closed, leaning slightly against a product shelf for support"
     ),
     "setting": "in a Korean retail store aisle, fluorescent lighting, shelves of colorful packaged goods"},
]


NEGATIVE = (
    "cartoon, anime, illustration, drawing, painting, CGI render, 3D model, "
    "unrealistic proportions, deformed hands, extra fingers, distorted face, "
    "blurry face, watermark, logo, text, words, plastic skin, mannequin, doll"
)


def _prompt(s: dict) -> str:
    if s.get("framing") == "closeup":
        return (
            f"{s['action']}, {s['setting']}. {STYLE}. "
            f"Negative: {NEGATIVE}."
        )
    return (
        f"Photorealistic workplace safety photo. {CHARACTER}. "
        f"{s['action']}, {s['setting']}. {STYLE}. "
        f"Negative: {NEGATIVE}."
    )


def build(only: list[str] | None, provider: str, model: str, seed: int) -> None:
    _load_env()
    os.environ["POLLINATIONS_MODEL"] = model
    gen = PROVIDERS[provider]
    targets = [s for s in SCENES if not only or s["slug"] in only]
    print(f"== 장면 생성 {len(targets)}종 (provider={provider}, model={model}, 순차) ==")
    for i, s in enumerate(targets, 1):
        prompt = _prompt(s)
        raw = f"/tmp/scene_{s['slug']}.png"
        data = None
        for attempt, sd in enumerate([seed, seed + 35, seed + 70]):
            try:
                data = gen(prompt, sd, 1024, 768)
                if len(data) >= 20000:
                    break
            except Exception as e:
                print(f"   [{s['slug']}] seed {sd} 실패: {str(e)[:90]} → 재시도")
                time.sleep(4)
        if not data or len(data) < 20000:
            print(f"   ❌ {s['slug']} 생성 실패 — 건너뜀(기존 유지)")
            continue
        Path(raw).write_bytes(data)
        annotate(raw, str(ROOT / "images" / "scenes" / f"{s['slug']}.png"), s["caption"], s.get("circle"))
        print(f"   [{i}/{len(targets)}] ✅ {s['slug']} → images/scenes/{s['slug']}.png")
        time.sleep(2)  # IP당 1 동시요청 제한 존중
    print("== 완료 ==")


def build_gifs(only: list[str] | None) -> None:
    """기존 raw(/tmp/scene_{slug}.png)에서 애니 GIF 생성(로컬·무료). 네트워크 불필요."""
    targets = [s for s in SCENES if not only or s["slug"] in only]
    print(f"== 애니 GIF {len(targets)}종 생성 ==")
    for s in targets:
        raw = Path(f"/tmp/scene_{s['slug']}.png")
        if not raw.exists():
            print(f"   ⚠️ raw 없음 {s['slug']} (build_scenes로 먼저 생성) → 건너뜀")
            continue
        out = ROOT / "images" / "scenes" / "anim" / f"{s['slug']}.gif"
        animate(str(raw), str(out), s["caption"], s.get("circle"),
                out_w=480, out_h=360, frames=18)
        print(f"   ✅ {s['slug']}.gif ({out.stat().st_size // 1024} KB)")
    print("== 완료 ==")


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", nargs="*", help="특정 slug만")
    ap.add_argument("--provider", default="pollinations", choices=list(PROVIDERS))
    ap.add_argument("--model", default="flux", help="pollinations 모델(flux 권장; flux-realism은 유료가능)")
    ap.add_argument("--seed", type=int, default=29)
    ap.add_argument("--gif", action="store_true", help="생성 없이 기존 raw로 애니 GIF만 제작")
    a = ap.parse_args()
    if a.gif:
        build_gifs(a.only)
    else:
        build(a.only, a.provider, a.model, a.seed)
    return 0


if __name__ == "__main__":
    sys.exit(main())

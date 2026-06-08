#!/usr/bin/env python3
"""
make_category_images_ai.py — OpenAI DALL-E 3 로 카테고리별 안전 일러스트 생성.

scripts/make_category_images.py (PIL 경고 표지판)의 업그레이드 버전.
core/safety_visuals.CATEGORIES 10종에 대해 사실적·일관된 안전 일러스트 1장씩 생성한다.

출력: images/categories/{slug}.png  (800×400, KakaoTalk 피드 권장 2:1)
의존: openai · Pillow · python-dotenv (선택)
키:   .env 의 OPENAI_API_KEY

사용:
  pip install openai Pillow python-dotenv
  python3 scripts/make_category_images_ai.py
"""
from __future__ import annotations

import io
import os
import sys
from pathlib import Path
from urllib.request import urlopen

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# 간단 .env 로더 (python-dotenv 없어도 동작)
ENV_PATH = ROOT / ".env"
if ENV_PATH.exists():
    for raw in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

try:
    from openai import OpenAI
except ImportError:
    sys.exit("openai 패키지가 필요합니다 — pip install openai")
try:
    from PIL import Image
except ImportError:
    sys.exit("Pillow 패키지가 필요합니다 — pip install Pillow")

from core.safety_visuals import CATEGORIES  # noqa: E402

OUT_DIR = ROOT / "images" / "categories"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# 카테고리 전반에 적용할 공통 스타일 — 세트의 일관성을 보장한다.
STYLE = (
    "Clean modern flat illustration, consistent across the set, Korean variety-store / convenience-retail context, "
    "soft neutral background with one bright safety-color accent (warning yellow or alert red) on the hazard element, "
    "central composition readable in a small wide thumbnail, professional safety-training graphic tone — "
    "not cartoony, not photorealistic. STRICT: do not include any letters, text, words, or logos anywhere in the image."
)

# 카테고리별 장면 묘사 (text 없이, 핵심 위험 행위/물체에 집중)
SCENES = {
    "fall": (
        "A store worker shown at the instant of slipping on a freshly-mopped wet aisle floor; "
        "a yellow A-frame caution stand is visible nearby; motion lines convey loss of balance"
    ),
    "slip": (
        "A store back-aisle with scattered cardboard boxes on the floor; a worker tripping forward over a box, "
        "hands out, off-balance"
    ),
    "collision": (
        "Two workers in a narrow store aisle about to collide while turning a corner; one carries a tall stack of boxes blocking forward view; "
        "the moment captured just before impact"
    ),
    "cut": (
        "A bare hand using a box cutter that is slipping off a cardboard box; the exposed blade is highlighted with a red warning glow; "
        "the fingers are pulled back at the last moment"
    ),
    "caught": (
        "A worker's hand near a closing roller-shutter / sliding stockroom door; a clear pinch-hazard visual; "
        "the hand is being withdrawn just in time"
    ),
    "strain": (
        "A worker lifting an oversized heavy cardboard box with poor bent-over posture; a soft red highlight on the lower back area indicates strain"
    ),
    "property": (
        "A tall stack of product boxes on a store shelf toppling forward; several items captured mid-fall; a person stepping back"
    ),
    "claim": (
        "A customer standing at a store counter looking visibly concerned and gesturing; a staff member behind the counter listening calmly; "
        "respectful, de-escalating tone — no aggression"
    ),
    "health": (
        "A store worker pressing a hand to their chest, looking unwell and leaning against a shelf for support; "
        "a subtle medical concern overlay — a soft pulse-line indicator nearby"
    ),
    "default": (
        "A clean, generic safety reminder scene in a Korean store environment — a hazard triangle warning symbol prominently centered on a tidy aisle"
    ),
}


def generate_one(client: "OpenAI", cat: dict) -> None:
    slug = cat["slug"]
    name = cat["name"]
    scene = SCENES.get(slug, SCENES["default"])
    prompt = f"{STYLE} Scene: {scene}."
    print(f"  · {slug:12s} ({name}) — 요청 중 ...", flush=True)
    resp = client.images.generate(
        model="dall-e-3",
        prompt=prompt,
        size="1792x1024",
        quality="standard",
        n=1,
    )
    data0 = resp.data[0]
    # dall-e-3 기본 응답: url. (b64_json 도 옵션)
    img_bytes: bytes
    if getattr(data0, "url", None):
        img_bytes = urlopen(data0.url, timeout=60).read()
    else:
        import base64
        img_bytes = base64.b64decode(data0.b64_json)
    im = Image.open(io.BytesIO(img_bytes)).convert("RGB")
    # 1792×1024(≈7:4) → 800×400(2:1) : 폭 기준 축소 → 위·아래 가운데 크롭
    new_w = 800
    new_h = round(im.height * new_w / im.width)
    im = im.resize((new_w, new_h), Image.LANCZOS)
    top = max(0, (new_h - 400) // 2)
    im = im.crop((0, top, new_w, top + 400))
    out_path = OUT_DIR / f"{slug}.png"
    im.save(out_path, optimize=True)
    print(f"    ✓ {out_path.relative_to(ROOT)} ({out_path.stat().st_size // 1024} KB)")


def main() -> None:
    if not os.environ.get("OPENAI_API_KEY"):
        sys.exit("OPENAI_API_KEY 가 환경에 없습니다 — .env 또는 셸에 설정하세요.")
    client = OpenAI()
    print(f"카테고리 {len(CATEGORIES)}개 → dall-e-3 1792×1024 standard → 800×400 PNG")
    failures: list[tuple[str, str]] = []
    for cat in CATEGORIES:
        try:
            generate_one(client, cat)
        except Exception as e:  # noqa: BLE001
            print(f"    ✗ {cat['slug']} 실패: {e}")
            failures.append((cat["slug"], str(e)))
    print()
    if failures:
        print(f"완료 — 실패 {len(failures)}/{len(CATEGORIES)}:")
        for s, msg in failures:
            print(f"  · {s}: {msg}")
    else:
        print(f"✅ 완료 — {len(CATEGORIES)}장 생성됨")
    print(f"   경로: images/categories/")


if __name__ == "__main__":
    main()

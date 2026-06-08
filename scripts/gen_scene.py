#!/usr/bin/env python3
"""
gen_scene.py — 실사 장면 이미지 1장 생성 (provider 교체식)

provider:
  pollinations — 무료·키 불필요 (기본)
  gemini       — GEMINI_API_KEY (이미지 모델은 유료 티어 필요할 수 있음)
  openai       — OPENAI_API_KEY (gpt-image, 결제 필요)

같은 인터페이스라, 결제를 켜면 --provider 만 바꿔 품질을 승급한다.
출력: --out 또는 /tmp/{slug}_{seed}.png

사용:
  python3 scripts/gen_scene.py --slug fall --seed 42 --prompt "Photorealistic ... store ..."
  python3 scripts/gen_scene.py --slug fall --seed 42 --prompt "..." --provider gemini
"""

from __future__ import annotations

import argparse
import base64
import os
import sys
import urllib.parse
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def _load_env() -> None:
    env = ROOT / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))


def gen_pollinations(prompt: str, seed: int, w: int, h: int) -> bytes:
    import time
    import requests
    model = os.environ.get("POLLINATIONS_MODEL", "flux")
    enhance = os.environ.get("POLLINATIONS_ENHANCE", "true").lower() != "false"
    url = ("https://image.pollinations.ai/prompt/" + urllib.parse.quote(prompt)
           + f"?width={w}&height={h}&nologo=true&model={model}&seed={seed}"
           + ("&enhance=true" if enhance else ""))
    for attempt in range(3):
        r = requests.get(url, timeout=240)
        if r.status_code == 402:
            body = ""
            try:
                body = r.json().get("error", "")
            except Exception:
                pass
            if "Queue full" in body:
                wait = 60 * (attempt + 1)
                print(f"   IP 큐 포화 — {wait}s 대기 후 재시도 (attempt {attempt + 1}/3)")
                time.sleep(wait)
                continue
            r.raise_for_status()
        r.raise_for_status()
        if not r.headers.get("Content-Type", "").startswith("image"):
            raise RuntimeError(f"non-image response: {r.headers.get('Content-Type')}")
        return r.content
    raise RuntimeError("Pollinations: 3회 재시도 후 실패 (IP 큐 포화). 로컬에서 실행하세요.")


def gen_gemini(prompt: str, seed: int, w: int, h: int) -> bytes:
    import requests
    key = os.environ["GEMINI_API_KEY"]
    url = ("https://generativelanguage.googleapis.com/v1beta/models/"
           f"gemini-2.5-flash-image:generateContent?key={key}")
    r = requests.post(url, json={"contents": [{"parts": [{"text": prompt}]}]}, timeout=180)
    r.raise_for_status()
    parts = r.json()["candidates"][0]["content"]["parts"]
    b64 = next(p["inlineData"]["data"] for p in parts if "inlineData" in p)
    return base64.b64decode(b64)


def gen_openai(prompt: str, seed: int, w: int, h: int) -> bytes:
    import requests
    key = os.environ["OPENAI_API_KEY"]
    r = requests.post(
        "https://api.openai.com/v1/images/generations",
        headers={"Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        json={"model": "gpt-image-1", "prompt": prompt, "n": 1, "size": "1024x1024"},
        timeout=180,
    )
    r.raise_for_status()
    return base64.b64decode(r.json()["data"][0]["b64_json"])


PROVIDERS = {"pollinations": gen_pollinations, "gemini": gen_gemini, "openai": gen_openai}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--slug", required=True)
    ap.add_argument("--prompt", required=True)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--provider", default="pollinations", choices=list(PROVIDERS))
    ap.add_argument("--width", type=int, default=1024)
    ap.add_argument("--height", type=int, default=768)
    ap.add_argument("--out")
    a = ap.parse_args()
    _load_env()
    data = PROVIDERS[a.provider](a.prompt, a.seed, a.width, a.height)
    if len(data) < 5000:
        raise SystemExit(f"생성 실패(too small: {len(data)} bytes)")
    out = a.out or f"/tmp/{a.slug}_{a.seed}.png"
    Path(out).write_bytes(data)
    print(out, len(data), "bytes")
    return 0


if __name__ == "__main__":
    sys.exit(main())

#!/usr/bin/env python3
"""
make_safety_video.py — SAGO AI 사고예방 안전 영상 자동 생성 PoC

기존 다이소 안전보건팀 영상 대본 구조 레퍼런스:
  ① 인트로    (3s)  브랜드 배경 + "오늘의 안전 수칙" + 매장명
  ② 위험제시  (5s)  위험유형 캐릭터 + 유형명 + 예방 키워드
  ③ 수칙 ×3  (7s×3) 수칙 번호 + 텍스트 + 캐릭터 우하단
  ④ 아웃트로  (2s)  "오늘도 안전한 하루 되세요"
  ⑤ TTS      AWS Polly Seoyeon (neural) 전체 나레이션

사용법:
  python scripts/make_safety_video.py --slug fall --store "강남점"
  python scripts/make_safety_video.py --slug slip --guide /tmp/guide.json --no-tts
  python scripts/make_safety_video.py --slug cut --out /tmp/out.mp4
"""
from __future__ import annotations

import argparse, json, os, subprocess, sys, tempfile, textwrap
from pathlib import Path
from typing import Optional

# PIL
try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:
    sys.exit("Pillow 필요: pip install Pillow")

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
from core.safety_visuals import category_by_slug, category_for

# ── 상수 ────────────────────────────────────────────────────────────────────
W, H   = 1080, 1080
FPS    = 30
BRAND_RED = (215, 0, 17)   # #D70011
WHITE     = (255, 255, 255)
DARK      = (26, 26, 46)
LIGHT_BG  = (245, 245, 247)

DUR = {
    "intro":   3,
    "warning": 5,
    "tip":     7,
    "outro":   2,
}

FONT_PATH = "/System/Library/Fonts/AppleSDGothicNeo.ttc"
FONT_BOLD_IDX = 0   # TTC index (Heavy)
FONT_REG_IDX  = 5   # TTC index (Regular)

# ── 폰트 헬퍼 ───────────────────────────────────────────────────────────────

def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    idx = FONT_BOLD_IDX if bold else FONT_REG_IDX
    return ImageFont.truetype(FONT_PATH, size, index=idx)


def _wrap(text: str, width: int = 18) -> list[str]:
    return textwrap.wrap(text, width) or [text]


def _text_block(draw: ImageDraw.ImageDraw, lines: list[str], font: ImageFont.FreeTypeFont,
                fill, x: int, y: int, align: str = "left", line_gap: int = 10) -> int:
    cy = y
    for line in lines:
        bbox = draw.textbbox((0, 0), line, font=font)
        lw = bbox[2] - bbox[0]
        if align == "center":
            lx = (W - lw) // 2
        elif align == "right":
            lx = W - lw - x
        else:
            lx = x
        draw.text((lx, cy), line, font=font, fill=fill)
        cy += (bbox[3] - bbox[1]) + line_gap
    return cy


# ── 장면 렌더러 ─────────────────────────────────────────────────────────────

def _char_img(slug: str) -> Optional[Image.Image]:
    p = ROOT / "scripts/character/out/scenarios" / f"{slug}.webp"
    if not p.exists():
        p = ROOT / "scripts/character/out/scenarios/default.webp"
    if p.exists():
        return Image.open(p).convert("RGBA")
    return None


def _paste_char(bg: Image.Image, char: Optional[Image.Image],
                scale: float = 0.45, anchor: str = "bottom-center") -> None:
    if char is None:
        return
    new_w = int(W * scale)
    ratio = new_w / char.width
    new_h = int(char.height * ratio)
    ch = char.resize((new_w, new_h), Image.LANCZOS)
    if anchor == "bottom-center":
        x = (W - new_w) // 2
        y = H - new_h - 40
    elif anchor == "bottom-right":
        x = W - new_w - 30
        y = H - new_h - 30
    else:
        x, y = 40, H - new_h - 30
    bg.paste(ch, (x, y), ch)


def render_intro(store: str) -> Image.Image:
    img = Image.new("RGB", (W, H), BRAND_RED)
    draw = ImageDraw.Draw(img)

    # 상단 장식 띠
    draw.rectangle([0, 0, W, 12], fill=(180, 0, 10))

    # 메인 타이틀
    f_big = _font(88, bold=True)
    _text_block(draw, ["오늘의", "안전 수칙"], f_big, WHITE, 0, H // 2 - 130, align="center", line_gap=12)

    # 매장명
    if store:
        f_sm = _font(38)
        _text_block(draw, [store], f_sm, (255, 200, 200), 0, H // 2 + 90, align="center")

    # 하단 로고 영역
    draw.rectangle([0, H - 80, W, H], fill=(160, 0, 12))
    f_logo = _font(30)
    _text_block(draw, ["아성다이소 안전보건팀"], f_logo, (255, 220, 220), 0, H - 55, align="center")

    return img


def render_warning(cat: dict, slug: str) -> Image.Image:
    r, g, b = cat["color"]
    bg_color = (r, g, b)
    img = Image.new("RGB", (W, H), bg_color)
    draw = ImageDraw.Draw(img)

    # 위험유형명
    f_title = _font(78, bold=True)
    lines = _wrap(cat["name"], 10)
    _text_block(draw, lines, f_title, WHITE, 0, 70, align="center", line_gap=10)

    # 예방 키워드
    f_sub = _font(36)
    sub_lines = _wrap(cat["keyword"], 22)
    _text_block(draw, sub_lines, f_sub, (255, 255, 255, 200), 0, 200, align="center", line_gap=8)

    # 캐릭터
    char = _char_img(slug)
    _paste_char(img, char, scale=0.52, anchor="bottom-center")

    return img


def render_tip(idx: int, tip: str, cat: dict, slug: str) -> Image.Image:
    img = Image.new("RGB", (W, H), LIGHT_BG)
    draw = ImageDraw.Draw(img)

    # 상단 컬러 바
    r, g, b = cat["color"]
    draw.rectangle([0, 0, W, 14], fill=(r, g, b))

    # 수칙 번호
    f_num = _font(44, bold=True)
    num_text = f"수칙 {idx + 1}"
    draw.text((60, 60), num_text, font=f_num, fill=(r, g, b))

    # 수칙 텍스트
    f_body = _font(46, bold=True)
    lines = _wrap(tip, 17)
    _text_block(draw, lines, f_body, DARK, 60, 140, line_gap=16)

    # 캐릭터 (우하단)
    char = _char_img(slug)
    _paste_char(img, char, scale=0.40, anchor="bottom-right")

    # 하단 로고
    draw.rectangle([0, H - 64, W, H], fill=(r, g, b))
    f_logo = _font(26)
    _text_block(draw, ["아성다이소 안전보건팀"], f_logo, WHITE, 0, H - 48, align="center")

    return img


def render_outro() -> Image.Image:
    img = Image.new("RGB", (W, H), BRAND_RED)
    draw = ImageDraw.Draw(img)

    # 상하단 장식
    draw.rectangle([0, 0, W, 12], fill=(180, 0, 10))
    draw.rectangle([0, H - 12, W, H], fill=(180, 0, 10))

    f_big = _font(68, bold=True)
    _text_block(draw, ["오늘도", "안전한 하루", "되세요 🙏"], f_big, WHITE, 0, H // 2 - 130, align="center", line_gap=16)

    return img


# ── 페이드 헬퍼 ─────────────────────────────────────────────────────────────

def _apply_fade(img: Image.Image, duration: int, fade_in: float = 0.5, fade_out: float = 0.4) -> list[Image.Image]:
    """장면 이미지 → 페이드 프레임 리스트 반환."""
    total = duration * FPS
    frames = []
    for i in range(total):
        t = i / FPS
        alpha = 1.0
        if t < fade_in:
            alpha = t / fade_in
        elif t > duration - fade_out:
            alpha = (duration - t) / fade_out
        alpha = max(0.0, min(1.0, alpha))

        frame = img.copy().convert("RGBA")
        black = Image.new("RGBA", (W, H), (0, 0, 0, int((1 - alpha) * 255)))
        frame = Image.alpha_composite(frame, black).convert("RGB")
        frames.append(frame)
    return frames


# ── TTS ─────────────────────────────────────────────────────────────────────

def _polly_tts(text: str, out_path: str, voice: str = "Seoyeon") -> None:
    import boto3
    client = boto3.client(
        "polly",
        region_name=os.environ.get("AWS_DEFAULT_REGION", "ap-northeast-2"),
    )
    resp = client.synthesize_speech(
        Text=text,
        OutputFormat="mp3",
        VoiceId=voice,
        LanguageCode="ko-KR",
        Engine="neural",
    )
    with open(out_path, "wb") as f:
        f.write(resp["AudioStream"].read())


def _build_narration(cat: dict, tips: list[str], store: str) -> str:
    intro = f"{'안녕하세요. ' + store + ' ' if store else '안녕하세요. '}오늘의 안전 수칙을 알려드립니다."
    warning = f"{cat['name']} 위험에 주의하세요. {cat['keyword']}."
    tip_texts = " ".join(f"수칙 {i+1}. {t}" for i, t in enumerate(tips))
    outro = "오늘도 안전한 하루 되세요."
    return " ".join([intro, warning, tip_texts, outro])


# ── 비디오 조립 ─────────────────────────────────────────────────────────────

def _frames_to_video(frames: list[Image.Image], out_path: str, audio_path: Optional[str]) -> None:
    """Pillow 프레임 리스트 → mp4 (FFmpeg stdin pipe)."""
    has_audio = audio_path and Path(audio_path).exists()

    cmd = [
        "ffmpeg", "-y",
        "-f", "rawvideo",
        "-vcodec", "rawvideo",
        "-s", f"{W}x{H}",
        "-pix_fmt", "rgb24",
        "-r", str(FPS),
        "-i", "pipe:0",
    ]
    if has_audio:
        cmd += ["-i", audio_path, "-shortest"]
    cmd += [
        "-c:v", "libx264", "-preset", "fast", "-crf", "22",
        "-pix_fmt", "yuv420p",
    ]
    if has_audio:
        cmd += ["-c:a", "aac", "-b:a", "128k"]
    cmd.append(out_path)

    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.PIPE)
    for frame in frames:
        proc.stdin.write(frame.tobytes())
    proc.stdin.close()
    _, stderr = proc.communicate()
    if proc.returncode != 0:
        print("[ffmpeg stderr]", stderr.decode()[-2000:])
        raise RuntimeError("FFmpeg 실패")


# ── 메인 파이프라인 ──────────────────────────────────────────────────────────

def build_video(
    slug: str,
    tips: list[str],
    store: str = "",
    out_path: str = "",
    use_tts: bool = True,
    voice: str = "Seoyeon",
) -> str:
    cat = category_by_slug(slug)
    tips = tips[:3]
    out_path = out_path or f"/tmp/safety_video_{slug}.mp4"

    print(f"[SAGO 영상] slug={slug} | {cat['name']} | {len(tips)}개 수칙 | {out_path}")

    # ── 장면 렌더링 ──────────────────────────────────────────────────────────
    scenes: list[tuple[Image.Image, int]] = [
        (render_intro(store), DUR["intro"]),
        (render_warning(cat, slug), DUR["warning"]),
        *[(render_tip(i, t, cat, slug), DUR["tip"]) for i, t in enumerate(tips)],
        (render_outro(), DUR["outro"]),
    ]

    # 페이드 적용 후 전체 프레임 병합
    all_frames: list[Image.Image] = []
    for img, dur in scenes:
        all_frames.extend(_apply_fade(img, dur))

    total_sec = sum(d for _, d in scenes)
    print(f"  총 {total_sec}초 / {len(all_frames)} 프레임 렌더링 완료")

    # ── TTS ──────────────────────────────────────────────────────────────────
    with tempfile.TemporaryDirectory() as tmp:
        audio_path: Optional[str] = None
        if use_tts:
            tts_path = f"{tmp}/tts.mp3"
            narration = _build_narration(cat, tips, store)
            print(f"  TTS 나레이션({len(narration)}자): {narration[:60]}…")
            try:
                _polly_tts(narration, tts_path, voice)
                audio_path = tts_path
                print("  Polly TTS 생성 완료")
            except Exception as e:
                print(f"  [TTS 실패, 무음] {e}")

        # ── FFmpeg 조립 ───────────────────────────────────────────────────────
        _frames_to_video(all_frames, out_path, audio_path)

    print(f"[완료] {out_path}")
    return out_path


# ── CLI ─────────────────────────────────────────────────────────────────────

def main() -> None:
    ap = argparse.ArgumentParser(description="SAGO AI 사고예방 영상 자동 생성")
    ap.add_argument("--slug", default="fall",
                    help="위험유형 slug: fall/slip/cut/caught/strain/claim/health/property/collision")
    ap.add_argument("--guide", default="",
                    help="LLM 가이드 JSON 파일 경로 (없으면 더미 수칙 사용)")
    ap.add_argument("--store", default="", help="매장명 (예: 강남점)")
    ap.add_argument("--out", default="", help="출력 mp4 경로")
    ap.add_argument("--voice", default="Seoyeon", help="AWS Polly VoiceId (기본: Seoyeon)")
    ap.add_argument("--no-tts", action="store_true", help="TTS 없이 무음 영상 생성")
    args = ap.parse_args()

    tips: list[str] = []
    if args.guide:
        try:
            data = json.loads(Path(args.guide).read_text(encoding="utf-8"))
            raw = data.get("오늘의_수칙") or data.get("tips") or []
            tips = [r if isinstance(r, str) else r.get("text", str(r)) for r in raw][:3]
        except Exception as e:
            print(f"[가이드 JSON 로드 실패] {e}")

    if not tips:
        cat = category_by_slug(args.slug)
        tips = [
            cat["keyword"],
            "작업 전 주변 안전 상태를 반드시 확인하세요",
            "이상 발견 즉시 관리자에게 보고하세요",
        ]
        print(f"[더미 수칙 적용] {tips[0][:30]}…")

    build_video(
        slug=args.slug,
        tips=tips,
        store=args.store,
        out_path=args.out,
        use_tts=not args.no_tts,
        voice=args.voice,
    )


if __name__ == "__main__":
    main()

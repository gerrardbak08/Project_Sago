"""
사고유형별 안전 일러스트(이미지)를 Bedrock Nova Canvas 로 사전 생성한다.

사용:
    python scripts/generate_safety_media.py                # 모든 누락분만 생성
    python scripts/generate_safety_media.py --force        # 전체 재생성
    python scripts/generate_safety_media.py --only emp:베임 # 특정 항목만
    python scripts/generate_safety_media.py --dry-run      # 호출 없이 대상만 출력

출력:
    로컬: media/{source}/{accident_type}/image.png
    S3:   s3://{MODELS_BUCKET}/media/{source}/{accident_type}/image.png  (옵션)

환경변수:
    MODELS_BUCKET     : S3 업로드 대상 (미설정 시 로컬만)
    BEDROCK_REGION    : 기본 us-east-1
    NOVA_CANVAS_MODEL : 기본 amazon.nova-canvas-v1:0

영상 (Nova Reel) 은 async job 폴링이 필요하므로 본 스크립트에서는 stub.
TODO(media-video): scripts/generate_safety_video.py 별도 구현.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from scripts.media_prompts import TARGETS, get_prompt
from core.media import slug

PROJECT_ROOT = Path(__file__).resolve().parent.parent
LOCAL_MEDIA_DIR = PROJECT_ROOT / "media"


def _local_path(source: str, accident_type: str) -> Path:
    return LOCAL_MEDIA_DIR / source / slug(accident_type) / "image.png"


def _s3_key(source: str, accident_type: str) -> str:
    return f"media/{source}/{slug(accident_type)}/image.png"


def _invoke_nova_canvas(prompt: str, model_id: str, region: str) -> bytes:
    """Nova Canvas 호출 → PNG 바이트 반환."""
    import boto3
    client = boto3.client("bedrock-runtime", region_name=region)
    payload = {
        "taskType": "TEXT_IMAGE",
        "textToImageParams": {"text": prompt},
        "imageGenerationConfig": {
            "numberOfImages": 1,
            "height": 1024,
            "width": 1024,
            "cfgScale": 7.0,
            "seed": 42,
            "quality": "standard",
        },
    }
    resp = client.invoke_model(
        modelId=model_id,
        body=json.dumps(payload).encode("utf-8"),
        contentType="application/json",
        accept="application/json",
    )
    body = json.loads(resp["body"].read())
    images = body.get("images") or []
    if not images:
        raise RuntimeError(f"Nova Canvas 응답에 이미지 없음: {body}")
    return base64.b64decode(images[0])


def _upload_to_s3(bucket: str, key: str, data: bytes) -> str:
    import boto3
    s3 = boto3.client("s3")
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType="image/png",
        CacheControl="public, max-age=86400",
    )
    return f"s3://{bucket}/{key}"


def _parse_only(only: list[str]) -> set[tuple[str, str]]:
    """--only emp:베임,cust:낙상 형태 파싱."""
    out: set[tuple[str, str]] = set()
    for s in only:
        for item in s.split(","):
            item = item.strip()
            if ":" not in item:
                raise SystemExit(f"--only 형식 오류 (source:type): {item}")
            src, typ = item.split(":", 1)
            out.add((src.strip(), typ.strip()))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--force", action="store_true", help="기존 파일 무시하고 재생성")
    ap.add_argument("--only", nargs="*", default=[], help="source:type 쉼표/공백 구분")
    ap.add_argument("--dry-run", action="store_true", help="대상만 출력")
    ap.add_argument("--no-s3", action="store_true", help="S3 업로드 생략")
    args = ap.parse_args()

    only = _parse_only(args.only) if args.only else None
    targets = [t for t in TARGETS if (only is None or t in only)]
    if not targets:
        print("대상 없음. --only 인자를 확인하세요.")
        return

    region = os.environ.get("BEDROCK_REGION", "us-east-1")
    model_id = os.environ.get("NOVA_CANVAS_MODEL", "amazon.nova-canvas-v1:0")
    bucket = os.environ.get("MODELS_BUCKET", "")

    print(f"[media] region={region} model={model_id} bucket={bucket or '(local-only)'}")
    print(f"[media] 대상 {len(targets)}건")

    created = 0
    skipped = 0
    failed = 0
    for source, accident_type in targets:
        local = _local_path(source, accident_type)
        if local.exists() and not args.force:
            print(f"  - skip (exists): {source}/{accident_type}")
            skipped += 1
            continue

        prompt = get_prompt(source, accident_type)
        if not prompt:
            print(f"  ! 프롬프트 미정의: {source}/{accident_type}")
            failed += 1
            continue

        if args.dry_run:
            print(f"  ~ dry-run: {source}/{accident_type}")
            continue

        try:
            png = _invoke_nova_canvas(prompt, model_id, region)
        except Exception as e:
            print(f"  ! Nova Canvas 실패 ({source}/{accident_type}): {e}")
            failed += 1
            continue

        local.parent.mkdir(parents=True, exist_ok=True)
        if local.exists() and args.force:
            backup = local.with_suffix(".bak.png")
            local.replace(backup)
            print(f"  ~ 기존 파일 백업: {backup.relative_to(PROJECT_ROOT)}")
        local.write_bytes(png)
        print(f"  + 로컬 저장: {local.relative_to(PROJECT_ROOT)}")

        if bucket and not args.no_s3:
            try:
                uri = _upload_to_s3(bucket, _s3_key(source, accident_type), png)
                print(f"    → {uri}")
            except Exception as e:
                print(f"    ! S3 업로드 실패: {e}")

        created += 1

    print(f"\n[media] 완료 — 생성 {created}, 스킵 {skipped}, 실패 {failed}")


if __name__ == "__main__":
    main()

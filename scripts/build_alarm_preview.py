#!/usr/bin/env python3
"""
build_alarm_preview.py — 카카오 알람 카드 미리보기 HTML.

core.notifier.KakaoNotifier.build_template 가 만드는 피드 템플릿(JSON)을
실제 카카오톡 카드처럼 보이도록 HTML 로 렌더링한다.
액세스 토큰 없이도 작동하도록 로컬 이미지(images/scenes/{slug}.png)를 우선 사용.

사용:
  python3 scripts/build_alarm_preview.py                                # 가장 최근 alert
  python3 scripts/build_alarm_preview.py --alert alerts/2026-05-04/10931_1777894739.json
출력: scripts/out/alarm-preview.html
"""
from __future__ import annotations

import argparse
import base64
import glob
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

# .env 로드 (단순 파서)
ENV = ROOT / ".env"
if ENV.exists():
    import os
    for raw in ENV.read_text(encoding="utf-8").splitlines():
        line = raw.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k, v = k.strip(), v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v

from core.notifier import KakaoNotifier  # noqa: E402
from core.safety_visuals import category_for  # noqa: E402


def _slug_for(dominant: str) -> str:
    # notifier가 카드 이미지를 고를 때 쓰는 것과 동일한 매칭 — 미리보기/실제 일치 보장
    return category_for(dominant)["slug"]


def _local_image_data_uri(slug: str) -> str:
    # HERO_STYLE=pictogram → 경고표지 우선, 기본(photo) → 실사 우선 (notifier와 동일)
    order = ("categories", "scenes") if os.environ.get("HERO_STYLE", "photo").lower() == "pictogram" else ("scenes", "categories")
    for sub in order:
        p = ROOT / "images" / sub / f"{slug}.png"
        if p.exists():
            b64 = base64.b64encode(p.read_bytes()).decode("ascii")
            return f"data:image/png;base64,{b64}"
    return ""


def _latest_alert() -> Path | None:
    # index.json 은 목록 파일이므로 제외 — 개별 매장 alert 만 대상
    matches = sorted(
        p for p in glob.glob(str(ROOT / "alerts" / "*" / "*.json"))
        if Path(p).name != "index.json"
    )
    return Path(matches[-1]) if matches else None


HTML = """<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>카카오 알람 카드 미리보기 — {store_name}</title>
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.css" />
<style>
  :root {{
    --kakao-bg:#b2c7d9; --me-bubble:#fef01b; --card-bg:#ffffff;
    --card-border:#e5e7eb; --text:#1a1a1a; --text-sub:#6b7280;
    --btn-bg:#f4f5f7; --btn-border:#e5e7eb; --link:#2563eb;
  }}
  html,body{{margin:0;padding:0;background:var(--kakao-bg);font-family:'Pretendard Variable',Pretendard,-apple-system,system-ui,sans-serif;color:var(--text);-webkit-font-smoothing:antialiased;}}
  .wrap{{max-width:420px;margin:0 auto;min-height:100vh;background:var(--kakao-bg);padding:24px 16px 80px;box-sizing:border-box;}}
  .meta{{font-size:12px;color:#374151;background:#fff;border-radius:10px;padding:10px 12px;margin-bottom:14px;line-height:1.55;}}
  .meta b{{color:#111;}}
  .chat-time{{text-align:center;font-size:11px;color:#54677a;margin:8px 0 14px;}}
  .row{{display:flex;gap:8px;align-items:flex-end;margin-bottom:6px;}}
  .row.me{{flex-direction:row-reverse;}}
  .avatar{{width:36px;height:36px;border-radius:14px;background:#D70011;color:#fff;display:flex;align-items:center;justify-content:center;font-size:11px;font-weight:700;flex-shrink:0;}}
  .sender{{font-size:11.5px;color:#1f2937;margin:0 6px 3px;}}
  .bubble{{max-width:300px;}}
  /* 카카오 피드 카드 */
  .card{{background:var(--card-bg);border:1px solid var(--card-border);border-radius:16px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.04);}}
  .card-img{{width:100%;aspect-ratio:2/1;background:#f3f4f6;object-fit:cover;display:block;}}
  .card-img.empty{{display:flex;align-items:center;justify-content:center;color:#9ca3af;font-size:12px;}}
  .card-body{{padding:14px 14px 12px;}}
  .card-title{{font-size:15px;font-weight:700;line-height:1.35;letter-spacing:-0.01em;color:#111;}}
  .card-desc{{margin-top:6px;font-size:13px;color:var(--text-sub);line-height:1.5;letter-spacing:-0.005em;display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden;}}
  .card-link{{margin-top:8px;font-size:11px;color:#9ca3af;}}
  .card-btn{{border-top:1px solid var(--btn-border);background:var(--btn-bg);padding:11px;text-align:center;font-size:13px;font-weight:600;color:#1f2937;cursor:pointer;}}
  .card-btn:hover{{background:#eceff3;}}
  /* 카드 두 장 나란히 보여주기 (cust/emp 모두 있을 때) */
  .stack{{display:flex;flex-direction:column;gap:18px;}}
  .label{{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#374151;background:#fff;border-radius:6px;padding:3px 7px;display:inline-block;margin-bottom:6px;}}
  .footer{{text-align:center;font-size:11px;color:#374151;margin-top:24px;line-height:1.6;}}
  .footer code{{background:rgba(255,255,255,0.6);padding:1px 5px;border-radius:4px;font-size:10.5px;}}
</style>
</head>
<body>
<div class="wrap">
  <div class="meta">
    <b>📩 카카오 알람 카드 미리보기</b><br/>
    매장 <b>{store_name}</b> ({store_code}) · 날짜 <b>{date_str}</b> · 소스 <b>{source}</b><br/>
    실제 카카오톡에서 받았을 때의 모양을 그대로 시뮬레이션합니다.
  </div>
  <div class="chat-time">— 오늘 오전 9:00 —</div>

  <div class="row me">
    <div class="avatar" style="background:#fde047;color:#111;">SAGO</div>
    <div class="bubble">
      <div class="sender" style="text-align:right;">SAGO 안전알리미</div>
      <div class="card">
        {image_block}
        <div class="card-body">
          <div class="card-title">{title}</div>
          <div class="card-desc">{description}</div>
          <div class="card-link">daiso-safety-v1-frontend.s3-website…</div>
        </div>
        <a class="card-btn" href="{link_url}" target="_blank" rel="noopener">{button_title}</a>
      </div>
    </div>
  </div>

  <div class="footer">
    템플릿 소스: <code>core.notifier.build_template()</code><br/>
    실제 발송 시 이미지는 카카오 CDN(<code>k.kakaocdn.net</code>)으로 업로드 후 사용됩니다.
  </div>
</div>
</body>
</html>
"""


def main() -> int:
    ap = argparse.ArgumentParser(description="카카오 알람 카드 HTML 미리보기")
    ap.add_argument("--alert", help="alert JSON 경로 (기본: 가장 최근)")
    ap.add_argument("--out", default=str(ROOT / "scripts" / "out" / "alarm-preview.html"))
    args = ap.parse_args()

    alert_path = Path(args.alert) if args.alert else _latest_alert()
    if not alert_path or not alert_path.exists():
        sys.exit(f"alert 파일을 찾지 못했습니다: {alert_path}")

    alert = json.loads(alert_path.read_text(encoding="utf-8"))
    store_code = str(alert.get("store_code", ""))
    store_name = alert.get("store_name", store_code)
    date_str = alert.get("date", "")
    results = alert.get("results", {})

    notifier = KakaoNotifier()
    template_str, source = notifier.build_template(store_name, date_str, store_code, results)
    template = json.loads(template_str)

    title = template["content"]["title"]
    description = template["content"]["description"]
    link_url = template["content"]["link"]["web_url"]
    button_title = template["buttons"][0]["title"]

    # 위험유형 추출 (제목 뒤 "· XX 주의" 패턴) → 로컬 이미지 매칭
    dominant = ""
    if "·" in title:
        seg = title.split("·", 1)[1]
        dominant = seg.replace("주의", "").strip()
    slug = _slug_for(dominant)
    data_uri = _local_image_data_uri(slug)
    if data_uri:
        image_block = f'<img class="card-img" src="{data_uri}" alt="{dominant or "안전 가이드"}" />'
    else:
        image_block = '<div class="card-img empty">이미지 준비 중</div>'

    html = HTML.format(
        store_name=store_name,
        store_code=store_code,
        date_str=date_str,
        source=source,
        title=title,
        description=description,
        link_url=link_url,
        button_title=button_title,
        image_block=image_block,
    )

    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html, encoding="utf-8")
    print(f"✅ {out.relative_to(ROOT)} ({out.stat().st_size // 1024} KB)")
    print(f"   미리보기: open {out}")
    print(f"   소스: {source} · 위험유형: {dominant or '(미지정)'} · 이미지: {slug}.png")
    return 0


if __name__ == "__main__":
    sys.exit(main())

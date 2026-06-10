#!/usr/bin/env python3
"""
build_guide_page.py — 수신자용 모바일 안전가이드 랜딩 페이지(HTML) 생성.

카카오 카드를 탭하면 열릴 '풍부한 화면'. 알림 JSON 하나를 받아 전체 안전수칙·유사사례·
날씨·매장정보 + 위험유형 실사 히어로 이미지를 담은 자체완결 HTML을 만든다(이미지 base64
내장 → 단일 파일로 어디서나 열림). 신·구 가이드 스키마 모두 지원.

운영: 배치가 알림마다 생성해 S3 업로드 → 카드 링크가 이 페이지를 가리킴.

사용:
  python3 scripts/build_guide_page.py --alert alerts/2025-01-15/10130_1777894649.json --out /tmp/guide_10130.html
  python3 scripts/build_guide_page.py --store 10130 --date 2025-01-15 --out /tmp/guide_10130.html
"""

from __future__ import annotations

import argparse
import base64
import glob
import html
import json
import os
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from core.safety_visuals import category_for

GRADE = {"high": ("🔴", "위험", "#E5484D"), "medium": ("🟠", "주의", "#F76808"),
         "med": ("🟠", "주의", "#F76808"), "low": ("🟡", "참고", "#F5A623")}

# slug → Rive 상태머신 트리거 (assets/character/scenario_expression_map.json 과 일치)
RIVE_TRIGGER = {
    "slip": "slip", "fall": "fall", "collision": "collision", "cut": "cut",
    "strain": "strain", "health": "health", "property": "property",
    "claim": "claim", "default": "default",
}
# 캐릭터 자산(.riv, 정지 PNG) 공개 경로 베이스 — S3 정적호스팅 루트 기준 상대경로
ASSET_BASE = os.environ.get("GUIDE_ASSET_BASE", "")


def _animated_svg(slug: str) -> str:
    """assets/character/animated/{slug}.svg 인라인 본문 반환(없으면 빈 문자열)."""
    p = ROOT / "assets" / "character" / "animated" / f"{slug}.svg"
    if not p.exists():
        p = ROOT / "assets" / "character" / "animated" / "default.svg"
    try:
        s = p.read_text(encoding="utf-8")
        # 컨테이너 맞춤: 고정 width/height 제거
        return s.replace('width="320" height="402"', 'width="100%" height="auto"', 1)
    except Exception:
        return ""


def _rive_stage(dominant: str) -> str:
    """카드 클릭 시 보일 캐릭터 모션 무대.

    1순위: 움직이는 인라인 SVG(CSS 애니) — Rive 없이 지금 바로 동작.
    2순위(업그레이드): .riv 가 있으면 로드되어 SVG를 대체.
    둘 다 없으면(SVG 누락) 정지 히어로로 폴백.
    """
    slug = category_for(dominant)["slug"]
    trigger = RIVE_TRIGGER.get(slug, "default")
    riv_url = f"{ASSET_BASE}/character/daiso_worker.riv"
    svg = _animated_svg(slug)
    if not svg:
        return ""  # 애니 SVG 없으면 무대 생략 → 정지 히어로
    return f"""
    <div id="char-stage" class="char-stage">
      <div id="char-svg">{svg}</div>
      <canvas id="rive-canvas" width="320" height="320" style="display:none"></canvas>
    </div>
    <script src="https://unpkg.com/@rive-app/canvas@2" onerror="void 0"></script>
    <script>
    (function(){{
      // 움직이는 SVG는 이미 재생 중. .riv 가 있으면 업그레이드 교체.
      var url = {json.dumps(riv_url)};
      fetch(url, {{method:'HEAD'}}).then(function(r){{
        if(!r.ok || typeof rive==='undefined') return;
        var cv = document.getElementById('rive-canvas');
        var inst = new rive.Rive({{
          src: url, canvas: cv, stateMachines: 'accident', autoplay: true,
          onLoad: function(){{
            inst.resizeDrawingSurfaceToCanvas();
            try {{
              var ins = inst.stateMachineInputs('accident') || [];
              var t = ins.filter(function(i){{return i.name==={json.dumps(trigger)};}})[0];
              if(t && t.fire) t.fire();
            }} catch(e){{}}
            document.getElementById('char-svg').style.display='none';
            cv.style.display='block';
          }}
        }});
      }}).catch(function(){{ /* SVG 유지 */ }});
    }})();
    </script>"""

WEATHER_LABELS = [
    ("temperature_2m_max", "최고기온", "°C"), ("temperature_2m_min", "최저기온", "°C"),
    ("precipitation_sum", "강수량", "mm"), ("snowfall_sum", "적설", "cm"),
    ("wind_speed_10m_max", "최대풍속", "m/s"), ("relative_humidity_2m_mean", "평균습도", "%"),
]


def _scene_data_uri(dominant: str, animated: bool = False) -> str | None:
    slug = category_for(dominant)["slug"]
    scene = (ROOT / "images" / "scenes" / f"{slug}.png", "image/png")
    picto = (ROOT / "images" / "categories" / f"{slug}.png", "image/png")
    # HERO_STYLE=pictogram → 경고표지 우선(애니 GIF 무시), 기본(photo) → 실사 우선
    if os.environ.get("HERO_STYLE", "photo").lower() == "pictogram":
        candidates = [picto, scene]
    else:
        candidates = []
        if animated:
            candidates.append((ROOT / "images" / "scenes" / "anim" / f"{slug}.gif", "image/gif"))
        candidates += [scene, picto]
    for p, mime in candidates:
        if p.exists():
            return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
    return None


def _extract(guide: dict) -> dict:
    """신·구 스키마 통합: {summary, precautions[], cases[], note, dominant}."""
    precs, cases = [], []
    for c in guide.get("오늘의_주의사항") or []:           # 신스키마
        if c.get("수칙"):
            precs.append(c["수칙"])
        if c.get("사고내용"):
            cases.append(c["사고내용"])
    if not precs:                                          # 구스키마
        precs = [p for p in (guide.get("안전_수칙") or []) if isinstance(p, str)]
    if not cases and guide.get("과거_사례_인용"):
        cases = [guide["과거_사례_인용"]]
    return {
        "summary": guide.get("위험_요약", ""),
        "precautions": precs,
        "cases": cases,
        "note": guide.get("추가_참고", ""),
        "dominant": (guide.get("주요_위험유형") or "").split(",")[0].strip(),
    }


def _section(title: str, node: dict, weather: dict, animated: bool = False) -> str:
    guide = node.get("guide") or {}
    g = _extract(guide)
    dom = g["dominant"] or str((node.get("risk") or {}).get("dominant_type") or "")
    badge, word, color = GRADE.get(str((node.get("risk") or {}).get("grade", "")).lower(), ("⚠️", "주의", "#E5484D"))
    hero = _scene_data_uri(dom, animated)
    precs = "".join(
        f'<li><span class="n">{i}</span><span>{html.escape(p)}</span></li>'
        for i, p in enumerate(g["precautions"], 1)
    )
    cases = "".join(f'<div class="case">{html.escape(c)}</div>' for c in g["cases"])
    hero_html = (
        f'<div class="hero"><img src="{hero}" alt=""/>'
        f'<div class="hero-grad"></div>'
        f'<div class="hero-txt"><span class="pill" style="background:{color}">{badge} {dom or "안전"} {word}</span>'
        f'<h2>{html.escape(g["summary"])}</h2></div></div>'
    ) if hero else f'<div class="hero noimg"><div class="hero-txt"><h2>{html.escape(g["summary"])}</h2></div></div>'
    return f"""
    <section class="guide">
      <div class="tag" style="color:{color}">{title}</div>
      {hero_html}
      <h3>오늘의 안전 수칙</h3>
      <ol class="precs">{precs}</ol>
      {f'<h3>유사 사고 사례</h3><div class="cases">{cases}</div>' if cases else ''}
      {f'<h3>참고</h3><p class="note">{html.escape(g["note"])}</p>' if g["note"] else ''}
    </section>"""


def build(alert: dict, animated: bool = False) -> str:
    store = alert.get("store_name", alert.get("store_code", ""))
    region = alert.get("region", "")
    date = alert.get("date", "")
    weather = alert.get("weather", {})
    results = alert.get("results", {})

    chips = "".join(
        f'<span class="chip">{lbl} <b>{weather[k]}{u}</b></span>'
        for k, lbl, u in WEATHER_LABELS if weather.get(k) is not None
    )
    sections = ""
    if results.get("cust", {}).get("guide"):
        sections += _section("고객 안전", results["cust"], weather, animated)
    if results.get("emp", {}).get("guide"):
        sections += _section("직원 안전", results["emp"], weather, animated)

    # 페이지 대표 사고유형 → 캐릭터 모션 무대 (.riv 있을 때만 표시)
    _page_dom = ""
    for _src in ("cust", "emp"):
        _r = (results.get(_src) or {}).get("risk") or {}
        if _r.get("dominant_type"):
            _page_dom = str(_r["dominant_type"]); break
    char_stage = _rive_stage(_page_dom)

    return f"""<!doctype html><html lang="ko"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{html.escape(store)} 안전 가이드</title>
<style>
*{{margin:0;padding:0;box-sizing:border-box}}
body{{font-family:-apple-system,'Apple SD Gothic Neo',sans-serif;background:#0f1115;color:#1a1a1a}}
.wrap{{max-width:480px;margin:0 auto;background:#f4f5f7;min-height:100vh}}
.top{{background:#E60012;color:#fff;padding:16px 18px}}
.top .b{{font-size:12px;opacity:.85;font-weight:600}}
.top h1{{font-size:20px;font-weight:800;margin-top:2px}}
.top .meta{{font-size:12px;opacity:.9;margin-top:4px}}
.chips{{padding:12px 14px;display:flex;flex-wrap:wrap;gap:6px;background:#fff;border-bottom:1px solid #eee}}
.chip{{font-size:11px;color:#555;background:#f1f2f4;border-radius:20px;padding:5px 10px}}
.chip b{{color:#111}}
.char-stage{{display:flex;align-items:center;justify-content:center;background:#fff;padding:8px 0 0}}
.char-stage #char-svg{{width:280px;max-width:80%}}
.char-stage canvas{{width:300px;height:300px;max-width:100%}}
.guide{{padding:14px}}
.tag{{font-size:12px;font-weight:800;margin:6px 2px 8px}}
.hero{{position:relative;border-radius:16px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,.15)}}
.hero img{{width:100%;display:block}}
.hero.noimg{{background:#222;min-height:120px}}
.hero-grad{{position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,0) 40%,rgba(0,0,0,.78))}}
.hero-txt{{position:absolute;left:0;right:0;bottom:0;padding:14px}}
.pill{{display:inline-block;color:#fff;font-size:12px;font-weight:800;border-radius:20px;padding:4px 11px;margin-bottom:8px}}
.hero-txt h2{{color:#fff;font-size:16px;font-weight:800;line-height:1.4;text-shadow:0 2px 6px rgba(0,0,0,.5)}}
h3{{font-size:14px;font-weight:800;color:#111;margin:18px 2px 8px}}
.precs{{list-style:none;display:flex;flex-direction:column;gap:8px}}
.precs li{{display:flex;gap:10px;background:#fff;border:1px solid #eee;border-radius:12px;padding:12px;font-size:14px;line-height:1.5;color:#222}}
.precs .n{{flex:none;width:22px;height:22px;border-radius:50%;background:#E60012;color:#fff;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center}}
.cases{{display:flex;flex-direction:column;gap:8px}}
.case{{background:#fff;border-left:3px solid #F5A623;border-radius:8px;padding:11px 13px;font-size:13px;line-height:1.5;color:#444}}
.note{{background:#fff;border-radius:12px;padding:12px;font-size:13px;color:#555;line-height:1.5}}
.foot{{text-align:center;color:#888;font-size:11px;padding:22px}}
</style></head><body><div class="wrap">
<div class="top"><div class="b">(주)아성다이소 · 안전보건팀 · AI 안전가이드</div>
<h1>{html.escape(store)} 안전 가이드</h1>
<div class="meta">{html.escape(region)} · {html.escape(date)}</div></div>
{f'<div class="chips">{chips}</div>' if chips else ''}
{char_stage}
{sections}
<div class="foot">본 가이드는 과거 사고 데이터·기상 조건을 AI가 분석해 자동 생성한 참고 자료입니다.</div>
</div></body></html>"""


def _find(store, date):
    m = sorted(glob.glob(str(ROOT / "alerts" / date / f"{store}_*.json")))
    return Path(m[0]) if m else None


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--alert")
    ap.add_argument("--store")
    ap.add_argument("--date")
    ap.add_argument("--out", required=True)
    ap.add_argument("--animated", action="store_true", help="히어로에 애니 GIF 임베드(움직임)")
    a = ap.parse_args()
    path = Path(a.alert) if a.alert else _find(a.store, a.date)
    if not path or not path.exists():
        raise SystemExit(f"alert 파일 없음: {path}")
    alert = json.loads(path.read_text(encoding="utf-8"))
    Path(a.out).write_text(build(alert, a.animated), encoding="utf-8")
    print(f"✅ {a.out} ({Path(a.out).stat().st_size // 1024} KB)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

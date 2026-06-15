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
    candidates = []
    if animated:
        candidates.append((ROOT / "images" / "scenes" / "anim" / f"{slug}.gif", "image/gif"))
    candidates.append((ROOT / "images" / "categories" / f"{slug}.png", "image/png"))
    for p, mime in candidates:
        if p.exists():
            return f"data:{mime};base64," + base64.b64encode(p.read_bytes()).decode()
    return None


_HISTORY_CACHE: dict = {}
_HIST_COLS = {
    "emp": ("incidents_emp.csv", "재해 유형", "사고 내용"),
    "cust": ("incidents_cust.csv", "사고유형", "사고내용요약"),
}


def _load_incidents(source: str) -> list[dict]:
    if source in _HISTORY_CACHE:
        return _HISTORY_CACHE[source]
    import csv
    fname, _, _ = _HIST_COLS[source]
    rows = []
    try:
        with (ROOT / "processed" / fname).open(encoding="utf-8") as f:
            rows = list(csv.DictReader(f))
    except Exception:
        rows = []
    _HISTORY_CACHE[source] = rows
    return rows


def _accident_history(store_code, store_name, region, dominant, source) -> dict:
    """실제 사고 기록에서 이 매장·지역·유형의 과거 이력을 집계. (신뢰 근거)

    반환: {store_count, region_count, total, cat_name, examples:[{date,type,text}]}
    유형 매칭은 category_for 로 묶음(넘어짐/미끄러짐/전도 → 같은 카테고리).
    """
    rows = _load_incidents(source)
    if not rows:
        return {}
    _, type_col, text_col = _HIST_COLS[source]
    target_slug = category_for(dominant)["slug"]
    cat_name = category_for(dominant)["name"]
    sc, rname = str(store_code).strip(), str(region).strip()

    store_n = region_cat = total_cat = 0
    same_store, same_region, any_cat = [], [], []
    for r in rows:
        rtype = (r.get(type_col) or "").strip()
        is_cat = category_for(rtype)["slug"] == target_slug and target_slug != "default"
        r_store = str(r.get("매장") or "").strip()
        r_region = str(r.get("지역") or "").strip()
        if r_store == sc and sc:
            store_n += 1
        if not is_cat:
            continue
        total_cat += 1
        if r_region == rname and rname:
            region_cat += 1
        ex = {"date": (r.get("발생일시") or "")[:10],
              "type": rtype, "text": (r.get(text_col) or "").strip()[:48]}
        if r_store == sc and sc:
            same_store.append(ex)
        elif r_region == rname and rname:
            same_region.append(ex)
        else:
            any_cat.append(ex)

    examples = (same_store + same_region + any_cat)[:3]
    return {"store_count": store_n, "region_count": region_cat, "total": total_cat,
            "cat_name": cat_name, "examples": examples}


def _history_html(hist: dict, color: str) -> str:
    if not hist or not (hist.get("total") or hist.get("store_count")):
        return ""
    cat = hist["cat_name"]
    stats = []
    if hist.get("store_count"):
        stats.append(f'<div class="ev-stat"><span class="ev-stat-num">{hist["store_count"]}</span>'
                     f'<span class="ev-stat-lbl">이 매장 사고</span></div>')
    if hist.get("region_count"):
        stats.append(f'<div class="ev-stat"><span class="ev-stat-num">{hist["region_count"]}</span>'
                     f'<span class="ev-stat-lbl">{html.escape(cat)} 지역 내</span></div>')
    elif hist.get("total"):
        stats.append(f'<div class="ev-stat"><span class="ev-stat-num">{hist["total"]}</span>'
                     f'<span class="ev-stat-lbl">{html.escape(cat)} 전사</span></div>')
    stat_row = f'<div class="ev-stat-row">{"".join(stats)}</div>' if stats else ""
    cases_html = ""
    for e in hist.get("examples", []):
        d = e["date"] or "기록"
        cases_html += (f'<div class="hcase">'
                       f'<span class="hdate">{html.escape(d)}</span>'
                       f'<span class="htype" style="color:{color}">{html.escape(e["type"])}</span>'
                       f'<span class="htext">{html.escape(e["text"])}</span>'
                       f'</div>')
    cases_block = (f'<div class="ev-cases-label">실제 사고 기록</div>{cases_html}') if cases_html else ""
    return (f'<div class="evidence">'
            f'<div class="ev-h">'
            f'<span class="ev-h-icon">📊</span>'
            f'AI 분석 근거<span class="ev-sub">· 실제 사고 데이터 기반</span>'
            f'</div>'
            f'{stat_row}'
            f'<div class="ev-sum">위 데이터를 분석해 오늘의 위험을 예측했습니다.</div>'
            f'{cases_block}'
            f'</div>')


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


def _risk_meter(risk: dict, label: str, icon: str) -> str:
    if not risk:
        return ""
    score = int(risk.get("score", 0))
    grade = str(risk.get("grade", "low")).lower()
    dom = html.escape(risk.get("dominant_type", ""))
    _, word, color = GRADE.get(grade, ("", "참고", "#16A34A"))
    circ, offset = 113.1, 113.1 * (1 - score / 100)
    return (f'<div class="rm">'
            f'<div class="rm-ring">'
            f'<svg viewBox="0 0 40 40" width="58" height="58">'
            f'<circle cx="20" cy="20" r="18" fill="none" stroke="#EAEAEA" stroke-width="4"/>'
            f'<circle cx="20" cy="20" r="18" fill="none" stroke="{color}" stroke-width="4"'
            f' stroke-dasharray="{circ:.1f}" stroke-dashoffset="{offset:.1f}"'
            f' stroke-linecap="round" transform="rotate(-90 20 20)"'
            f' style="transition:stroke-dashoffset 1.2s cubic-bezier(.2,.7,.3,1)"/>'
            f'</svg>'
            f'<div class="rm-ring-txt">'
            f'<span class="rm-num" style="color:{color}">{score}</span>'
            f'<span class="rm-unit">점</span>'
            f'</div></div>'
            f'<div class="rm-body">'
            f'<div class="rm-lbl">{icon} {label}</div>'
            f'<div class="rm-dom">{dom}</div>'
            f'<div class="rm-grade" style="color:{color}">{word}</div>'
            f'</div></div>')


_URGENCY_KW = ["지금 당장", "출근 즉시", "지금", "즉시", "바로", "오전 입고 전", "영업 시작 전"]
_HIGHLIGHT_KW = ["지금", "즉시", "바로", "출근", "오전 입고 전", "매 2시간", "지금 당장", "영업 시작 전"]


def _highlight_tip(text: str) -> str:
    """긴급성·행동 키워드를 파란색으로 강조. html.escape 이후 호출."""
    for kw in _HIGHLIGHT_KW:
        text = text.replace(html.escape(kw),
                            f'<strong class="tip-kw">{html.escape(kw)}</strong>')
    return text


def _prec_item(idx: int, text: str, color: str, is_first: bool) -> str:
    """수칙 항목 — stagger 딜레이·긴급도 배지·키워드 강조 포함."""
    delay = idx * 90 + 80
    escaped = html.escape(text)
    highlighted = _highlight_tip(escaped)
    urgency = any(kw in text for kw in _URGENCY_KW)
    first_cls = " prec-first" if is_first else ""
    urgency_cls = " prec-urgent" if urgency else ""
    return (
        f'<li class="prec-item{first_cls}{urgency_cls}" style="animation-delay:{delay}ms">'
        f'<span class="prec-n" style="background:{color}">{idx}</span>'
        f'<span class="prec-txt">{highlighted}</span>'
        f'</li>'
    )


def _section(title: str, node: dict, weather: dict, animated: bool = False,
             store_code: str = "", store_name: str = "", region: str = "",
             source: str = "cust") -> str:
    guide = node.get("guide") or {}
    g = _extract(guide)
    dom = g["dominant"] or str((node.get("risk") or {}).get("dominant_type") or "")
    grade = str((node.get("risk") or {}).get("grade", "")).lower()
    badge, word, color = GRADE.get(grade, ("⚠️", "주의", "#E5484D"))
    hist = _accident_history(store_code, store_name, region, dom, source)
    evidence_html = _history_html(hist, color)
    src_icon = "🛒" if source == "cust" else "👷"
    precs = "".join(
        _prec_item(i, p, color, i == 1)
        for i, p in enumerate(g["precautions"], 1)
    )
    cases = "".join(
        f'<div class="case-item"><span>{html.escape(c)}</span></div>'
        for c in g["cases"]
    )
    summ = (f'<div class="summ" style="border-color:{color}30;background:{color}08">'
            f'<span class="summ-ico">⚠</span>'
            f'<span class="summ-txt">{html.escape(g["summary"])}</span></div>') if g["summary"] else ""
    cases_block = (f'<div class="card"><div class="card-ttl">📋 유사 사고 사례</div>{cases}</div>') if cases else ""
    note_block = (f'<div class="note-box"><span class="note-ico">💡</span>'
                  f'<span class="note-txt">{html.escape(g["note"])}</span></div>') if g["note"] else ""
    return (f'<div class="sec">'
            f'<div class="sec-head">'
            f'<span class="sec-ico">{src_icon}</span>'
            f'<span class="sec-ttl">{title}</span>'
            f'<span class="risk-pill" style="background:{color}18;color:{color};border:1px solid {color}30">'
            f'{badge} {html.escape(dom)} {word}</span></div>'
            f'{summ}'
            f'<div class="card"><div class="card-ttl">✅ 오늘의 안전 수칙</div>'
            f'<ol class="prec-list">{precs}</ol></div>'
            f'{cases_block}{evidence_html}{note_block}'
            f'</div>')


def build(alert: dict, animated: bool = False) -> str:
    store_code = str(alert.get("store_code", ""))
    store = alert.get("store_name", store_code)
    region = alert.get("region", "")
    date_str = alert.get("date", "")
    weather = alert.get("weather", {})
    results = alert.get("results", {})

    cust_risk = (results.get("cust") or {}).get("risk") or {}
    emp_risk  = (results.get("emp")  or {}).get("risk") or {}

    page_grade = "low"
    for _s in ("cust", "emp"):
        _g = str((results.get(_s) or {}).get("risk", {}).get("grade", "")).lower()
        if _g == "high":
            page_grade = "high"; break
        if _g in ("medium", "med"):
            page_grade = "medium"
    _, _, hcol = GRADE.get(page_grade, ("", "", "#E60012"))

    _WX = [
        ("temperature_2m_max",        "🌡", "최고기온",   "°C"),
        ("temperature_2m_min",        "🥶", "최저기온",   "°C"),
        ("precipitation_sum",         "🌧", "강수량",     "mm"),
        ("snowfall_sum",              "❄", "적설",       "cm"),
        ("wind_speed_10m_max",        "💨", "최대풍속",   "m/s"),
        ("relative_humidity_2m_mean", "💧", "습도",       "%"),
    ]
    wx_chips = "".join(
        f'<div class="wx-chip">'
        f'<span class="wx-ico">{ico}</span>'
        f'<span class="wx-val">{weather[k]}{u}</span>'
        f'<span class="wx-lbl">{lbl}</span></div>'
        for k, ico, lbl, u in _WX if weather.get(k) is not None
    )
    wx_section = (f'<div class="wx-wrap">'
                  f'<div class="sec-label">오늘의 기상</div>'
                  f'<div class="wx-grid">{wx_chips}</div></div>') if wx_chips else ""

    rm_cust = _risk_meter(cust_risk, "고객 위험", "🛒")
    rm_emp  = _risk_meter(emp_risk,  "직원 위험", "👷")

    video_url = alert.get("video_url", "") or ""
    video_display = "block" if video_url else "none"

    sections = ""
    if results.get("cust", {}).get("guide"):
        sections += _section("고객 안전", results["cust"], weather, animated,
                             store_code=store_code, store_name=store, region=region, source="cust")
    if results.get("emp", {}).get("guide"):
        sections += _section("직원 안전", results["emp"], weather, animated,
                             store_code=store_code, store_name=store, region=region, source="emp")

    _page_dom = ""
    for _src in ("cust", "emp"):
        _r = (results.get(_src) or {}).get("risk") or {}
        if _r.get("dominant_type"):
            _page_dom = str(_r["dominant_type"]); break
    _cs = _rive_stage(_page_dom)
    char_wrap = f'<div class="char-stage">{_cs}</div>' if _cs else ""

    return f"""<!doctype html><html lang="ko"><head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<link rel="stylesheet" as="style" crossorigin
  href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable.min.css">
<title>{html.escape(store)} 안전가이드</title>
<style>
:root{{
  --hcol:{hcol};
  --bg:#F0F2F6;--card:#FFFFFF;
  --border:#E4E6EA;--border-s:#CBD0D8;
  --txt:#111827;--sub:#6B7280;--subtle:#9CA3AF;
  --blue:#1D4ED8;--blue-soft:#EFF6FF;
  --warn:#D97706;--warn-soft:#FFFBEB;
  --r:16px;--r-sm:10px;
  --s1:0 1px 3px rgba(0,0,0,.06),0 2px 10px rgba(0,0,0,.07);
  --s2:0 8px 28px rgba(0,0,0,.12);
  --sans:"Pretendard Variable",Pretendard,-apple-system,"Apple SD Gothic Neo",sans-serif;
}}
*{{margin:0;padding:0;box-sizing:border-box;-webkit-tap-highlight-color:transparent}}
html{{background:#111}}
body{{font-family:var(--sans);background:var(--bg);color:var(--txt);font-size:14px;line-height:1.5;
  letter-spacing:-.01em;-webkit-font-smoothing:antialiased}}
.wrap{{max-width:480px;margin:0 auto;min-height:100vh;padding-bottom:44px}}
#prog{{position:fixed;top:0;left:0;height:3px;width:0;background:var(--hcol);z-index:200;
  transition:width .08s linear;border-radius:0 3px 3px 0}}
.hd{{background:var(--hcol);position:relative;overflow:hidden}}
.hd::before{{content:'';position:absolute;right:-60px;top:-60px;width:280px;height:280px;
  border-radius:50%;background:rgba(255,255,255,.07)}}
.hd::after{{content:'';position:absolute;left:-20px;bottom:-70px;width:180px;height:180px;
  border-radius:50%;background:rgba(255,255,255,.05)}}
.hd-inner{{padding:22px 20px 26px;position:relative;z-index:1}}
.hd-brand{{font-size:11px;font-weight:700;color:rgba(255,255,255,.72);letter-spacing:.5px;
  margin-bottom:10px;display:flex;align-items:center;gap:5px}}
.hd-store{{font-size:28px;font-weight:900;color:#fff;letter-spacing:-.6px;line-height:1.1}}
.hd-meta{{display:flex;align-items:center;gap:8px;margin-top:12px;flex-wrap:wrap}}
.hd-region{{font-size:12.5px;color:rgba(255,255,255,.82);font-weight:600}}
.hd-date{{font-size:11.5px;color:rgba(255,255,255,.72);background:rgba(255,255,255,.18);
  padding:3px 11px;border-radius:999px;font-weight:600}}
.risk-row{{display:flex;gap:10px;padding:14px 14px 0;margin-top:-8px}}
.rm{{flex:1;background:var(--card);border-radius:var(--r);padding:14px 12px;
  box-shadow:var(--s1);display:flex;align-items:center;gap:11px;
  opacity:0;transform:translateY(10px);
  transition:opacity .5s cubic-bezier(.2,.7,.3,1),transform .5s cubic-bezier(.2,.7,.3,1)}}
.rm.in{{opacity:1;transform:none}}
.rm-ring{{flex:none;position:relative;width:58px;height:58px}}
.rm-ring svg{{transform:rotate(-90deg)}}
.rm-ring-txt{{position:absolute;inset:0;display:flex;flex-direction:column;
  align-items:center;justify-content:center}}
.rm-num{{font-size:17px;font-weight:900;line-height:1;letter-spacing:-.5px}}
.rm-unit{{font-size:9px;color:var(--sub);font-weight:600;margin-top:1px}}
.rm-body{{flex:1;min-width:0}}
.rm-lbl{{font-size:10.5px;color:var(--sub);font-weight:700;margin-bottom:3px}}
.rm-dom{{font-size:14px;font-weight:800}}
.rm-grade{{font-size:11.5px;font-weight:800;margin-top:2px}}
.wx-wrap{{padding:12px 14px 0}}
.sec-label{{font-size:11px;font-weight:800;color:var(--sub);letter-spacing:.6px;
  margin-bottom:8px;display:flex;align-items:center;gap:8px}}
.sec-label::after{{content:'';flex:1;height:1px;background:var(--border)}}
.wx-grid{{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}}
.wx-chip{{background:var(--card);border-radius:12px;padding:10px 6px;text-align:center;
  box-shadow:0 1px 5px rgba(0,0,0,.06);
  opacity:0;transform:translateY(8px);
  transition:opacity .45s cubic-bezier(.2,.7,.3,1),transform .45s cubic-bezier(.2,.7,.3,1)}}
.wx-chip.in{{opacity:1;transform:none}}
.wx-ico{{font-size:20px;display:block;margin-bottom:3px}}
.wx-val{{font-size:13px;font-weight:800;display:block}}
.wx-lbl{{font-size:10px;color:var(--sub);display:block;margin-top:1px}}
.char-stage{{margin:12px 14px 0;border-radius:var(--r);background:var(--card);
  overflow:hidden;box-shadow:var(--s1);display:flex;justify-content:center;padding:6px 0 0}}
.hdiv{{margin:14px 14px 0;height:1px;background:var(--border)}}
.sec{{margin:12px 14px 0;
  opacity:0;transform:translateY(12px);
  transition:opacity .55s cubic-bezier(.2,.7,.3,1),transform .55s cubic-bezier(.2,.7,.3,1)}}
.sec.in{{opacity:1;transform:none}}
.sec-head{{display:flex;align-items:center;gap:8px;margin-bottom:11px}}
.sec-ico{{font-size:20px}}
.sec-ttl{{font-size:17px;font-weight:900;letter-spacing:-.3px;flex:1}}
.risk-pill{{font-size:11px;font-weight:800;border-radius:999px;padding:4px 10px;white-space:nowrap}}
.summ{{display:flex;gap:10px;padding:13px 14px;border-radius:12px;margin-bottom:10px;border:1px solid}}
.summ-ico{{font-size:18px;flex:none;margin-top:1px}}
.summ-txt{{font-size:13.5px;font-weight:600;line-height:1.65}}
.card{{background:var(--card);border-radius:var(--r);padding:16px;margin-bottom:10px;box-shadow:var(--s1)}}
.card-ttl{{font-size:11.5px;font-weight:800;color:var(--sub);letter-spacing:.4px;margin-bottom:12px}}
.prec-list{{list-style:none;display:flex;flex-direction:column;gap:10px}}
.prec-item{{display:flex;gap:12px;align-items:flex-start;
  opacity:0;transform:translateX(-10px);
  animation:precIn .5s cubic-bezier(.2,.7,.3,1) forwards}}
@keyframes precIn{{to{{opacity:1;transform:none}}}}
/* 첫 번째 수칙: 강조 카드 */
.prec-first{{background:var(--blue-soft);border-radius:12px;padding:13px 14px;
  border:1px solid #BFDBFE;gap:10px}}
.prec-first .prec-txt{{font-weight:600;color:#1E3A8A}}
/* 긴급 수칙 */
.prec-urgent{{position:relative}}
.prec-urgent .prec-txt::before{{content:"지금 실행";font-size:10px;font-weight:800;
  color:var(--blue);background:var(--blue-soft);border-radius:999px;
  padding:2px 8px;margin-right:6px;vertical-align:middle;display:inline-block}}
.prec-n{{flex:none;width:24px;height:24px;border-radius:50%;color:#fff;font-size:12px;
  font-weight:900;display:flex;align-items:center;justify-content:center;margin-top:2px}}
.prec-txt{{font-size:14px;line-height:1.7;color:#1F2937;padding-top:2px}}
/* 키워드 강조 */
.tip-kw{{color:var(--blue);font-weight:800;font-style:normal}}
.case-item{{display:flex;gap:9px;align-items:flex-start;padding:12px 13px;
  background:var(--warn-soft);border-radius:10px;
  margin-bottom:8px;font-size:13px;line-height:1.65;color:#374151}}
.case-item::before{{content:'"';font-size:22px;font-weight:900;color:var(--warn);
  line-height:.9;flex:none}}
.note-box{{display:flex;gap:9px;padding:12px 14px;background:var(--blue-soft);
  border-radius:10px;margin-bottom:10px}}
.note-ico{{font-size:16px;flex:none}}
.note-txt{{font-size:13px;color:#1E40AF;line-height:1.65;font-weight:500}}
.evidence{{background:var(--card);border-radius:var(--r);padding:16px;margin-bottom:10px;
  box-shadow:var(--s1)}}
.ev-h{{display:flex;align-items:center;gap:8px;font-size:13.5px;font-weight:800;margin-bottom:12px}}
.ev-h-icon{{width:30px;height:30px;background:var(--blue-soft);border-radius:9px;
  display:flex;align-items:center;justify-content:center;font-size:15px;flex:none}}
.ev-sub{{font-size:11.5px;color:var(--sub);font-weight:500;margin-left:2px}}
.ev-stat-row{{display:flex;gap:8px;margin-bottom:12px}}
.ev-stat{{flex:1;background:var(--blue-soft);border-radius:10px;padding:11px 8px;text-align:center}}
.ev-stat-num{{font-size:24px;font-weight:900;color:var(--blue);display:block;
  letter-spacing:-.5px;font-variant-numeric:tabular-nums}}
.ev-stat-lbl{{font-size:10px;color:#3B82F6;display:block;margin-top:3px;font-weight:700}}
.ev-sum{{font-size:13px;color:#374151;line-height:1.6;margin-bottom:12px;
  padding:10px 12px;background:#F8FAFF;border-radius:8px}}
.ev-cases-label{{font-size:11px;font-weight:800;color:var(--sub);letter-spacing:.4px;margin-bottom:7px}}
.hcase{{display:grid;grid-template-columns:74px 58px 1fr;gap:4px;
  padding:9px 0;border-top:1px solid #F3F4F6;align-items:start}}
.hdate{{color:var(--subtle);font-size:11px;padding-top:1px}}
.htype{{font-weight:800;font-size:12px}}
.htext{{font-size:12px;color:var(--sub);line-height:1.4}}
.foot{{text-align:center;padding:28px 20px;color:var(--sub);font-size:11.5px;line-height:1.8}}
.foot strong{{color:var(--txt);font-weight:700;display:block;margin-bottom:3px}}
.lp-video-wrap{{margin-bottom:20px}}
.lp-video-container{{background:#000;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,.12)}}
</style></head>
<body>
<div id="prog"></div>
<div class="wrap">
  <div class="hd">
    <div class="hd-inner">
      <div class="hd-brand">🛡 SAGO AI · 아성다이소 안전가이드</div>
      <div class="hd-store">{html.escape(store)}</div>
      <div class="hd-meta">
        <span class="hd-region">{html.escape(region)}</span>
        <span class="hd-date">📅 {html.escape(date_str)}</span>
      </div>
    </div>
  </div>
  <div class="risk-row">{rm_cust}{rm_emp}</div>
  {wx_section}
  {char_wrap}
  <div class="hdiv"></div>
  <div class="lp-video-wrap" id="lp-video-section" style="display:{video_display};padding:0 14px">
    <div style="font-size:11px;font-weight:800;color:var(--sub);letter-spacing:.6px;margin:12px 0 8px;display:flex;align-items:center;gap:8px">
      <span style="width:8px;height:8px;border-radius:50%;background:#D70011;display:inline-block;flex:none"></span>
      안전 예방 영상
    </div>
    <div class="lp-video-container">
      <video
        id="safety-video"
        controls
        playsinline
        preload="metadata"
        style="width:100%;border-radius:12px;background:#000;max-height:280px;object-fit:contain;"
      >
        <source src="{video_url}" type="video/mp4">
        <p style="color:#888;font-size:12px;text-align:center;padding:16px;">
          이 브라우저는 영상 재생을 지원하지 않습니다.
        </p>
      </video>
    </div>
  </div>
  {sections}
  <div class="foot">
    <strong>(주)아성다이소 안전보건팀</strong>
    본 가이드는 과거 사고 데이터와 기상 조건을 AI가 분석해 자동 생성한 참고 자료입니다.
  </div>
</div>
<script>
(function(){{
  window.addEventListener('scroll',function(){{
    var s=document.documentElement;
    var p=s.scrollTop/(s.scrollHeight-s.clientHeight)||0;
    document.getElementById('prog').style.width=(p*100)+'%';
  }});
  document.querySelectorAll('.rm,.wx-chip,.sec').forEach(function(el,i){{
    setTimeout(function(){{el.classList.add('in');}},i*55+120);
  }});
}})();
</script>
</body></html>"""


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

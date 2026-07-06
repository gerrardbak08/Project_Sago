"""
core/briefing.py — 정기(월간) 조직단위 사고현황 브리핑 계산

수신자의 소속 스코프(부문/영업부/팀/매장)에 대해 월간 사고현황 + 목표대비 + 전년대비 + 핵심유형을
산출해 알림톡 변수로 만든다. 대시보드(proj)의 kpiProgress.js/org_rollup 을 Python으로 포팅한 것으로,
동일 입력이면 대시보드 배지와 같은 수치가 나온다.

입력 데이터(둘 다 대시보드가 bake, 배포 시 S3 MODELS_BUCKET 로 업로드):
  - org_rollup.json : 부문/부서/팀/매장 × 월·연·유형 집계
  - kpi_targets.json: 부문/부서/팀 목표(전년×0.9 프리필 + 관리자 수정)
"""

from __future__ import annotations

import json
import os
from typing import Any

_KST_YEAR = 2026  # target_year (kpi_targets 와 일치)

# 스코프 level → org_rollup/kpi_targets 의 level 키
_LEVEL_KEY = {"bumun": "bumun", "dept": "dept", "team": "team", "store": "store"}


# ── 로딩 (로컬 파일 또는 S3) ────────────────────────────────────────────────

def load_json(path_or_key: str, bucket: str | None = None) -> dict:
    """로컬 경로 또는 S3(bucket 지정 시)에서 JSON 로드."""
    if bucket:
        import boto3
        s3 = boto3.client("s3")
        obj = s3.get_object(Bucket=bucket, Key=path_or_key)
        return json.loads(obj["Body"].read())
    with open(path_or_key, encoding="utf-8") as f:
        return json.load(f)


# ── 목표대비 계산 (kpiProgress.js 포팅) ─────────────────────────────────────

def compute_progress(actual: float, target: float | None, baseline: float | None) -> dict:
    """사고는 적을수록 좋음. target 이하면 달성. (kpiProgress.js::computeProgress 와 동일 로직)"""
    out: dict[str, Any] = {
        "actual": actual, "target": target, "baseline": baseline,
        "delta": None, "yoyDelta": None, "yoyPct": None, "achievedPct": None, "status": "unknown",
    }
    if target is not None:
        out["delta"] = actual - target
    if baseline is not None:
        out["yoyDelta"] = actual - baseline
        out["yoyPct"] = round((actual - baseline) / baseline * 1000) / 10 if baseline > 0 else None
    if baseline is not None and target is not None and (baseline - target) != 0:
        out["achievedPct"] = round((baseline - actual) / (baseline - target) * 1000) / 10
    if target is not None:
        if actual <= target:
            out["status"] = "exceed" if actual <= target * 0.95 else "met"
        elif actual <= target * 1.1:
            out["status"] = "near"
        else:
            out["status"] = "miss"
    return out


def format_vs_target(p: dict) -> str:
    d = p.get("delta")
    if d is None:
        return "목표 미설정"
    if d < 0:
        return f"{int(round(-d))}건 감축(목표 초과달성)"
    if abs(d) < 0.5:
        return "목표 달성"
    return f"▲{int(round(d))}건 초과"


def format_yoy(p: dict) -> str:
    d = p.get("yoyDelta")
    if d is None:
        return "전년 데이터 없음"
    sign = "+" if d > 0 else ""
    pct = f" ({sign}{p['yoyPct']}%)" if p.get("yoyPct") is not None else ""
    return f"{sign}{int(round(d))}건{pct}"


# ── 집계 헬퍼 ───────────────────────────────────────────────────────────────

def latest_month(rollup: dict) -> str | None:
    """dept level 전체에서 가장 최근 월(YYYY-MM)."""
    months: set[str] = set()
    for node in (rollup.get("levels", {}).get("dept") or {}).values():
        months.update((node.get("months") or {}).keys())
    return max(months) if months else None


def _scope_node(rollup: dict, level: str, key: str) -> dict | None:
    return (rollup.get("levels", {}).get(_LEVEL_KEY.get(level, level)) or {}).get(key)


def _top_type(node: dict, year: int) -> tuple[str, int] | None:
    types = (node.get("typeByYear") or {}).get(str(year)) or {}
    if not types:
        return None
    return max(types.items(), key=lambda kv: kv[1])


def _deep_link(level: str, key: str) -> str:
    base = os.environ.get("FRONTEND_URL", "http://daiso-safety-v1-frontend.s3-website.ap-northeast-2.amazonaws.com")
    tab = "overview" if level == "bumun" else "dept"
    from urllib.parse import quote
    return f"{base}/#tab={tab}&scope={quote(key)}"


# ── 브리핑 산출 ─────────────────────────────────────────────────────────────

def compute_scope_briefing(rollup: dict, kpi: dict, scope: dict) -> dict | None:
    """한 수신자 스코프의 월간 브리핑 변수 산출.

    반환(알림톡 변수 + 메타): {조직명, 기간, 건수, 전년동월, ytd, 목표대비, 전년대비, 핵심유형, deep_link, status, ...}
    스코프에 사고 데이터가 없으면 None(사고 0 매장 등은 발송 제외 판단에 사용).
    """
    level, key = scope.get("level"), scope.get("key")
    node = _scope_node(rollup, level, key)
    if not node:
        return None

    lm = latest_month(rollup)
    if not lm:
        return None
    ly_same = f"{int(lm[:4]) - 1}{lm[4:]}"          # 전년 동월
    months_el = int(lm[5:7])
    months = node.get("months") or {}
    month_count = months.get(lm, 0)
    ly_count = months.get(ly_same, 0)
    ytd = sum(v for m, v in months.items() if m.startswith(str(_KST_YEAR)))

    # 목표(부문/부서/팀만; 매장은 목표 미설정)
    kpi_node = (kpi.get("levels", {}).get(_LEVEL_KEY.get(level, level)) or {}).get(key)
    if kpi_node:
        prorated_target = round(kpi_node.get("target_incidents", 0) * months_el / 12)
        prorated_base = round(kpi_node.get("baseline_incidents", 0) * months_el / 12)
    else:
        prorated_target = prorated_base = None
    prog = compute_progress(ytd, prorated_target, prorated_base)

    top = _top_type(node, _KST_YEAR)
    role_label = {"bumun": "영업부문", "dept": "영업부", "team": "팀", "store": "매장"}.get(level, "")

    return {
        "scope_level": level,
        "scope_key": key,
        "조직명": key,
        "role_label": role_label,
        "기간": f"{lm[:4]}년 {int(lm[5:7])}월",
        "건수": month_count,
        "전년동월": ly_count,
        "ytd": ytd,
        "목표대비": format_vs_target(prog),
        "전년대비": format_yoy(prog),
        "핵심유형": f"{top[0]} {top[1]}건" if top else "-",
        "status": prog["status"],
        "prorated_target": prorated_target,
        "deep_link": _deep_link(level, key),
    }

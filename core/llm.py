"""
llm.py — Bedrock LLM 안전 가이드 생성 (Tool Use + 인과 추론) + Mock 모드

개선된 추론 구조:
  1. 런타임에서 각 사례의 발생 시점 조건과 오늘 조건을 비교 (delta, trigger signals)
  2. 사전 계산된 비교 정보를 LLM에 주입
  3. LLM은 단순 나열이 아닌 인과 추론을 통해 수칙 도출

출력 스키마 (Tool Use로 강제됨):
  - 위험_요약, 주요_위험유형
  - 오늘의_특별_주의사항: [{수칙, 오늘의_트리거, 매장환경_상호작용, 참조_사례, 인과_추론, 관련_피처}]
  - 특별주의사항_없음_이유
  - 상시_주의사항: [{수칙, 근거_사례}]
  - 상시주의사항_없음_이유
  - 오늘의_주의_사례: [{incident_id, 사고내용, 선정_이유, 일치_신호}] (3~5건 필수)
  - 추가_참고

환경변수:
  USE_MOCK_LLM, BEDROCK_MODEL_ID, BEDROCK_REGION, AWS_DEFAULT_REGION
"""

from __future__ import annotations

import os
from datetime import date
from pathlib import Path
from typing import Any

# .env 파일 로드
try:
    from dotenv import load_dotenv
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
        print(f"[llm] .env 로드: {_env_path}")
    else:
        load_dotenv()
except ImportError:
    pass


# ---------------------------------------------------------------------------
# 피처 정의
# ---------------------------------------------------------------------------

WEATHER_FEATURES = [
    "temperature_2m_min", "temperature_2m_max",
    "precipitation_sum", "snowfall_sum", "rain_sum",
    "wind_speed_10m_max", "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]

STORE_NUM_FEATURES = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]


FEATURE_DICTIONARY = """
## 피처 사전

### 기상 피처 (Open-Meteo 일별)
- temperature_2m_min: 일 최저기온(°C). 0°C 이하 결빙, -5°C 이하 한파.
- temperature_2m_max: 일 최고기온(°C). 30°C 이상 폭염, 10°C 이하 한파 지속.
- precipitation_sum: 일 총 강수량(mm). 10mm 초과 시 많은 비.
- snowfall_sum: 일 적설량(cm). 0 초과면 눈.
- rain_sum: 일 강우량(mm).
- wind_speed_10m_max: 일 최대풍속(m/s). 10m/s 초과 시 강풍.
- relative_humidity_2m_mean: 일평균 상대습도(%). 80% 이상 결로, 30% 이하 건조.
- soil_temperature_0_to_7cm_mean: 토양 표면온도(°C). 0°C 이하 지표 결빙.

### 매장 수치 피처
- 평수, 실평수, 진열평수, 창고: 면적(평).
- 계약면적(㎡): 총 계약 면적.
- 매장인원, 입고도우미PO: 인원.
- 일평균매출, 일평균물동량: 운영 강도 지표.

### 매장 범주 피처
- 형태: 직영점/유통점/유통행사 (encoded).
"""


# ---------------------------------------------------------------------------
# 피처 유사도 판정 (룰 베이스)
# ---------------------------------------------------------------------------

def _weather_category(feat: str, val: float) -> str:
    """기상 피처의 카테고리 반환. 같은 카테고리면 유사로 판정."""
    if val is None:
        return "unknown"
    try:
        v = float(val)
    except (TypeError, ValueError):
        return "unknown"

    if feat == "temperature_2m_min":
        if v <= -5: return "한파"
        if v <= 0: return "결빙"
        if v <= 10: return "서늘"
        if v <= 25: return "평온"
        return "더움"
    if feat == "temperature_2m_max":
        if v >= 30: return "폭염"
        if v >= 20: return "더움"
        if v >= 10: return "평온"
        return "추움"
    if feat == "precipitation_sum":
        if v >= 20: return "호우"
        if v >= 10: return "강우"
        if v >= 1: return "약한비"
        return "맑음"
    if feat == "snowfall_sum":
        if v >= 5: return "대설"
        if v > 0: return "눈"
        return "없음"
    if feat == "rain_sum":
        if v >= 10: return "강우"
        if v >= 1: return "약한비"
        return "없음"
    if feat == "wind_speed_10m_max":
        if v >= 15: return "강풍"
        if v >= 10: return "돌풍"
        if v >= 5: return "미풍"
        return "잔잔"
    if feat == "relative_humidity_2m_mean":
        if v >= 80: return "고습"
        if v >= 50: return "보통"
        if v >= 30: return "건조"
        return "매우건조"
    if feat == "soil_temperature_0_to_7cm_mean":
        if v <= 0: return "결빙"
        if v <= 10: return "차가움"
        return "평온"
    return "unknown"


def _store_is_similar(feat: str, past_val: Any, today_val: Any, tol: float = 0.3) -> bool:
    """매장 수치 피처의 유사도 판정 (±tol 범위 이내)."""
    try:
        p = float(past_val) if past_val is not None else None
        t = float(today_val) if today_val is not None else None
    except (TypeError, ValueError):
        return False
    if p is None or t is None:
        return False
    if p == 0 and t == 0:
        return True
    base = max(abs(p), abs(t), 1.0)
    return abs(p - t) / base <= tol


def enrich_incidents_with_comparison(
    incidents: list[dict],
    today_weather: dict,
    today_store: dict,
) -> list[dict]:
    """각 사례에 오늘 조건과의 비교 정보를 추가한다.

    추가되는 필드:
      - trigger_match_signals: 오늘과 일치하는 조건 신호 리스트
      - severity_change: 위험 가중 여부 요약
      - weather_summary, store_summary: 사례 발생 시점 조건 요약

    주의: incidents 원본 리스트는 수정하지 않고 복사본에 추가한다.
    """
    enriched = []
    for inc in incidents:
        new = dict(inc)  # 얕은 복사

        signals: list[str] = []
        severity_notes: list[str] = []

        # 기상 피처 비교
        weather_parts = []
        for feat in WEATHER_FEATURES:
            past = inc.get(feat)
            today = today_weather.get(feat)
            if past is None or today is None:
                continue
            past_cat = _weather_category(feat, past)
            today_cat = _weather_category(feat, today)
            weather_parts.append(f"{feat}={past}")

            if past_cat == today_cat and past_cat not in ("unknown", "맑음", "없음", "보통", "평온", "잔잔"):
                signals.append(f"{feat} 일치({today_cat}): 오늘 {today} vs 사례 {past}")

                # 위험 가중 판정 (오늘이 더 심한 경우)
                try:
                    if float(today) > float(past) and feat in (
                        "precipitation_sum", "snowfall_sum", "wind_speed_10m_max"
                    ):
                        severity_notes.append(f"{feat} 위험 가중(오늘 {today} > 사례 {past})")
                    elif float(today) < float(past) and feat in (
                        "temperature_2m_min", "soil_temperature_0_to_7cm_mean"
                    ):
                        severity_notes.append(f"{feat} 위험 가중(오늘 {today} < 사례 {past})")
                except (TypeError, ValueError):
                    pass

        # 매장 수치 피처 비교 (유사 범위면 신호)
        store_parts = []
        for feat in STORE_NUM_FEATURES:
            past = inc.get(feat)
            today = today_store.get(feat)
            if past is None or today is None:
                continue
            store_parts.append(f"{feat}={past}")
            if _store_is_similar(feat, past, today):
                signals.append(f"{feat} 유사: 오늘 {today} vs 사례 {past}")

        new["trigger_match_signals"] = signals
        new["severity_change"] = "; ".join(severity_notes) if severity_notes else ""
        new["weather_summary"] = ", ".join(weather_parts)
        new["store_summary"] = ", ".join(store_parts)

        enriched.append(new)

    return enriched


# ---------------------------------------------------------------------------
# 시스템 프롬프트
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""당신은 대형 유통매장 다이소의 안전관리 전문가입니다.
오늘의 매장·기상 조건과, 각 과거 사례의 발생 시점 조건 및 오늘과의 비교 정보(trigger_match_signals, severity_change)를 바탕으로 안전 가이드를 작성합니다.

## 추론 절차 (반드시 순서대로 수행)

### Step 1. 각 과거 사례의 사고 원인 분해 (내부 추론, 출력 X)
각 사례에 대해:
- 직접 원인 조건: 사고 발생의 직접적 환경(예: precipitation_sum=18mm → 바닥 물기)
- 간접 원인 조건: 보조 요인(예: 매장인원=5명 → 매트 교체 인력 부족)
- 사고 유형 분류: 기상 의존형 / 매장 환경 의존형 / 기상+환경 결합형

### Step 2. 오늘 조건과의 매칭 판정
각 사례의 `trigger_match_signals`와 `severity_change`를 검토:
- **재현 가능성 높음**: 핵심 원인 조건이 오늘도 충족됨
- **재현 가능성 낮음**: 핵심 원인 조건이 오늘 충족되지 않음
- **위험 가중**: 오늘 조건이 과거보다 더 악화 (severity_change 있음)

### Step 3. 오늘 특유의 위험 도출 (가장 중요)
매장 환경은 고정이므로 **매일 같은 가이드가 나가지 않도록** 다음을 우선:
- **기상 변화로 오늘 새로 활성화되는 위험**을 우선 도출
- 매장 환경 피처는 **오늘 기상과 결합될 때 위험이 증폭되는 경우**에만 언급
  예) "평소 매장인원 5명은 정상이지만, 오늘 강수로 매트 교체 작업이 추가되어 1인 작업 부담 증가"
  예) "평소 일평균물동량 400박스는 관리 가능하나, 오늘 강풍으로 입고 작업 시 적재물 전도 위험 가중"

### Step 4. 사례 선정 우선순위
1. `trigger_match_signals`가 많은 사례 (오늘 조건 인과 일치)
2. `severity_change`가 있는 사례 (위험 가중)
3. 기상 의존형 또는 기상+환경 결합형 사례

## 매일 다른 가이드를 위한 핵심 원칙
- **매장 환경만의 일반론적 주의사항 금지**: "매장 인원이 적으니 2인 작업하세요" 같은 매일 동일 문구는 피할 것
- **오늘 기상 수치와 매장 환경의 상호작용을 구체적 수치와 함께 서술**할 것
  예) "오늘 precipitation_sum=16mm 강우. 매장인원=5명이므로 입구 매트 교체 주기를 평소 2시간 → 1시간으로 단축 필요"
- 각 `today_special_precautions` 항목은 **오늘 수치 또는 기상-환경 상호작용 수치를 최소 1개 이상 포함**할 것

{FEATURE_DICTIONARY}

## 출력 규칙
- 반드시 `generate_safety_guide` 도구를 호출하여 JSON 스키마에 맞게 응답하십시오.
- 스키마의 필드 이름은 영어이지만, **필드 값은 한국어로 작성**하십시오 (incident_id 제외).
- `today_alert_cases`는 **반드시 3~5건**. `trigger_match_signals`가 비어있지 않은 사례를 우선 선정하십시오.
- `today_special_precautions`의 각 항목에 다음을 반드시 포함:
  - `today_trigger`: 오늘의 구체적 수치 (예: "precipitation_sum=16mm")
  - `interaction_with_store`: 매장 환경과의 결합 (예: "매장인원=5명으로 매트 관리 인력 제한")
  - `causal_reasoning`: 과거 사례와 오늘 조건의 인과 추론 (어떻게 연결되는지)
  - `referenced_incidents`: 참조한 과거 사례 incident_id 리스트
- `today_alert_cases`의 각 항목에 `selection_reason`을 **오늘-사례 비교 수치 기반으로** 작성:
  예) "오늘 precipitation_sum=16mm, 사례일 18.5mm로 강우 카테고리 일치"
- 빈 배열이면 `no_*_reason`에 이유 작성.
"""


# ---------------------------------------------------------------------------
# Tool Spec — 새 스키마
# ---------------------------------------------------------------------------

_KEY_MAP_TOP = {
    "risk_summary": "위험_요약",
    "main_risk_type": "주요_위험유형",
    "today_special_precautions": "오늘의_특별_주의사항",
    "regular_precautions": "상시_주의사항",
    "today_alert_cases": "오늘의_주의_사례",
    "additional_notes": "추가_참고",
    "no_special_precautions_reason": "특별주의사항_없음_이유",
    "no_regular_precautions_reason": "상시주의사항_없음_이유",
}
_KEY_MAP_SPECIAL = {
    "precaution": "수칙",
    "today_trigger": "오늘의_트리거",
    "interaction_with_store": "매장환경_상호작용",
    "causal_reasoning": "인과_추론",
    "referenced_incidents": "참조_사례",
    "related_feature": "관련_피처",
}
_KEY_MAP_REGULAR = {
    "precaution": "수칙",
    "evidence_case": "근거_사례",
}
_KEY_MAP_CASE = {
    "incident_id": "incident_id",
    "incident_content": "사고내용",
    "selection_reason": "선정_이유",
    "match_signals": "일치_신호",
}

SAFETY_GUIDE_TOOL_SPEC = {
    "toolSpec": {
        "name": "generate_safety_guide",
        "description": (
            "매장·기상 조건과 과거 사고 사례(발생 시점 조건 + 오늘 비교 정보)를 분석해 "
            "인과 추론 기반 안전 가이드를 생성한다."
        ),
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "risk_summary": {
                        "type": "string",
                        "description": "오늘의 위험 상황 한 줄 요약",
                    },
                    "main_risk_type": {
                        "type": "string",
                        "description": "예: 낙상(우천), 전도(강풍)",
                    },
                    "today_special_precautions": {
                        "type": "array",
                        "description": "오늘의 기상·매장 조건과 명확히 연관된 안전 수칙 (인과 추론 포함)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "precaution": {
                                    "type": "string",
                                    "description": "안전 수칙 본문 (구체적 액션)",
                                },
                                "today_trigger": {
                                    "type": "string",
                                    "description": "오늘의 트리거 조건 수치. 예: precipitation_sum=16mm, 강우 지속",
                                },
                                "interaction_with_store": {
                                    "type": "string",
                                    "description": "매장 환경과의 결합 설명. 예: 매장인원=5명으로 매트 관리 인력 제한",
                                },
                                "causal_reasoning": {
                                    "type": "string",
                                    "description": "과거 사례와 오늘 조건의 인과 추론. 어떻게 연결되는지 서술",
                                },
                                "referenced_incidents": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "참조한 과거 사례 incident_id 리스트",
                                },
                                "related_feature": {
                                    "type": "string",
                                    "description": "관련 피처와 값. 예: precipitation_sum: 오늘 16mm, 사례일 18.5mm (강우 일치)",
                                },
                            },
                            "required": [
                                "precaution",
                                "today_trigger",
                                "interaction_with_store",
                                "causal_reasoning",
                                "referenced_incidents",
                                "related_feature",
                            ],
                        },
                    },
                    "regular_precautions": {
                        "type": "array",
                        "description": "기상·환경 조건과 무관한 상시 부주의 안전 수칙",
                        "items": {
                            "type": "object",
                            "properties": {
                                "precaution": {"type": "string"},
                                "evidence_case": {"type": "string"},
                            },
                            "required": ["precaution", "evidence_case"],
                        },
                    },
                    "today_alert_cases": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 5,
                        "description": "오늘의 대표 사고 사례 3~5건 (trigger_match_signals 있는 사례 우선)",
                        "items": {
                            "type": "object",
                            "properties": {
                                "incident_id": {
                                    "type": "string",
                                    "description": "사례 고유 ID. 예: cust_0123",
                                },
                                "incident_content": {
                                    "type": "string",
                                    "description": "사고 내용 요약",
                                },
                                "selection_reason": {
                                    "type": "string",
                                    "description": "선정 근거 (오늘-사례 비교 수치 기반). 예: '오늘 precipitation_sum=16mm, 사례일 18.5mm로 강우 일치'",
                                },
                                "match_signals": {
                                    "type": "array",
                                    "items": {"type": "string"},
                                    "description": "오늘 조건과 일치하는 신호 리스트",
                                },
                            },
                            "required": [
                                "incident_id",
                                "incident_content",
                                "selection_reason",
                                "match_signals",
                            ],
                        },
                    },
                    "additional_notes": {
                        "type": "string",
                        "description": "추가 참고 사항 (선택)",
                    },
                    "no_special_precautions_reason": {
                        "type": "string",
                        "description": "today_special_precautions가 빈 배열인 경우 이유",
                    },
                    "no_regular_precautions_reason": {
                        "type": "string",
                        "description": "regular_precautions가 빈 배열인 경우 이유",
                    },
                },
                "required": [
                    "risk_summary",
                    "main_risk_type",
                    "today_special_precautions",
                    "regular_precautions",
                    "today_alert_cases",
                ],
            }
        },
    }
}


# ---------------------------------------------------------------------------
# 유저 프롬프트 구성
# ---------------------------------------------------------------------------

def _format_store_block(store: dict) -> str:
    return (
        f"- 매장: {store.get('매장명', 'N/A')} "
        f"({store.get('지역', 'N/A')}, {store.get('형태', 'N/A')})\n"
        f"- 평수: {store.get('평수', 'N/A')}평 / 실평수: {store.get('실평수', 'N/A')}평 / "
        f"진열평수: {store.get('진열평수', 'N/A')}평 / 창고: {store.get('창고', 'N/A')}평\n"
        f"- 매장인원: {store.get('매장인원', 'N/A')}명 / "
        f"입고도우미PO: {store.get('입고도우미PO', 'N/A')}명\n"
        f"- 일평균매출: {store.get('일평균매출', 'N/A')}원 / "
        f"일평균물동량: {store.get('일평균물동량', 'N/A')}박스"
    )


def _format_weather_block(weather: dict) -> str:
    return "\n".join(
        f"- {k}: {weather.get(k, 'N/A')}" for k in WEATHER_FEATURES
    )


def _format_enriched_incidents_block(incidents: list[dict]) -> str:
    """Enriched 사례를 비교 정보와 함께 포맷."""
    lines = []
    for inc in incidents:
        iid = inc.get("incident_id", "unknown")
        content = (
            inc.get("사고내용요약")
            or inc.get("사고 내용")
            or inc.get("사고내용")
            or "(내용 없음)"
        )
        signals = inc.get("trigger_match_signals", [])
        severity = inc.get("severity_change", "")
        weather_sum = inc.get("weather_summary", "")
        store_sum = inc.get("store_summary", "")

        block = [f"  [{iid}] {content}"]
        if weather_sum:
            block.append(f"    · 사례일 기상: {weather_sum}")
        if store_sum:
            block.append(f"    · 사례 매장: {store_sum}")
        if signals:
            block.append(f"    · ✅ 오늘 일치 신호: {'; '.join(signals)}")
        else:
            block.append(f"    · ⚠️ 오늘 일치 신호 없음 (상시 부주의 사례일 가능성)")
        if severity:
            block.append(f"    · 🔺 {severity}")
        lines.append("\n".join(block))
    return "\n\n".join(lines)


def build_user_prompt(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str,
) -> str:
    today = date.today().isoformat()
    rule = leaf_data.get("rule", "N/A")
    summary = leaf_data.get("summary", {})
    incidents = leaf_data.get("incidents", [])
    total = summary.get("total", len(incidents))

    # 각 사례에 오늘 조건과의 비교 정보 추가
    enriched = enrich_incidents_with_comparison(incidents, weather, store)

    type_dist = summary.get(label_col, {})
    aux_dist_keys = [k for k in summary.keys() if k not in ("total", label_col)]
    aux_dist_lines = "\n".join(
        f"- {k} 분포: {summary.get(k, {})}" for k in aux_dist_keys
    )

    return f"""## 오늘의 조건
- 날짜: {today}
{_format_store_block(store)}

## 오늘의 기상
{_format_weather_block(weather)}

## 유사 조건 과거 사고 사례 (리프 규칙: {rule}, 총 {total}건)
- {label_col} 분포: {type_dist}
{aux_dist_lines}

### 전체 사례 (발생 시점 조건 + 오늘과의 비교 포함)
{_format_enriched_incidents_block(enriched)}

## 지시
위 과거 사례들을 분석하여:
1. `trigger_match_signals`가 많은 사례를 우선 검토하여 오늘의 특별 주의사항 도출
2. 각 수칙에 오늘 트리거 수치, 매장 환경 결합, 인과 추론, 참조 사례 ID를 명시
3. `오늘의_주의_사례`는 3~5건 선정. trigger_match_signals 있는 사례 우선
4. 기상 무관 상시 부주의 사례는 상시 주의사항으로 분리
"""


# ---------------------------------------------------------------------------
# Mock 모드
# ---------------------------------------------------------------------------

def generate_guide_mock(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str = "사고유형",
) -> dict:
    """Mock 모드: 기상 규칙 기반으로 신 스키마에 맞는 가이드를 생성한다."""
    temp_min = weather.get("temperature_2m_min", 10) or 10
    precip = weather.get("precipitation_sum", 0) or 0
    snow = weather.get("snowfall_sum", 0) or 0
    wind = weather.get("wind_speed_10m_max", 0) or 0
    store_headcount = store.get("매장인원", 0) or 0

    incidents = leaf_data.get("incidents", [])
    enriched = enrich_incidents_with_comparison(incidents, weather, store)

    special: list[dict] = []
    risk_types: list[str] = []

    if temp_min < 0:
        matching_ids = [
            inc.get("incident_id", "unknown")
            for inc in enriched[:3]
            if any("temperature_2m_min" in s for s in inc.get("trigger_match_signals", []))
        ][:2]
        special.append({
            "수칙": "매장 입구·주차장에 제설제 살포 및 미끄럼방지 매트를 설치하세요.",
            "오늘의_트리거": f"temperature_2m_min={temp_min}°C, 영하 결빙 조건",
            "매장환경_상호작용": f"매장인원={store_headcount}명으로 입구 관리 인력 한계 고려",
            "인과_추론": "영하권 기온이 입구·주차장 지표면 결빙 유발 → 고객·직원 낙상",
            "참조_사례": matching_ids or ["과거 결빙 낙상 사례"],
            "관련_피처": f"temperature_2m_min={temp_min}°C (결빙)",
        })
        risk_types.append("낙상(결빙)")

    if precip > 0:
        matching_ids = [
            inc.get("incident_id", "unknown")
            for inc in enriched[:5]
            if any("precipitation_sum" in s for s in inc.get("trigger_match_signals", []))
        ][:2]
        special.append({
            "수칙": "매장 입구 매트를 수시로 교체하고 '미끄러움 주의' 안내판을 설치하세요.",
            "오늘의_트리거": f"precipitation_sum={precip}mm, 강우 지속",
            "매장환경_상호작용": f"매장인원={store_headcount}명으로 매트 교체 주기 단축 필요",
            "인과_추론": "우천 시 바닥 물기·우산 물기가 낙상 사고 유발. 매장 인력 한계로 관리 지연 위험",
            "참조_사례": matching_ids or ["과거 우천 낙상 사례"],
            "관련_피처": f"precipitation_sum={precip}mm",
        })
        risk_types.append("낙상(우천)")

    if snow > 0:
        special.append({
            "수칙": "적설 시 지붕·차양 하부 낙설 위험을 점검하고 외부 작업 동선을 확보하세요.",
            "오늘의_트리거": f"snowfall_sum={snow}cm, 적설",
            "매장환경_상호작용": "외부 보행면 제설 작업 추가 필요",
            "인과_추론": "적설이 외부 보행면·차양 하부 위험 요소로 작용",
            "참조_사례": ["과거 적설 낙상 사례"],
            "관련_피처": f"snowfall_sum={snow}cm",
        })
        risk_types.append("낙상(적설)")

    if wind > 10:
        matching_ids = [
            inc.get("incident_id", "unknown")
            for inc in enriched[:5]
            if any("wind_speed_10m_max" in s for s in inc.get("trigger_match_signals", []))
        ][:2]
        special.append({
            "수칙": "외부 간판·적재물을 고정하고 출입문 개폐 시 주의하세요.",
            "오늘의_트리거": f"wind_speed_10m_max={wind}m/s, 강풍",
            "매장환경_상호작용": "외부 적재물·간판 추가 고정 점검 필요",
            "인과_추론": "강풍이 외부 구조물 전도 및 출입문 급개폐 사고 유발",
            "참조_사례": matching_ids or ["과거 강풍 전도 사례"],
            "관련_피처": f"wind_speed_10m_max={wind}m/s",
        })
        risk_types.append("전도(강풍)")

    common = [
        {
            "수칙": "통로 정리정돈을 실시하고 장애물을 제거하세요.",
            "근거_사례": "통로 적재물·장애물에 의한 충돌·넘어짐 사고는 상시 발생.",
        },
        {
            "수칙": "중량물은 반드시 2인 1조로 운반하세요.",
            "근거_사례": "단독 중량물 취급 중 허리·다리 부상 사고 반복.",
        },
        {
            "수칙": "계단·에스컬레이터 이용 시 손잡이를 잡도록 안내하세요.",
            "근거_사례": "계단에서 발을 헛디뎌 넘어지는 사고 빈발.",
        },
    ]

    # 오늘의 주의 사례: trigger_match_signals 있는 사례 우선
    with_signals = [inc for inc in enriched if inc.get("trigger_match_signals")]
    without_signals = [inc for inc in enriched if not inc.get("trigger_match_signals")]
    ordered = (with_signals + without_signals)[:5]

    picks: list[dict] = []
    for inc in ordered:
        iid = inc.get("incident_id", "unknown")
        content = (
            inc.get("사고내용요약")
            or inc.get("사고 내용")
            or inc.get("사고내용")
            or "(내용 없음)"
        )
        signals = inc.get("trigger_match_signals", [])
        reason = (
            f"오늘 조건과 {len(signals)}개 신호 일치"
            if signals
            else "리프 내 대표 사례"
        )
        picks.append({
            "incident_id": iid,
            "사고내용": content,
            "선정_이유": reason,
            "일치_신호": signals,
        })
    while len(picks) < 3 and picks:
        picks.append(picks[0].copy())
    if not picks:
        picks = [
            {
                "incident_id": "mock_0001",
                "사고내용": "(사례 없음 — Mock 기본값)",
                "선정_이유": "Mock 모드에서 리프 사례가 제공되지 않음.",
                "일치_신호": [],
            }
        ] * 3

    main_risk = ", ".join(risk_types) if risk_types else "상시 안전 주의"
    store_name = store.get("매장명", "매장")
    risk_summary = f"{store_name}: 오늘 주의 필요 — {main_risk}"

    result = {
        "위험_요약": risk_summary,
        "주요_위험유형": main_risk,
        "오늘의_특별_주의사항": special,
        "상시_주의사항": common,
        "오늘의_주의_사례": picks,
        "추가_참고": f"[Mock 모드] 기상 규칙 기반 생성 (temp_min={temp_min}°C, precip={precip}mm)",
    }
    if not special:
        result["특별주의사항_없음_이유"] = "오늘 기상 조건이 평이하여 특별 주의사항 없음."
    return result


# ---------------------------------------------------------------------------
# Bedrock 호출
# ---------------------------------------------------------------------------

_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-6"
)
_REGION = (
    os.environ.get("BEDROCK_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "us-east-1"
)


def _translate_response(raw: dict) -> dict:
    """영어 키 응답을 한글 키로 변환."""
    result: dict = {}
    for en_key, ko_key in _KEY_MAP_TOP.items():
        value = raw.get(en_key)

        if en_key == "today_special_precautions":
            items = value if isinstance(value, list) else []
            result[ko_key] = [
                {_KEY_MAP_SPECIAL.get(k, k): v for k, v in item.items()}
                for item in items
                if isinstance(item, dict)
            ]
        elif en_key == "regular_precautions":
            items = value if isinstance(value, list) else []
            result[ko_key] = [
                {_KEY_MAP_REGULAR.get(k, k): v for k, v in item.items()}
                for item in items
                if isinstance(item, dict)
            ]
        elif en_key == "today_alert_cases":
            items = value if isinstance(value, list) else []
            result[ko_key] = [
                {_KEY_MAP_CASE.get(k, k): v for k, v in item.items()}
                for item in items
                if isinstance(item, dict)
            ]
        elif en_key in ("no_special_precautions_reason", "no_regular_precautions_reason"):
            if value:
                result[ko_key] = value
        elif value is not None:
            result[ko_key] = value

    return result


def _call_bedrock(user_prompt: str) -> dict:
    import boto3

    client = boto3.client("bedrock-runtime", region_name=_REGION)

    response = client.converse(
        modelId=_MODEL_ID,
        system=[{"text": SYSTEM_PROMPT}],
        messages=[{"role": "user", "content": [{"text": user_prompt}]}],
        toolConfig={
            "tools": [SAFETY_GUIDE_TOOL_SPEC],
            "toolChoice": {"tool": {"name": "generate_safety_guide"}},
        },
        inferenceConfig={"maxTokens": 20000, "temperature": 0.3},
    )

    content = response["output"]["message"]["content"]
    for block in content:
        if "toolUse" in block:
            raw = block["toolUse"]["input"]
            return _translate_response(raw)
    raise RuntimeError(
        f"Bedrock 응답에 toolUse 블록이 없음: {content}"
    )


# ---------------------------------------------------------------------------
# 메인 함수
# ---------------------------------------------------------------------------

def _is_mock_mode() -> bool:
    env_val = os.environ.get("USE_MOCK_LLM", "").lower()
    return env_val in ("true", "1", "yes")


def generate_guide(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str = "사고유형",
) -> dict:
    """안전 가이드 생성. Bedrock 실패 시 Mock 전환."""
    if _is_mock_mode():
        print("[llm] Mock 모드로 안전 가이드를 생성합니다.")
        return generate_guide_mock(store, weather, leaf_data, label_col)

    user_prompt = build_user_prompt(store, weather, leaf_data, label_col)
    try:
        print("[llm] Bedrock 호출 중 (Tool Use, 인과 추론)...")
        result = _call_bedrock(user_prompt)
        print("[llm] Bedrock 응답 수신 완료.")
        return result
    except Exception as e:
        print(f"[llm] Bedrock 호출 실패: {e}")
        print("[llm] Mock 모드로 전환합니다.")
        return generate_guide_mock(store, weather, leaf_data, label_col)

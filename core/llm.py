"""
llm.py — Bedrock LLM 안전 가이드 생성 (Tool Use) + Mock 모드

USE_MOCK_LLM=true 또는 Bedrock 호출 실패 시 Mock 모드로 자동 전환한다.

출력 스키마 (Tool Use로 강제됨):
  - 위험_요약: str
  - 주요_위험유형: str
  - 오늘의_주의사항: list[{incident_id, 사고내용, 사고_원인_분석, 오늘_재현_가능성, 수칙, 관련_피처}] (3~5건)
  - 부주의_주의사항: list[str]  (부주의 사례 종합 안전 가이드 문자열)
  - 추가_참고: str

환경변수:
  USE_MOCK_LLM        — true면 Mock 모드 강제
  BEDROCK_MODEL_ID    — (선택) 모델 ID
  BEDROCK_REGION      — (선택) Bedrock 리전
  AWS_DEFAULT_REGION  — (선택) 대체 리전
"""

from __future__ import annotations

import json
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
# 피처 사전 — 시스템 프롬프트에 포함됨
# ---------------------------------------------------------------------------

FEATURE_DICTIONARY = """
## 피처 사전 (총 18개)

### 기상 피처 (Open-Meteo 일별 데이터)
- temperature_2m_min: 일 최저기온(°C). 0°C 이하면 결빙, -5°C 이하면 한파. 영하권에서는 입구·주차장 결빙으로 낙상 위험 급증.
- temperature_2m_max: 일 최고기온(°C). 30°C 이상이면 폭염으로 직원 온열질환·탈진 위험. 10°C 이하에 낮은 최고기온이면 한파 지속.
- precipitation_sum: 일 총 강수량(mm). 0은 맑음, 1~10mm는 가벼운 비, 10mm 초과는 많은 비. 바닥 물기·우산 물기·입구 혼잡으로 낙상(우천)·미끄러짐 유발.
- snowfall_sum: 일 적설량(cm). 0 초과이면 눈. 제설 작업·미끄럼·낙설 위험 증가.
- rain_sum: 일 강우량(mm). precipitation_sum 중 비 형태. 눈/비 구분에 사용.
- wind_speed_10m_max: 일 최대풍속(m/s). 10m/s 초과면 강풍으로 간판·적재물 전도, 출입문 급개폐 사고 위험.
- relative_humidity_2m_mean: 일평균 상대습도(%). 80% 이상이면 결로·미끄러짐, 30% 이하면 정전기·건조로 인한 기타 사고.
- soil_temperature_0_to_7cm_mean: 토양 표면온도(°C). 0°C 이하가 지속되면 지표 결빙으로 외부 보행면 낙상 위험.

### 매장 수치 피처
- 평수: 매장 총 평수(평). 클수록 통로·진열 동선이 길어 이동 중 사고 빈도 증가.
- 실평수: 매장 영업 가능 평수(평). 혼잡도 산정 기준.
- 진열평수: 실제 상품 진열 면적(평). 넓을수록 매대 충돌·낙하 사고 가능성.
- 창고: 창고 평수(평). 클수록 적재물 이동·지게차 작업 증가 → 직원 사고 위험.
- 계약면적(㎡): 총 계약 면적. 평수 보완 지표.
- 매장인원: 매장 근무 인원(명). 적으면 고객 대응 지연·고강도 작업, 많으면 작업 혼잡. 둘 다 사고 요인.
- 입고도우미PO: 입고 도우미 인원. 많을수록 입고 작업량 높음 → 지게차·적재 사고 위험.
- 일평균매출: 매장 일평균 매출(원). 높을수록 고객 밀집·혼잡도 증가 → 충돌·넘어짐 사고.
- 일평균물동량: 매장 일평균 물동량(박스). 높을수록 입고·진열 작업 강도 증가 → 직원 사고 위험.

### 매장 범주 피처
- 형태: 매장 운영 형태. "직영점"(자사 운영), "유통점"(위탁 운영), "유통행사"(한시적). 직영점은 사고 보고 체계 완비, 유통점은 관리 강도 상이.
"""


# ---------------------------------------------------------------------------
# 시스템 프롬프트 (요청별 동일)
# ---------------------------------------------------------------------------

SYSTEM_PROMPT = f"""당신은 대형 유통매장 다이소의 안전관리 전문가입니다.
주어진 오늘의 매장·기상 조건과 유사 조건의 과거 사고 사례를 바탕으로 안전 가이드를 작성합니다.

## 판단 원칙
과거 사고 사례를 다음 두 범주로 구분하여 판단하십시오:

1. **오늘의 조건과 연관된 사례** (→ `today_precautions`에 반영):
   오늘의 기상 **또는 매장 환경 피처**와 명확히 인과관계가 있는 사례.
   - 기상 예시: precipitation_sum=15mm → '빗물에 미끄러져 넘어짐', temperature_2m_min=-3°C → '입구 결빙 낙상'
   - 매장 환경 예시: 매장인원=5명 → '혼자 중량물 운반 중 부상', 일평균물동량=500박스 → '입고 작업 중 적재물 충돌'

2. **조건 무관 부주의 사례** (→ `negligence_precautions`에 반영):
   기상·매장 환경과 무관하게 부주의로 발생하는 사례.
   - 예: 계단에서 발을 헛디뎌 넘어짐, 칼에 손 베임, 고객 실수로 진열대 충돌

## 매장 환경 피처 활용 지침
기상 조건이 평이하더라도 매장 환경 피처를 반드시 분석하여 오늘의 주의사항을 도출하십시오:
- **매장인원이 적을수록**: 1인 작업 빈도 증가 → 중량물 운반·고소 작업 사고 위험
- **일평균물동량이 높을수록**: 입고·진열 작업 강도 증가 → 근골격계·적재물 사고 위험
- **창고 평수가 클수록**: 창고 내 이동 동선 복잡 → 낙하물·충돌 사고 위험
- **일평균매출이 높을수록**: 고객 밀집도 증가 → 혼잡 낙상·충돌 사고 위험
- **평수가 작을수록**: 좁은 통로 → 고객·직원 충돌, 진열대 접촉 사고 위험
- **형태=유통점/유통행사**: 직영점 대비 안전 관리 체계 상이 → 특이 사고 유형 주의

{FEATURE_DICTIONARY}

## 리프 노드 위험 분석 활용
입력에 "리프 노드 위험 분석" 섹션이 포함됩니다. 이는 의사결정트리 규칙을 도메인 지식으로 해석한 결과입니다.
- **위험 시나리오**: 현재 조건의 핵심 위험 유형 (예: "결빙·낙상 · 대형창고작업")
- **위험등급**: 높음/중간/낮음. "높음"이면 사례 재현 가능성을 상향 조정하십시오.
- **핵심 위험요인**: 가장 심각한 조건들. 이 요인과 직접 연관된 사례를 우선 선정하십시오.
- **기상/매장환경 해석**: 각 조건의 구체적 위험 설명. 사고 원인 추론 시 참고하십시오.

## 사례 분석 절차
각 과거 사례에 대해 다음 단계를 수행하십시오.

1. **사고 원인 추론**
   - 발생 당시 기상(Δ 참조)·매장 환경·장소·원인1을 종합해 "이 사고는 왜 일어났는가?"를 판단
   - 원인 유형:
     (a) 기상 조건 주도 — 결빙·우천·강풍·폭염 등
     (b) 매장 환경 주도 — 좁은 통로·높은 물동량·인원 부족 등
     (c) 기상+환경 복합
     (d) 조건 무관 부주의

2. **오늘 재현 가능성 판단**
   - 기상 Δ가 0에 가까울수록 재현 가능성 높음
   - 기상 Δ가 커도 매장 환경이 유사하면 (b) 유형은 재현 가능
   - 피처 사전 설명을 참고해 판단
   - 판정값: "높음" / "중간" / "낮음"

3. **분류 및 출력**
   - 원인 유형 (a)(b)(c) → `today_precautions`에 사례+수칙으로 출력 (3~5건)
   - 원인 유형 (d) → `negligence_precautions`에 종합 가이드 문자열로 출력

4. **부주의 주의사항 작성 방식**
   - 부주의 사례들을 종합 분석하여, **실용적 안전 수칙 문장**으로 작성 (1문장, 간결하게)
   - **사고 발생 건수나 통계 수치는 절대 언급하지 마십시오** (예: "N건 발생" 금지)
   - 수칙 중심으로 작성: "어떤 상황에서 무엇을 하세요" 형태
   - 예: "계단 이용 시 손잡이를 반드시 잡도록 고객에게 안내하세요."
   - 예: "통로에 적재물을 두지 말고 수시로 정리정돈을 실시하세요."
   - 예: "액체류 상품 진열 시 뚜껑 밀봉 상태를 반드시 확인하세요."

## 출력 규칙
- 반드시 제공된 도구 `generate_safety_guide`를 호출하여 JSON 스키마에 맞게 응답하십시오.
- 스키마의 필드 이름은 영어이지만, **필드 값은 한국어로 작성**하십시오 (incident_id 제외).
- `today_precautions`는 **반드시 3건 이상 5건 이하**를 선정하십시오.
- `related_feature`에는 "precipitation_sum=15mm" 또는 "매장인원=5명, 일평균물동량=500박스"처럼 피처명=값 형태로 구체적 수치를 명시하십시오.
- `today_precautions`의 `incident_id`는 입력으로 제공된 사례의 ID를 그대로 사용하십시오.
- 기상 조건이 평이하더라도 매장 환경 피처를 분석하여 반드시 1건 이상 도출하십시오.
- `negligence_precautions`는 부주의 사례를 종합해 2~4개의 실용적 안전 가이드 문장으로 작성하십시오.
"""


# ---------------------------------------------------------------------------
# Tool Spec — JSON Schema로 출력 강제
# ---------------------------------------------------------------------------

# 영어 스키마 키 → 한글 키 매핑 (Bedrock Tool Use는 ASCII property key만 허용)
_KEY_MAP_TOP = {
    "risk_summary": "위험_요약",
    "main_risk_type": "주요_위험유형",
    "today_precautions": "오늘의_주의사항",
    "negligence_precautions": "부주의_주의사항",
    "additional_notes": "추가_참고",
}
_KEY_MAP_PRECAUTION = {
    "incident_id": "incident_id",
    "incident_content": "사고내용",
    "cause_analysis": "사고_원인_분석",
    "today_recurrence_likelihood": "오늘_재현_가능성",
    "precaution": "수칙",
    "related_feature": "관련_피처",
}

SAFETY_GUIDE_TOOL_SPEC = {
    "toolSpec": {
        "name": "generate_safety_guide",
        "description": (
            "매장·기상 조건과 과거 사고 사례를 분석해 안전 가이드를 생성한다. "
            "조건 연관 사례는 개별 사례+수칙으로, 부주의 사례는 종합 가이드로 출력한다."
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
                    "today_precautions": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 5,
                        "description": "오늘의 기상·매장 조건과 연관된 사례 기반 주의사항 3~5건. 향후 이미지 매칭에 사용됨.",
                        "items": {
                            "type": "object",
                            "properties": {
                                "incident_id": {
                                    "type": "string",
                                    "description": "근거 사례 고유 ID. 예: cust_0123, emp_0042",
                                },
                                "incident_content": {
                                    "type": "string",
                                    "description": "사고 내용 요약",
                                },
                                "cause_analysis": {
                                    "type": "string",
                                    "description": "사고 원인 분석. 발생 당시 조건과 원인 유형(기상 주도/매장 환경 주도/복합)을 명시.",
                                },
                                "today_recurrence_likelihood": {
                                    "type": "string",
                                    "enum": ["높음", "중간", "낮음"],
                                    "description": "오늘 조건에서 이 사고가 재현될 가능성",
                                },
                                "precaution": {
                                    "type": "string",
                                    "description": "이 사례를 근거로 한 안전 수칙",
                                },
                                "related_feature": {
                                    "type": "string",
                                    "description": "관련 피처와 값. 예: precipitation_sum=12mm",
                                },
                            },
                            "required": [
                                "incident_id",
                                "incident_content",
                                "cause_analysis",
                                "today_recurrence_likelihood",
                                "precaution",
                                "related_feature",
                            ],
                        },
                    },
                    "negligence_precautions": {
                        "type": "array",
                        "minItems": 2,
                        "maxItems": 4,
                        "description": (
                            "부주의 사례를 종합한 실용적 안전 수칙. "
                            "각 항목은 간결한 액션 문장으로 작성. "
                            "사고 발생 건수나 통계 수치(N건, 5건 등)는 절대 포함하지 말 것. "
                            "예: '계단 이용 시 손잡이를 잡도록 안내하세요.'"
                        ),
                        "items": {
                            "type": "string",
                        },
                    },
                    "additional_notes": {
                        "type": "string",
                        "description": "추가 참고 사항 (선택)",
                    },
                },
                "required": [
                    "risk_summary",
                    "main_risk_type",
                    "today_precautions",
                    "negligence_precautions",
                ],
            }
        },
    }
}


# ---------------------------------------------------------------------------
# 유저 프롬프트 구성
# ---------------------------------------------------------------------------

def _format_store_block(store: dict) -> str:
    """매장 정보를 프롬프트용 블록으로 포맷."""
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
    """기상 정보를 프롬프트용 블록으로 포맷 (피처명 그대로 노출)."""
    return "\n".join(
        f"- {k}: {weather.get(k, 'N/A')}"
        for k in [
            "temperature_2m_min",
            "temperature_2m_max",
            "precipitation_sum",
            "snowfall_sum",
            "rain_sum",
            "wind_speed_10m_max",
            "relative_humidity_2m_mean",
            "soil_temperature_0_to_7cm_mean",
        ]
    )


def _format_incidents_block(incidents: list[dict]) -> str:
    """사례 전체를 `incident_id | 사고내용` 형태로 포맷."""
    lines = []
    for inc in incidents:
        iid = inc.get("incident_id", "unknown")
        # 고객사고는 "사고내용요약", 직원사고는 "사고 내용"
        content = (
            inc.get("사고내용요약")
            or inc.get("사고 내용")
            or inc.get("사고내용")
            or "(내용 없음)"
        )
        lines.append(f"  - {iid} | {content}")
    return "\n".join(lines)


# 형태 코드 → 한글 매핑
_STORE_TYPE_MAP = {0: "유통행사", 1: "유통점", 2: "직영점"}

WEATHER_UNITS = {
    "temperature_2m_min": "°C",
    "temperature_2m_max": "°C",
    "precipitation_sum": "mm",
    "snowfall_sum": "cm",
    "rain_sum": "mm",
    "wind_speed_10m_max": "m/s",
    "relative_humidity_2m_mean": "%",
    "soil_temperature_0_to_7cm_mean": "°C",
}

STORE_NUM_FEATURES = [
    "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
    "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
]

CLASSIFICATION_KEYS = ["사고유형", "재해 유형", "장소", "원인1"]

# ---------------------------------------------------------------------------
# kNN 유사 사례 재정렬 — IQR 정규화 가중 거리
# ---------------------------------------------------------------------------

_MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
_FEATURE_STATS_CACHE: dict[str, dict] = {}


def _load_feature_stats(source: str) -> dict:
    """models/{source}/metadata.json의 feature_stats를 로드한다 (프로세스 내 캐시)."""
    if source in _FEATURE_STATS_CACHE:
        return _FEATURE_STATS_CACHE[source]
    meta_path = _MODELS_DIR / source / "metadata.json"
    stats: dict = {}
    if meta_path.exists():
        try:
            with open(meta_path, encoding="utf-8") as f:
                stats = json.load(f).get("feature_stats", {})
        except Exception:
            pass
    _FEATURE_STATS_CACHE[source] = stats
    return stats


def rank_incidents(
    incidents: list[dict],
    today_weather: dict,
    today_store: dict,
    feature_stats: dict,
    k: int = 5,
) -> list[dict]:
    """오늘 조건과 가장 유사한 사례 상위 k건을 IQR 정규화 가중 거리 순으로 반환.

    - 기상 피처: 가중치 2.0 (사고 발생의 주요 환경 변수)
    - 매장 수치 피처: 가중치 1.0
    - 형태 (범주형): 가중치 0.5, 불일치=1 / 일치=0
    - feature_stats 없으면 원본 순서 그대로 상위 k건 반환 (graceful degrade)
    """
    if not incidents:
        return []
    if not feature_stats:
        return incidents[:k]

    today = {**today_weather, **today_store}

    _weather_feats = [
        "temperature_2m_min", "temperature_2m_max", "precipitation_sum",
        "snowfall_sum", "rain_sum", "wind_speed_10m_max",
        "relative_humidity_2m_mean", "soil_temperature_0_to_7cm_mean",
    ]
    _store_num_feats = [
        "평수", "실평수", "진열평수", "창고", "계약면적(㎡)",
        "매장인원", "입고도우미PO", "일평균매출", "일평균물동량",
    ]

    def _dist(inc: dict) -> float:
        total_w = 0.0
        total_d = 0.0
        for feat in _weather_feats:
            t_val = today.get(feat)
            i_val = inc.get(feat)
            if t_val is None or i_val is None:
                continue
            try:
                iqr = feature_stats.get(feat, {}).get("iqr") or 1.0
                total_d += 2.0 * abs(float(t_val) - float(i_val)) / iqr
                total_w += 2.0
            except (TypeError, ValueError):
                continue
        for feat in _store_num_feats:
            t_val = today.get(feat)
            i_val = inc.get(feat)
            if t_val is None or i_val is None:
                continue
            try:
                iqr = feature_stats.get(feat, {}).get("iqr") or 1.0
                total_d += abs(float(t_val) - float(i_val)) / iqr
                total_w += 1.0
            except (TypeError, ValueError):
                continue
        t_type = today.get("형태")
        i_type = inc.get("형태")
        if t_type is not None and i_type is not None:
            try:
                match = int(float(t_type)) == int(float(i_type))
                total_d += 0.5 * (0.0 if match else 1.0)
                total_w += 0.5
            except (TypeError, ValueError):
                pass
        return total_d / total_w if total_w > 0 else float("inf")

    return sorted(incidents, key=_dist)[:k]


WEATHER_FEATURES_LIST = [
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "snowfall_sum",
    "rain_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]


def _format_incident_detail(inc: dict, today_weather: dict) -> str:
    """단일 사례를 다줄 블록으로 포맷. 기상은 Δ 포함, 매장은 원본."""
    iid = inc.get("incident_id", "unknown")
    content = (
        inc.get("사고내용요약")
        or inc.get("사고 내용")
        or inc.get("사고내용")
        or "(내용 없음)"
    )
    date_str = inc.get("발생일시", "N/A")

    # 기상 Δ 계산
    weather_parts = []
    for feat in WEATHER_FEATURES_LIST:
        inc_val = inc.get(feat)
        today_val = today_weather.get(feat)
        unit = WEATHER_UNITS.get(feat, "")
        if inc_val is not None and today_val is not None:
            delta = round(float(today_val) - float(inc_val), 1)
            sign = "+" if delta >= 0 else ""
            weather_parts.append(f"{feat}={inc_val}{unit} (Δ {sign}{delta})")
        elif inc_val is not None:
            weather_parts.append(f"{feat}={inc_val}{unit} (Δ N/A)")
        else:
            weather_parts.append(f"{feat}=N/A")

    # 매장 환경 원본
    store_parts = []
    for feat in STORE_NUM_FEATURES:
        val = inc.get(feat)
        if val is not None:
            if feat == "일평균매출" and isinstance(val, (int, float)):
                store_parts.append(f"{feat}={int(val):,}")
            else:
                store_parts.append(f"{feat}={val}")
        else:
            store_parts.append(f"{feat}=N/A")
    # 형태 (코드 → 한글)
    store_type_code = inc.get("형태")
    if store_type_code is not None:
        store_type_label = _STORE_TYPE_MAP.get(int(store_type_code), str(store_type_code))
        store_parts.append(f"형태={store_type_label}")

    # 분류 정보
    class_parts = []
    for key in CLASSIFICATION_KEYS:
        val = inc.get(key)
        if val is not None:
            class_parts.append(f"{key}={val}")

    lines = [
        f"  - {iid} | {content}",
        f"    [발생일] {date_str}",
        f"    [발생 당시 기상 (오늘 대비 Δ)] {', '.join(weather_parts)}",
        f"    [발생 당시 매장] {', '.join(store_parts)}",
    ]
    if class_parts:
        lines.append(f"    [분류] {', '.join(class_parts)}")

    return "\n".join(lines)


def _format_incidents_detail_block(incidents: list[dict], today_weather: dict) -> str:
    """전체 사례를 상세 블록으로 포맷."""
    return "\n".join(
        _format_incident_detail(inc, today_weather) for inc in incidents
    )


def _build_leaf_risk_context(rule_str: str, type_counts: dict) -> str:
    """리프 규칙을 고도화 분석하여 프롬프트용 컨텍스트 문자열을 생성."""
    try:
        from core.rule_enrichment import enrich_leaf_rule
        enrichment = enrich_leaf_rule(rule_str, type_counts)

        lines = [
            f"- 위험 시나리오: {enrichment['scenario_label']}",
            f"- 위험등급: {enrichment['risk_level']}",
            f"- 기상환경 해석: {enrichment['weather_context']}",
            f"- 매장환경 해석: {enrichment['store_context']}",
            f"- 과거 최다 사고유형: {enrichment['dominant_accident_type']}",
        ]

        if enrichment["primary_risk_factors"]:
            lines.append("- 핵심 위험요인 (우선 고려):")
            for rf in enrichment["primary_risk_factors"]:
                lines.append(f"  * [{rf['feature']}] {rf['label']}: {rf['risk']}")

        lines.append(f"- 종합판단: {enrichment['explanation']}")
        return "\n".join(lines)

    except Exception as e:
        return f"(리프 위험 분석 실패: {e})"


def build_user_prompt(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str,
    confidence: str = "high",
) -> str:
    """유저 프롬프트 구성 — 사례별 발생 조건 + 기상 Δ + 리프 위험 분석 포함."""
    today = date.today().isoformat()
    rule = leaf_data.get("rule", "N/A")
    summary = leaf_data.get("summary", {})
    incidents_all = leaf_data.get("incidents", [])
    total = summary.get("total", len(incidents_all))

    # 오늘 조건과 유사한 사례 상위 8건으로 재정렬 (IQR 정규화 가중 거리)
    source = leaf_data.get("source", "cust")
    incidents = rank_incidents(incidents_all, weather, store, _load_feature_stats(source), k=8)

    type_dist = summary.get(label_col, {})
    aux_dist_keys = [k for k in summary.keys() if k not in ("total", label_col)]
    aux_dist_lines = "\n".join(
        f"- {k} 분포: {summary.get(k, {})}" for k in aux_dist_keys
    )

    # 리프 규칙 고도화 분석
    leaf_risk_context = _build_leaf_risk_context(rule, type_dist)

    confidence_note = (
        "\n## 주의\n"
        "이 가이드는 유사 조건 사례가 충분하지 않아 매칭 신뢰도가 낮습니다(low). "
        "단정적 표현을 피하고 '참고용 가설' 톤으로 작성하십시오. "
        "위험_요약 첫 줄에 '[데이터 부족 — 참고용]' 문구를 포함하십시오."
        if confidence == "low"
        else ""
    )

    return f"""## 오늘의 조건
- 날짜: {today}
{_format_store_block(store)}

## 오늘의 기상
{_format_weather_block(weather)}

## 리프 노드 위험 분석 (규칙 기반 도메인 해석)
{leaf_risk_context}

## 유사 조건 과거 사고 사례 (리프 규칙: {rule}, 총 {total}건)
- {label_col} 분포: {type_dist}
{aux_dist_lines}

각 사례에는 발생 당시 기상(오늘 대비 Δ), 발생 당시 매장 환경, 사고 분류가 포함되어 있습니다.
Δ는 (오늘값 - 발생당시값)이며, Δ가 0에 가까울수록 오늘과 유사한 조건입니다.

{_format_incidents_detail_block(incidents, weather)}

## 지시
위 리프 노드 위험 분석과 각 사례의 발생 당시 조건(기상 Δ + 매장 환경)을 종합하여:
1. 리프 위험 분석의 핵심 위험요인을 우선 고려하여 각 사고의 원인을 추론하십시오 (기상 주도 / 매장 환경 주도 / 복합 / 조건 무관 부주의).
2. 오늘 조건에서의 재현 가능성을 판단하십시오 (높음/중간/낮음). 리프 위험등급이 "높음"이면 재현 가능성도 상향 조정하십시오.
3. 원인 유형 (a)(b)(c)인 사례 중 재현 가능성이 높은 3~5건을 선정하여 `today_precautions`에 사례+수칙으로 출력하십시오.
4. 원인 유형 (d) 부주의 사례들을 종합 분석하여, **실용적 안전 수칙 문장**을 `negligence_precautions`에 2~4개 작성하십시오. 사고 건수·통계 수치는 절대 포함하지 말고, 간결한 액션 지시 형태로 작성하십시오.
{confidence_note}"""


# ---------------------------------------------------------------------------
# Mock 모드 — 기상 규칙 기반 생성
# ---------------------------------------------------------------------------

def generate_guide_mock(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str = "사고유형",
    confidence: str = "high",
) -> dict:
    """Mock 모드: 기상 조건 기반 규칙으로 신 스키마에 맞는 가이드를 생성한다."""
    temp_min = weather.get("temperature_2m_min", 10) or 10
    precip = weather.get("precipitation_sum", 0) or 0
    snow = weather.get("snowfall_sum", 0) or 0
    wind = weather.get("wind_speed_10m_max", 0) or 0

    # 오늘의 주의사항 (사례 기반) — 오늘 조건과 유사한 상위 5건으로 재정렬
    source = leaf_data.get("source", "cust")
    incidents = rank_incidents(
        leaf_data.get("incidents", []), weather, store,
        _load_feature_stats(source), k=5,
    )
    today_precautions: list[dict] = []
    risk_types: list[str] = []

    # 기상 조건 기반으로 사례 매칭
    for inc in incidents:
        iid = inc.get("incident_id", "unknown")
        content = (
            inc.get("사고내용요약")
            or inc.get("사고 내용")
            or inc.get("사고내용")
            or "(내용 없음)"
        )

        # 간단한 규칙 기반 매칭
        precaution = "매장 내 안전에 주의하세요."
        related_feature = "해당 없음"
        cause = "(Mock) 유사 조건에서 발생한 사례."

        if temp_min < 0:
            precaution = "매장 입구·주차장에 제설제 살포 및 미끄럼방지 매트를 설치하세요."
            related_feature = f"temperature_2m_min={temp_min}°C"
            cause = f"(Mock) 영하 조건(temp_min={temp_min}°C)에서 결빙 낙상 위험."
            if "낙상(결빙)" not in risk_types:
                risk_types.append("낙상(결빙)")
        elif precip > 0:
            precaution = "매장 바닥 물기를 수시로 제거하고 '미끄러움 주의' 안내판을 설치하세요."
            related_feature = f"precipitation_sum={precip}mm"
            cause = f"(Mock) 우천 조건(precip={precip}mm)에서 미끄러짐 위험."
            if "낙상(우천)" not in risk_types:
                risk_types.append("낙상(우천)")
        elif snow > 0:
            precaution = "적설 시 지붕·차양 하부 낙설 위험을 점검하세요."
            related_feature = f"snowfall_sum={snow}cm"
            cause = f"(Mock) 적설 조건(snow={snow}cm)에서 낙설·미끄러짐 위험."
            if "낙상(적설)" not in risk_types:
                risk_types.append("낙상(적설)")
        elif wind > 10:
            precaution = "외부 간판·적재물을 단단히 고정하고 출입문 개폐 시 주의하세요."
            related_feature = f"wind_speed_10m_max={wind}m/s"
            cause = f"(Mock) 강풍 조건(wind={wind}m/s)에서 전도 위험."
            if "전도(강풍)" not in risk_types:
                risk_types.append("전도(강풍)")

        today_precautions.append({
            "incident_id": iid,
            "사고내용": content,
            "사고_원인_분석": cause,
            "오늘_재현_가능성": "중간",
            "수칙": precaution,
            "관련_피처": related_feature,
        })

    # 3건 미만이면 복제
    while len(today_precautions) < 3 and today_precautions:
        today_precautions.append(today_precautions[0].copy())
    if not today_precautions:
        today_precautions = [
            {
                "incident_id": "mock_0001",
                "사고내용": "(사례 없음 — Mock 기본값)",
                "사고_원인_분석": "(Mock) 리프 사례 미제공.",
                "오늘_재현_가능성": "중간",
                "수칙": "매장 내 안전에 주의하세요.",
                "관련_피처": "해당 없음",
            }
        ] * 3

    # 부주의 주의사항 (종합 가이드 문자열)
    negligence = [
        "유사 환경 매장에서 계단 낙상 사고가 빈번합니다. 계단 이용 시 손잡이를 잡도록 안내하세요.",
        "통로 적재물에 의한 충돌·넘어짐 사고가 반복됩니다. 통로 정리정돈을 수시로 실시하세요.",
        "단독 중량물 운반 중 허리 부상 사례가 있습니다. 중량물은 반드시 2인 1조로 운반하세요.",
    ]

    main_risk = ", ".join(risk_types) if risk_types else "상시 안전 주의"
    store_name = store.get("매장명", "매장")
    risk_summary = f"{store_name}: 오늘 주의 필요 — {main_risk}"
    if confidence == "low":
        risk_summary = f"[데이터 부족 — 참고용] {risk_summary}"

    return {
        "위험_요약": risk_summary,
        "주요_위험유형": main_risk,
        "오늘의_주의사항": today_precautions,
        "부주의_주의사항": negligence,
        "추가_참고": f"[Mock 모드] 기상 규칙 기반 생성 (temp_min={temp_min}°C, precip={precip}mm)",
    }


# ---------------------------------------------------------------------------
# Bedrock 호출 (Tool Use)
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
    """영어 키 응답을 한글 키로 변환한다. 다운스트림 코드 호환성 유지."""
    result: dict = {}
    for en_key, ko_key in _KEY_MAP_TOP.items():
        value = raw.get(en_key)

        if en_key == "today_precautions":
            items = value if isinstance(value, list) else []
            result[ko_key] = [
                {_KEY_MAP_PRECAUTION.get(k, k): v for k, v in item.items()}
                for item in items
                if isinstance(item, dict)
            ]
        elif en_key == "negligence_precautions":
            # 문자열 배열 그대로 전달
            result[ko_key] = value if isinstance(value, list) else []
        elif value is not None:
            result[ko_key] = value

    return result


def _call_bedrock(user_prompt: str) -> dict:
    """Bedrock Converse API를 Tool Use로 호출하고 응답을 한글 키로 변환한다."""
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

    # Tool Use 응답에서 input(영어 키 JSON) 추출 후 한글 키로 변환
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
    """Mock 모드 여부 판단 (환경변수 USE_MOCK_LLM 확인)."""
    env_val = os.environ.get("USE_MOCK_LLM", "").lower()
    return env_val in ("true", "1", "yes")


def generate_guide(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str = "사고유형",
    confidence: str = "high",
) -> dict:
    """안전 가이드 생성.

    Bedrock 호출을 시도하고, 실패 시 Mock 모드로 전환한다.
    생성 후 오늘의_주의사항의 각 항목에 image_url을 후처리로 추가한다.

    Args:
        store: 매장 정보
        weather: 기상 데이터
        leaf_data: 리프 노드 데이터 (rule, summary, incidents)
        label_col: 라벨 컬럼명 ('사고유형' 또는 '재해 유형')
        confidence: 신뢰도 라벨 ('high'/'med'/'low')

    Returns:
        안전 가이드 dict (스키마는 모듈 docstring 참조)
    """
    if _is_mock_mode():
        print("[llm] Mock 모드로 안전 가이드를 생성합니다.")
        guide = generate_guide_mock(store, weather, leaf_data, label_col, confidence)
    else:
        user_prompt = build_user_prompt(store, weather, leaf_data, label_col, confidence)
        try:
            print("[llm] Bedrock 호출 중 (Tool Use)...")
            guide = _call_bedrock(user_prompt)
            print("[llm] Bedrock 응답 수신 완료.")

        except Exception as e:
            print(f"[llm] Bedrock 호출 실패: {e}")
            print("[llm] Mock 모드로 전환합니다.")
            guide = generate_guide_mock(store, weather, leaf_data, label_col, confidence)

    # 후처리: incident_id → image_url 매핑
    guide = _attach_image_urls(guide, leaf_data)
    return guide


def _attach_image_urls(guide: dict, leaf_data: dict) -> dict:
    """오늘의_주의사항의 각 항목에 image_url을 leaf_data incidents에서 찾아 추가한다."""
    incidents = leaf_data.get("incidents", [])
    # incident_id → image_url 매핑 구축
    url_map = {}
    for inc in incidents:
        iid = inc.get("incident_id", "")
        url = inc.get("image_url", "")
        if iid and url:
            url_map[iid] = url

    # 오늘의_주의사항에 image_url 추가
    for item in guide.get("오늘의_주의사항", []):
        iid = item.get("incident_id", "")
        item["image_url"] = url_map.get(iid, "")

    return guide

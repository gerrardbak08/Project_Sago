"""
llm.py — Bedrock LLM 안전 가이드 생성 (Tool Use) + Mock 모드

USE_MOCK_LLM=true 또는 Bedrock 호출 실패 시 Mock 모드로 자동 전환한다.

출력 스키마 (Tool Use로 강제됨):
  - 위험_요약: str
  - 주요_위험유형: str
  - 오늘의_특별_주의사항: list[{수칙, 근거_사례, 관련_피처}]
  - 상시_주의사항: list[{수칙, 근거_사례}]
  - 오늘의_주의_사례: list[{incident_id, 사고내용, 선정_이유}] (3~5건)
  - 추가_참고: str

환경변수:
  USE_MOCK_LLM        — true면 Mock 모드 강제
  BEDROCK_MODEL_ID    — (선택) 모델 ID
  BEDROCK_REGION      — (선택) Bedrock 리전
  AWS_DEFAULT_REGION  — (선택) 대체 리전
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

1. **오늘의 조건과 연관된 사례**: 오늘의 기상 또는 매장 환경 피처와 명확히 인과관계가 있는 사례
   - 예: 오늘 precipitation_sum=15mm → 과거의 '빗물에 미끄러져 넘어짐' 사례
   - 예: 오늘 temperature_2m_min=-3°C → 과거의 '입구 결빙으로 낙상' 사례
   - 예: 오늘 wind_speed_10m_max=12m/s → 과거의 '강풍으로 간판 전도' 사례

2. **오늘의 조건과 무관한 상시 부주의 사례**: 기상·매장 환경 피처로 예측하기 어려운 사례
   - 예: 계단에서 발을 헛디뎌 넘어짐, 칼에 손 베임, 고객 실수로 진열대 충돌

(1)은 "오늘의 특별 주의사항"으로, (2)는 "상시 주의사항"으로 분리하여 출력하십시오.
그리고 두 범주를 종합해, 오늘 특히 주의해야 할 대표 사고 사례 3~5건을 `오늘의_주의_사례`로 선정하십시오.
선정된 사례는 향후 이미지 자료와 매칭되므로 반드시 incident_id를 그대로 포함해야 합니다.

{FEATURE_DICTIONARY}

## 출력 규칙
- 반드시 제공된 도구 `generate_safety_guide`를 호출하여 JSON 스키마에 맞게 응답하십시오.
- `오늘의_주의_사례`는 3건 이상 5건 이하여야 합니다.
- `관련_피처`에는 "precipitation_sum=15mm"처럼 피처명=값 형태로 구체적 수치를 명시하십시오.
"""


# ---------------------------------------------------------------------------
# Tool Spec — JSON Schema로 출력 강제
# ---------------------------------------------------------------------------

SAFETY_GUIDE_TOOL_SPEC = {
    "toolSpec": {
        "name": "generate_safety_guide",
        "description": (
            "매장·기상 조건과 과거 사고 사례를 분석해 안전 가이드를 생성한다. "
            "조건 연관 사례와 상시 부주의 사례를 구분하고, 대표 사고 사례 3~5건을 선정한다."
        ),
        "inputSchema": {
            "json": {
                "type": "object",
                "properties": {
                    "위험_요약": {
                        "type": "string",
                        "description": "오늘의 위험 상황 한 줄 요약",
                    },
                    "주요_위험유형": {
                        "type": "string",
                        "description": "예: 낙상(우천), 전도(강풍)",
                    },
                    "오늘의_특별_주의사항": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "수칙": {"type": "string"},
                                "근거_사례": {"type": "string"},
                                "관련_피처": {
                                    "type": "string",
                                    "description": "예: precipitation_sum=15mm",
                                },
                            },
                            "required": ["수칙", "근거_사례", "관련_피처"],
                        },
                    },
                    "상시_주의사항": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "수칙": {"type": "string"},
                                "근거_사례": {"type": "string"},
                            },
                            "required": ["수칙", "근거_사례"],
                        },
                    },
                    "오늘의_주의_사례": {
                        "type": "array",
                        "minItems": 3,
                        "maxItems": 5,
                        "description": "이미지 매칭을 위해 선정된 오늘의 대표 사고 사례",
                        "items": {
                            "type": "object",
                            "properties": {
                                "incident_id": {"type": "string"},
                                "사고내용": {"type": "string"},
                                "선정_이유": {"type": "string"},
                            },
                            "required": ["incident_id", "사고내용", "선정_이유"],
                        },
                    },
                    "추가_참고": {"type": "string"},
                },
                "required": [
                    "위험_요약",
                    "주요_위험유형",
                    "오늘의_특별_주의사항",
                    "상시_주의사항",
                    "오늘의_주의_사례",
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


def build_user_prompt(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str,
) -> str:
    """유저 프롬프트 구성."""
    today = date.today().isoformat()
    rule = leaf_data.get("rule", "N/A")
    summary = leaf_data.get("summary", {})
    incidents = leaf_data.get("incidents", [])
    total = summary.get("total", len(incidents))

    type_dist = summary.get(label_col, {})
    aux_dist_keys = [k for k in summary.keys() if k not in ("total", label_col)]
    aux_dist_lines = "\n".join(
        f"- {k} 분포: {summary.get(k, {})}" for k in aux_dist_keys
    )

    return f"""## 오늘의 조건
- 날짜: {today}
{_format_store_block(store)}

## 기상
{_format_weather_block(weather)}

## 유사 조건 과거 사고 사례 (리프 규칙: {rule}, 총 {total}건)
- {label_col} 분포: {type_dist}
{aux_dist_lines}
- 전체 사례 (incident_id | 사고내용):
{_format_incidents_block(incidents)}

## 지시
위 과거 사례를 오늘 조건과 연관된 사례와 상시 부주의 사례로 분류하여, 각 범주별 안전 수칙을 작성하십시오.
두 범주를 종합해, 오늘 특히 주의해야 할 대표 사고 사례 3~5개를 incident_id와 함께 `오늘의_주의_사례`로 선정하십시오.
"""


# ---------------------------------------------------------------------------
# Mock 모드 — 기상 규칙 기반 생성
# ---------------------------------------------------------------------------

def generate_guide_mock(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str = "사고유형",
) -> dict:
    """Mock 모드: 기상 조건 기반 규칙으로 신 스키마에 맞는 가이드를 생성한다."""
    temp_min = weather.get("temperature_2m_min", 10) or 10
    precip = weather.get("precipitation_sum", 0) or 0
    snow = weather.get("snowfall_sum", 0) or 0
    wind = weather.get("wind_speed_10m_max", 0) or 0

    # 오늘의 특별 주의사항 (기상 연관)
    special: list[dict] = []
    risk_types: list[str] = []

    if temp_min < 0:
        special.append({
            "수칙": "매장 입구·주차장에 제설제 살포 및 미끄럼방지 매트를 설치하세요.",
            "근거_사례": "영하 조건에서 입구·주차장 결빙으로 인한 낙상 사고가 반복적으로 발생.",
            "관련_피처": f"temperature_2m_min={temp_min}°C",
        })
        risk_types.append("낙상(결빙)")

    if precip > 0:
        special.append({
            "수칙": "매장 바닥 물기를 수시로 제거하고 '미끄러움 주의' 안내판을 설치하세요.",
            "근거_사례": "우천 시 바닥 물기·우산 물기로 인한 고객·직원 미끄러짐 사고 빈발.",
            "관련_피처": f"precipitation_sum={precip}mm",
        })
        risk_types.append("낙상(우천)")

    if snow > 0:
        special.append({
            "수칙": "적설 시 지붕·차양 하부 낙설 위험을 점검하고 외부 작업 동선을 확보하세요.",
            "근거_사례": "적설 조건에서 낙설·미끄러짐 복합 사고 사례 존재.",
            "관련_피처": f"snowfall_sum={snow}cm",
        })
        risk_types.append("낙상(적설)")

    if wind > 10:
        special.append({
            "수칙": "외부 간판·적재물을 단단히 고정하고 출입문 개폐 시 주의하세요.",
            "근거_사례": "강풍 조건에서 간판 전도·출입문 급개폐 사고 사례 존재.",
            "관련_피처": f"wind_speed_10m_max={wind}m/s",
        })
        risk_types.append("전도(강풍)")

    # 상시 주의사항 (기상 무관)
    common = [
        {
            "수칙": "통로 정리정돈을 실시하고 장애물을 제거하세요.",
            "근거_사례": "통로 적재물·장애물에 의한 충돌·넘어짐 사고는 매장 상시 발생.",
        },
        {
            "수칙": "중량물은 반드시 2인 1조로 운반하세요.",
            "근거_사례": "단독 중량물 취급 중 허리·다리 부상 사고 반복.",
        },
        {
            "수칙": "계단·에스컬레이터 이용 시 손잡이를 잡도록 안내하세요.",
            "근거_사례": "계단에서 발을 헛디뎌 넘어지는 고객 사고 빈발.",
        },
    ]

    # 오늘의 주의 사례: leaf의 사례 중 상위 3~5건
    incidents = leaf_data.get("incidents", [])
    picks: list[dict] = []
    for inc in incidents[:5]:
        iid = inc.get("incident_id", "unknown")
        content = (
            inc.get("사고내용요약")
            or inc.get("사고 내용")
            or inc.get("사고내용")
            or "(내용 없음)"
        )
        picks.append({
            "incident_id": iid,
            "사고내용": content,
            "선정_이유": "유사 조건에서 발생한 대표 사고 사례.",
        })
    # 3건 미만이면 복제해서라도 최소 3건 맞추기 (스키마 준수)
    while len(picks) < 3 and picks:
        picks.append(picks[0].copy())
    if not picks:
        picks = [
            {
                "incident_id": "mock_0001",
                "사고내용": "(사례 없음 — Mock 기본값)",
                "선정_이유": "Mock 모드에서 리프 사례가 제공되지 않음.",
            }
        ] * 3

    main_risk = ", ".join(risk_types) if risk_types else "상시 안전 주의"
    store_name = store.get("매장명", "매장")
    risk_summary = f"{store_name}: 오늘 주의 필요 — {main_risk}"

    return {
        "위험_요약": risk_summary,
        "주요_위험유형": main_risk,
        "오늘의_특별_주의사항": special,
        "상시_주의사항": common,
        "오늘의_주의_사례": picks,
        "추가_참고": f"[Mock 모드] 기상 규칙 기반 생성 (temp_min={temp_min}°C, precip={precip}mm)",
    }


# ---------------------------------------------------------------------------
# Bedrock 호출 (Tool Use)
# ---------------------------------------------------------------------------

_MODEL_ID = os.environ.get(
    "BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0"
)
_REGION = (
    os.environ.get("BEDROCK_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "us-east-1"
)


def _call_bedrock(user_prompt: str) -> dict:
    """Bedrock Converse API를 Tool Use로 호출한다."""
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
        inferenceConfig={"maxTokens": 2048, "temperature": 0.3},
    )

    # Tool Use 응답에서 input(JSON) 추출
    content = response["output"]["message"]["content"]
    for block in content:
        if "toolUse" in block:
            return block["toolUse"]["input"]
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
) -> dict:
    """안전 가이드 생성.

    Bedrock 호출을 시도하고, 실패 시 Mock 모드로 전환한다.

    Args:
        store: 매장 정보
        weather: 기상 데이터
        leaf_data: 리프 노드 데이터 (rule, summary, incidents)
        label_col: 라벨 컬럼명 ('사고유형' 또는 '재해 유형')

    Returns:
        안전 가이드 dict (스키마는 모듈 docstring 참조)
    """
    if _is_mock_mode():
        print("[llm] Mock 모드로 안전 가이드를 생성합니다.")
        return generate_guide_mock(store, weather, leaf_data, label_col)

    user_prompt = build_user_prompt(store, weather, leaf_data, label_col)
    try:
        print("[llm] Bedrock 호출 중 (Tool Use)...")
        result = _call_bedrock(user_prompt)
        print("[llm] Bedrock 응답 수신 완료.")
        return result
    except Exception as e:
        print(f"[llm] Bedrock 호출 실패: {e}")
        print("[llm] Mock 모드로 전환합니다.")
        return generate_guide_mock(store, weather, leaf_data, label_col)

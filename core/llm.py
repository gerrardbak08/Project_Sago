"""
llm.py — Bedrock LLM 안전 가이드 생성 + Mock 모드

USE_MOCK_LLM=true 또는 Bedrock 자격증명이 없으면 Mock 자동 전환.
Bedrock 모델: us.anthropic.claude-sonnet-4-20250514-v1:0 (us-east-1)

환경변수 (.env 파일 지원):
  USE_MOCK_LLM       — true이면 Mock 모드 강제
  AWS_ACCESS_KEY_ID   — AWS 자격증명
  AWS_SECRET_ACCESS_KEY — AWS 자격증명
  AWS_SESSION_TOKEN   — (선택) 임시 자격증명
  AWS_DEFAULT_REGION  — (선택) 기본 리전
  BEDROCK_MODEL_ID    — (선택) 모델 ID 오버라이드
  BEDROCK_REGION      — (선택) Bedrock 리전 오버라이드
"""

import json
import os
import re
from datetime import date
from pathlib import Path

# .env 파일 로드 (python-dotenv가 있으면)
try:
    from dotenv import load_dotenv
    # 프로젝트 루트의 .env 파일을 찾아 로드
    _env_path = Path(__file__).resolve().parent.parent / ".env"
    if _env_path.exists():
        load_dotenv(_env_path)
        print(f"[llm] .env 로드: {_env_path}")
    else:
        load_dotenv()  # 현재 디렉토리 또는 상위에서 .env 탐색
except ImportError:
    pass  # python-dotenv 없으면 무시 (Lambda 환경에서는 환경변수 직접 설정)


# ---------------------------------------------------------------------------
# 프롬프트 구성
# ---------------------------------------------------------------------------

def build_prompt(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> str:
    """LLM 프롬프트를 구성한다.

    Args:
        store_info: 매장 정보 (매장명, 지역, 형태, 평수, 매장인원 등)
        weather: 기상 데이터 (temperature_2m_min, precipitation_sum 등)
        leaf_data: 리프 노드 데이터 (rule, summary, incidents)
        risk_info: 위험도 정보 (score, grade, dominant_type 등)

    Returns:
        프롬프트 문자열
    """
    today = date.today().isoformat()

    # 기상 요약
    temp_min = weather.get("temperature_2m_min", "N/A")
    temp_max = weather.get("temperature_2m_max", "N/A")
    precip = weather.get("precipitation_sum", 0)
    snow = weather.get("snowfall_sum", 0)
    wind = weather.get("wind_speed_10m_max", 0)
    humidity = weather.get("relative_humidity_2m_mean", "N/A")
    soil_temp = weather.get("soil_temperature_0_to_7cm_mean", "N/A")

    weather_block = (
        f"- 최저기온: {temp_min}°C / 최고기온: {temp_max}°C\n"
        f"- 강수량: {precip}mm / 적설량: {snow}cm\n"
        f"- 최대풍속: {wind}m/s / 평균습도: {humidity}%\n"
        f"- 토양온도(0-7cm): {soil_temp}°C"
    )

    # 리프 노드 요약
    rule = leaf_data.get("rule", "N/A")
    summary = leaf_data.get("summary", {})
    incidents = leaf_data.get("incidents", [])
    incident_texts = "\n".join(
        f"  - {inc.get('사고내용요약', 'N/A')}" for inc in incidents[:5]
    )

    # 위험도 요약
    score = risk_info.get("score", 0)
    grade = risk_info.get("grade", "low")
    dominant_type = risk_info.get("dominant_type", "N/A")
    dominant_ratio = risk_info.get("dominant_ratio", 0)

    prompt = f"""당신은 대형 유통매장의 안전관리 전문가입니다.
아래 정보를 바탕으로 오늘({today}) 해당 매장에 대한 안전 가이드를 작성하세요.

## 매장 정보
- 매장명: {store_info.get('매장명', 'N/A')}
- 지역: {store_info.get('지역', 'N/A')}
- 형태: {store_info.get('형태', 'N/A')}
- 평수: {store_info.get('평수', 'N/A')}평
- 매장인원: {store_info.get('매장인원', 'N/A')}명

## 기상 조건
{weather_block}

## 과거 사고 패턴 (리프 노드: {rule})
- 총 사고 건수: {summary.get('total', 0)}건
- 사고유형 분포: {json.dumps(summary.get('사고유형', summary.get(risk_info.get('label_col', '사고유형'), {})), ensure_ascii=False)}
- 주요 사고 사례:
{incident_texts}

## 위험도 평가
- 위험 점수: {score}/100 (등급: {grade})
- 주요 위험유형: {dominant_type} (비율: {dominant_ratio:.0%})

## 요청사항
위 정보를 종합하여 아래 JSON 형식으로 응답하세요. 반드시 JSON만 출력하세요.

```json
{{
  "위험_요약": "한 줄 요약",
  "주요_위험유형": "낙상 등",
  "안전_수칙": ["수칙1", "수칙2", ...],
  "과거_사례_인용": "유사 조건에서 발생한 사고 요약",
  "추가_참고": "선택적 추가 정보"
}}
```"""
    return prompt


# ---------------------------------------------------------------------------
# Mock 모드 — 규칙 기반 안전 수칙 생성
# ---------------------------------------------------------------------------

def generate_guide_mock(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> dict:
    """Mock 모드: 기상 조건 기반 규칙 기반 안전 수칙을 생성한다.

    Args:
        store_info: 매장 정보
        weather: 기상 데이터
        leaf_data: 리프 노드 데이터
        risk_info: 위험도 정보

    Returns:
        안전 가이드 JSON dict
    """
    temp_min = weather.get("temperature_2m_min", 10)
    precip = weather.get("precipitation_sum", 0)
    snow = weather.get("snowfall_sum", 0)
    wind = weather.get("wind_speed_10m_max", 0)

    tips = []
    risk_types = []

    # 영하 (temp_min < 0)
    if temp_min is not None and temp_min < 0:
        tips.append("매장 입구 및 주차장에 제설제를 살포하세요.")
        tips.append("출입구에 미끄럼방지 매트를 설치하세요.")
        tips.append("직원 출퇴근 시 방한용품 및 미끄럼방지 신발을 착용하세요.")
        risk_types.append("낙상(결빙)")

    # 강수 (precip > 0)
    if precip is not None and precip > 0:
        tips.append("매장 바닥 물기를 수시로 제거하세요.")
        tips.append("우천 시 '바닥 미끄러움 주의' 안내판을 설치하세요.")
        tips.append("우산 보관대 및 빗물 흡수 매트를 비치하세요.")
        risk_types.append("낙상(우천)")

    # 적설 (snow > 0)
    if snow is not None and snow > 0:
        tips.append("입고 작업 일정을 조정하고 안전한 동선을 확보하세요.")
        tips.append("적설 시 지붕 및 차양 하부 낙설 위험을 점검하세요.")
        tips.append("외부 작업 시 방한 장비를 착용하세요.")
        risk_types.append("낙상(적설)")

    # 강풍 (wind > 10)
    if wind is not None and wind > 10:
        tips.append("외부 간판 및 적재물을 단단히 고정하세요.")
        tips.append("강풍 시 외부 작업을 자제하고 출입문 개폐에 주의하세요.")
        tips.append("경량 진열대 전도 방지 조치를 확인하세요.")
        risk_types.append("전도(강풍)")

    # 기본 수칙 (항상 포함)
    tips.append("통로 정리정돈을 실시하고 장애물을 제거하세요.")
    tips.append("중량물은 반드시 2인 1조로 운반하세요.")
    tips.append("작업 시 안전 장비(안전화, 장갑 등)를 착용하세요.")

    # 주요 위험유형 결정
    dominant = risk_info.get("dominant_type", "")
    if risk_types:
        main_risk = ", ".join(risk_types)
    elif dominant:
        main_risk = dominant
    else:
        main_risk = "일반 안전"

    # 과거 사례 인용
    incidents = leaf_data.get("incidents", [])
    if incidents:
        case_texts = [inc.get("사고내용요약", "") for inc in incidents[:3] if inc.get("사고내용요약")]
        case_summary = " / ".join(case_texts) if case_texts else "해당 조건의 과거 사고 기록 있음"
    else:
        case_summary = "해당 조건의 과거 사고 기록 없음"

    # 위험 요약 구성
    store_name = store_info.get("매장명", "매장")
    grade = risk_info.get("grade", "low")
    grade_kr = {"high": "높음", "medium": "보통", "low": "낮음"}.get(grade, grade)
    risk_summary = f"{store_name}: 위험등급 {grade_kr}, 주요 위험유형 {main_risk}"

    return {
        "위험_요약": risk_summary,
        "주요_위험유형": main_risk,
        "안전_수칙": tips,
        "과거_사례_인용": case_summary,
        "추가_참고": f"[Mock 모드] 기상 조건 기반 규칙 생성 (최저기온: {temp_min}°C)",
    }


# ---------------------------------------------------------------------------
# JSON 파싱 헬퍼
# ---------------------------------------------------------------------------

def _parse_llm_json(text: str) -> dict:
    """LLM 응답에서 JSON을 추출하여 파싱한다.

    ```json ... ``` 블록이 있으면 그 안의 내용을 파싱하고,
    없으면 전체 텍스트를 JSON으로 파싱 시도한다.
    """
    # ```json ... ``` 블록 추출
    match = re.search(r"```(?:json)?\s*\n?(.*?)\n?\s*```", text, re.DOTALL)
    if match:
        json_str = match.group(1).strip()
    else:
        json_str = text.strip()

    return json.loads(json_str)


# ---------------------------------------------------------------------------
# Bedrock 호출
# ---------------------------------------------------------------------------

_MODEL_ID = os.environ.get("BEDROCK_MODEL_ID", "us.anthropic.claude-sonnet-4-20250514-v1:0")
_REGION = (
    os.environ.get("BEDROCK_REGION")
    or os.environ.get("AWS_DEFAULT_REGION")
    or "us-east-1"
)


def _call_bedrock(prompt: str) -> dict:
    """boto3로 Bedrock Converse API를 호출한다.

    boto3는 AWS_BEARER_TOKEN_BEDROCK 환경변수를 자동 인식하여
    Bearer Token 인증을 처리한다. IAM 자격증명도 동일하게 동작.
    """
    import boto3

    client = boto3.client("bedrock-runtime", region_name=_REGION)

    response = client.converse(
        modelId=_MODEL_ID,
        messages=[
            {
                "role": "user",
                "content": [{"text": prompt}],
            }
        ],
        inferenceConfig={
            "maxTokens": 2048,
            "temperature": 0.3,
        },
    )

    result_text = response["output"]["message"]["content"][0]["text"]
    return _parse_llm_json(result_text)


# ---------------------------------------------------------------------------
# 메인 함수
# ---------------------------------------------------------------------------

def _is_mock_mode() -> bool:
    """Mock 모드 여부를 판단한다.

    USE_MOCK_LLM=true → Mock 모드.
    그 외 → Bedrock 호출 시도 (실패 시 Mock fallback은 generate_guide에서 처리).
    """
    env_val = os.environ.get("USE_MOCK_LLM", "").lower()
    return env_val in ("true", "1", "yes")


def generate_guide(
    store_info: dict,
    weather: dict,
    leaf_data: dict,
    risk_info: dict,
) -> dict:
    """안전 가이드를 생성한다.

    Bedrock 호출을 시도하고, 실패 시 Mock 모드로 전환한다.

    Args:
        store_info: 매장 정보
        weather: 기상 데이터
        leaf_data: 리프 노드 데이터
        risk_info: 위험도 정보

    Returns:
        안전 가이드 JSON dict:
        {
            "위험_요약": str,
            "주요_위험유형": str,
            "안전_수칙": list[str],
            "과거_사례_인용": str,
            "추가_참고": str,
        }
    """
    if _is_mock_mode():
        print("[llm] Mock 모드로 안전 가이드를 생성합니다.")
        return generate_guide_mock(store_info, weather, leaf_data, risk_info)

    # Bedrock 호출 시도
    prompt = build_prompt(store_info, weather, leaf_data, risk_info)
    try:
        print("[llm] Bedrock 호출 중...")
        result = _call_bedrock(prompt)
        print("[llm] Bedrock 응답 수신 완료.")
        return result
    except Exception as e:
        print(f"[llm] Bedrock 호출 실패: {e}")
        print("[llm] Mock 모드로 전환합니다.")
        return generate_guide_mock(store_info, weather, leaf_data, risk_info)

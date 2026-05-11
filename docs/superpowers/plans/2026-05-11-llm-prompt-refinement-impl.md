# LLM 프롬프트 정교화 (사례별 인과 분석) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** LLM이 각 사고 사례의 발생 당시 조건과 오늘 조건을 비교해 인과 분석을 수행하도록 프롬프트를 정교화한다.

**Architecture:** `core/llm.py` 한 파일만 수정. 유저 프롬프트에 사례별 기상 Δ + 매장 원본을 포함하고, 시스템 프롬프트에 "사례 분석 절차"를 추가하며, Tool Spec에 `cause_analysis`/`today_recurrence_likelihood` 필드를 추가한다.

**Tech Stack:** Python 3.11+, AWS Bedrock (Claude), pytest

---

### Task 1: `_format_incident_detail` 헬퍼 함수 추가

**Files:**
- Modify: `core/llm.py` (기존 `_format_incidents_block` 아래에 추가)

- [ ] **Step 1: `_format_incident_detail` 함수 작성**

`core/llm.py`의 `_format_incidents_block` 함수 바로 아래에 다음 함수를 추가한다:

```python
# 형태 코드 → 한글 매핑
_STORE_TYPE_MAP = {0: "유통행사", 1: "유통점", 2: "직영점"}

WEATHER_FEATURES = [
    "temperature_2m_min",
    "temperature_2m_max",
    "precipitation_sum",
    "snowfall_sum",
    "rain_sum",
    "wind_speed_10m_max",
    "relative_humidity_2m_mean",
    "soil_temperature_0_to_7cm_mean",
]

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

# 사고 분류 키 (소스별로 존재하는 키만 출력)
CLASSIFICATION_KEYS = ["사고유형", "재해 유형", "장소", "원인1"]


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
    for feat in WEATHER_FEATURES:
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
            # 일평균매출은 천 단위 구분
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
```

- [ ] **Step 2: 구문 오류 없는지 확인**

Run: `cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && conda run -n daiso python -c "import core.llm; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add core/llm.py
git commit -m "feat(llm): add _format_incident_detail helper with weather delta calculation"
```

---

### Task 2: `build_user_prompt` 재작성

**Files:**
- Modify: `core/llm.py` (`build_user_prompt` 함수 교체)

- [ ] **Step 1: `build_user_prompt` 함수를 새 포맷으로 교체**

기존 `build_user_prompt` 함수를 다음으로 교체한다:

```python
def build_user_prompt(
    store: dict,
    weather: dict,
    leaf_data: dict,
    label_col: str,
) -> str:
    """유저 프롬프트 구성 — 사례별 발생 조건 + 기상 Δ 포함."""
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

## 오늘의 기상
{_format_weather_block(weather)}

## 유사 조건 과거 사고 사례 (리프 규칙: {rule}, 총 {total}건)
- {label_col} 분포: {type_dist}
{aux_dist_lines}

각 사례에는 발생 당시 기상(오늘 대비 Δ), 발생 당시 매장 환경, 사고 분류가 포함되어 있습니다.
Δ는 (오늘값 - 발생당시값)이며, Δ가 0에 가까울수록 오늘과 유사한 조건입니다.

{_format_incidents_detail_block(incidents, weather)}

## 지시
위 각 사례의 발생 당시 조건(기상 Δ + 매장 환경)을 분석하여:
1. 각 사고의 원인을 추론하십시오 (기상 주도 / 매장 환경 주도 / 복합 / 조건 무관 부주의).
2. 오늘 조건에서의 재현 가능성을 판단하십시오 (높음/중간/낮음).
3. 재현 가능성이 높은 사례를 근거로 "오늘의 특별 주의사항"을, 조건 무관 부주의 사례를 근거로 "상시 주의사항"을 작성하십시오.
4. 두 범주를 종합해, 오늘 특히 주의해야 할 대표 사고 사례 3~5건을 incident_id와 함께 선정하십시오.
"""
```

- [ ] **Step 2: 구문 오류 없는지 확인**

Run: `cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && conda run -n daiso python -c "import core.llm; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add core/llm.py
git commit -m "feat(llm): rewrite build_user_prompt with per-incident weather delta format"
```

---

### Task 3: 시스템 프롬프트에 "사례 분석 절차" 추가

**Files:**
- Modify: `core/llm.py` (`SYSTEM_PROMPT` 문자열 수정)

- [ ] **Step 1: SYSTEM_PROMPT에 "사례 분석 절차" 섹션 추가**

`SYSTEM_PROMPT`의 `## 출력 규칙` 섹션 바로 위에 다음 블록을 삽입한다:

```python
## 사례 분석 절차
각 과거 사례에 대해 다음 단계를 수행하십시오.

1. **사고 원인 추론**
   - 발생 당시 기상(Δ 참조)·매장 환경·장소·원인1을 종합해 "이 사고는 왜 일어났는가?"를 판단
   - 원인 유형을 다음 중 하나로 분류:
     (a) 기상 조건 주도 — 결빙·우천·강풍·폭염 등 기상이 직접 원인
     (b) 매장 환경 주도 — 좁은 통로·높은 물동량·인원 부족 등 환경이 직접 원인
     (c) 기상+환경 복합 — 두 요인이 결합해 발생
     (d) 조건 무관 부주의 — 기상·환경과 무관한 일반 부주의

2. **오늘 재현 가능성 판단**
   - 기상 Δ가 0에 가까울수록 오늘도 유사 조건 → 재현 가능성 높음
   - 기상 Δ가 커도 매장 환경이 오늘 매장과 유사하면 (b) 유형은 여전히 재현 가능
   - 피처 사전의 설명을 참고해, 수치 차이가 실제 안전에 영향을 주는지 판단
   - 판정값: "높음" / "중간" / "낮음"

3. **분류**
   - 재현 가능성 높음·원인 유형 (a)(b)(c) → "오늘의 특별 주의사항"의 근거로 사용
   - 재현 가능성 무관·원인 유형 (d) → "상시 주의사항"의 근거로 사용

4. **대표 사례 선정**
   - 재현 가능성과 원인 명확성이 높은 사례 중심으로 3~5건을 `today_alert_cases`로 선정
   - 재현 가능성이 낮더라도 대표성 있는 상시 부주의 사례는 포함 가능
   - 각 선정 사례에 대해 `cause_analysis`(사고 원인 분석)와 `today_recurrence_likelihood`(재현 가능성)를 반드시 작성
   - 향후 incident_id로 사고 이미지가 매칭되므로 ID는 반드시 원본 그대로 사용
```

- [ ] **Step 2: 구문 오류 없는지 확인**

Run: `cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && conda run -n daiso python -c "import core.llm; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add core/llm.py
git commit -m "feat(llm): add case analysis procedure to system prompt"
```

---

### Task 4: Tool Spec 및 키 매핑 확장

**Files:**
- Modify: `core/llm.py` (`SAFETY_GUIDE_TOOL_SPEC`, `_KEY_MAP_CASE`)

- [ ] **Step 1: `_KEY_MAP_CASE` 확장**

기존:
```python
_KEY_MAP_CASE = {
    "incident_id": "incident_id",  # 그대로 유지
    "incident_content": "사고내용",
    "selection_reason": "선정_이유",
}
```

변경:
```python
_KEY_MAP_CASE = {
    "incident_id": "incident_id",
    "incident_content": "사고내용",
    "cause_analysis": "사고_원인_분석",
    "today_recurrence_likelihood": "오늘_재현_가능성",
    "selection_reason": "선정_이유",
}
```

- [ ] **Step 2: `SAFETY_GUIDE_TOOL_SPEC`의 `today_alert_cases` 항목 확장**

`today_alert_cases.items.properties`에 두 필드를 추가하고, `required`를 업데이트한다:

```python
"today_alert_cases": {
    "type": "array",
    "minItems": 3,
    "maxItems": 5,
    "description": "이미지 매칭을 위해 선정된 오늘의 대표 사고 사례 3~5건",
    "items": {
        "type": "object",
        "properties": {
            "incident_id": {
                "type": "string",
                "description": "사례 고유 ID. 예: cust_0123, emp_0042",
            },
            "incident_content": {
                "type": "string",
                "description": "사고 내용 요약",
            },
            "cause_analysis": {
                "type": "string",
                "description": "사고 원인 분석. 발생 당시 조건과 원인 유형(기상 주도/매장 환경 주도/복합/조건 무관 부주의)을 명시.",
            },
            "today_recurrence_likelihood": {
                "type": "string",
                "enum": ["높음", "중간", "낮음"],
                "description": "오늘 조건에서 이 사고가 재현될 가능성",
            },
            "selection_reason": {
                "type": "string",
                "description": "이 사례를 선정한 이유",
            },
        },
        "required": [
            "incident_id",
            "incident_content",
            "cause_analysis",
            "today_recurrence_likelihood",
            "selection_reason",
        ],
    },
},
```

- [ ] **Step 3: 구문 오류 없는지 확인**

Run: `cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && conda run -n daiso python -c "import core.llm; print('OK')"`
Expected: `OK`

- [ ] **Step 4: Commit**

```bash
git add core/llm.py
git commit -m "feat(llm): extend tool spec with cause_analysis and recurrence_likelihood fields"
```

---

### Task 5: Mock 모드 업데이트

**Files:**
- Modify: `core/llm.py` (`generate_guide_mock` 함수)

- [ ] **Step 1: `generate_guide_mock`의 picks 생성 부분 수정**

기존 picks 생성 코드:
```python
picks.append({
    "incident_id": iid,
    "사고내용": content,
    "선정_이유": "유사 조건에서 발생한 대표 사고 사례.",
})
```

변경:
```python
picks.append({
    "incident_id": iid,
    "사고내용": content,
    "사고_원인_분석": "(Mock) 유사 조건에서 발생한 대표 사례. 원인 유형: 판단 불가(Mock 모드).",
    "오늘_재현_가능성": "중간",
    "선정_이유": "유사 조건에서 발생한 대표 사고 사례.",
})
```

또한 빈 사례 fallback 부분도 동일하게 수정:
```python
if not picks:
    picks = [
        {
            "incident_id": "mock_0001",
            "사고내용": "(사례 없음 — Mock 기본값)",
            "사고_원인_분석": "(Mock) 리프 사례 미제공.",
            "오늘_재현_가능성": "중간",
            "선정_이유": "Mock 모드에서 리프 사례가 제공되지 않음.",
        }
    ] * 3
```

- [ ] **Step 2: 구문 오류 없는지 확인**

Run: `cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && conda run -n daiso python -c "import core.llm; print('OK')"`
Expected: `OK`

- [ ] **Step 3: Commit**

```bash
git add core/llm.py
git commit -m "feat(llm): update mock mode to include cause_analysis and recurrence fields"
```

---

### Task 6: 모듈 docstring 업데이트

**Files:**
- Modify: `core/llm.py` (파일 상단 docstring)

- [ ] **Step 1: docstring의 출력 스키마 설명 업데이트**

기존:
```python
  - 오늘의_주의_사례: list[{incident_id, 사고내용, 선정_이유}] (3~5건, 항상 포함)
```

변경:
```python
  - 오늘의_주의_사례: list[{incident_id, 사고내용, 사고_원인_분석, 오늘_재현_가능성, 선정_이유}] (3~5건, 항상 포함)
```

- [ ] **Step 2: Commit**

```bash
git add core/llm.py
git commit -m "docs(llm): update module docstring with new schema fields"
```

---

### Task 7: 통합 검증 (Mock 모드)

**Files:**
- 실행만 (파일 수정 없음)

- [ ] **Step 1: Mock 모드로 simulate 실행**

Run:
```bash
cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && \
conda run -n daiso env USE_MOCK_LLM=true python -c "
import json
from lambdas.simulate.handler import lambda_handler

event = {
    'httpMethod': 'POST',
    'body': json.dumps({'store_code': 10130, 'date': '2026-05-11'})
}
resp = lambda_handler(event, None)
body = json.loads(resp['body'])
# 검증: 오늘의_주의_사례에 새 필드 존재
for source in ['cust', 'emp']:
    cases = body.get('results', {}).get(source, {}).get('guide', {}).get('오늘의_주의_사례', [])
    for c in cases:
        assert '사고_원인_분석' in c, f'{source}: 사고_원인_분석 필드 누락'
        assert '오늘_재현_가능성' in c, f'{source}: 오늘_재현_가능성 필드 누락'
        assert c['오늘_재현_가능성'] in ('높음', '중간', '낮음'), f'{source}: 잘못된 재현 가능성 값'
print('✅ Mock 모드 통합 검증 통과')
print(json.dumps(body['results']['cust']['guide']['오늘의_주의_사례'][:2], ensure_ascii=False, indent=2))
"
```

Expected: `✅ Mock 모드 통합 검증 통과` + 사례 2건 출력

- [ ] **Step 2: 유저 프롬프트 포맷 육안 확인**

Run:
```bash
cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && \
conda run -n daiso python -c "
import json
from core.llm import build_user_prompt

# 테스트 데이터 로드
with open('stores.json') as f:
    stores = json.load(f)
store = next(s for s in stores if s['매장'] == 10130)

with open('models/cust/leaf_table.json') as f:
    leaf_table = json.load(f)
leaf_data = leaf_table['3']  # 아무 리프

weather = {
    'temperature_2m_min': 5.0,
    'temperature_2m_max': 15.0,
    'precipitation_sum': 12.0,
    'snowfall_sum': 0.0,
    'rain_sum': 12.0,
    'wind_speed_10m_max': 3.5,
    'relative_humidity_2m_mean': 70.0,
    'soil_temperature_0_to_7cm_mean': 8.0,
}

prompt = build_user_prompt(store, weather, leaf_data, '사고유형')
# 첫 2000자만 출력
print(prompt[:2000])
"
```

Expected: 사례별로 `[발생일]`, `[발생 당시 기상 (오늘 대비 Δ)]`, `[발생 당시 매장]`, `[분류]` 블록이 보임

- [ ] **Step 3: 최종 커밋 (검증 통과 확인)**

```bash
git add -A
git status
# 변경 없으면 커밋 불필요. 변경 있으면:
# git commit -m "chore: integration verification passed"
```

---

### Task 8: Bedrock 실호출 검증 (선택)

**Files:**
- 실행만 (파일 수정 없음)

- [ ] **Step 1: Bedrock 실호출로 가이드 생성**

Run:
```bash
cd /Users/nainhyeok/Desktop/Project_PoC/26_04_AIDLC/sago_ai && \
conda run -n daiso python -c "
import json
from lambdas.simulate.handler import lambda_handler

event = {
    'httpMethod': 'POST',
    'body': json.dumps({'store_code': 10130, 'date': '2026-05-11'})
}
resp = lambda_handler(event, None)
body = json.loads(resp['body'])
print(json.dumps(body['results']['cust']['guide'], ensure_ascii=False, indent=2))
"
```

Expected: `오늘의_주의_사례` 각 항목에 `사고_원인_분석`과 `오늘_재현_가능성`이 포함된 실제 분석 결과

- [ ] **Step 2: 다른 날짜로 비교 (가이드 차별화 확인)**

동일 매장에 대해 날짜만 바꿔서 실행하고, 가이드 내용이 달라지는지 확인:
- `2026-05-11` (오늘)
- `2026-01-15` (겨울)

두 결과의 `오늘_재현_가능성` 분포가 다르면 성공.

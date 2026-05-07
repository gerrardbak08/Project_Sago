# LLM 안전 가이드 고도화 구현 계획

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 트리 모델 리프 크기 재조정 + LLM 프롬프트 재설계(Tool Use)로 매장·기상 조건별 맞춤 안전 가이드 품질을 개선하고, 근거 없는 risk 블록을 제거한다.

**Architecture:** Decision Tree를 유지하되 `max_depth=7` / `min_samples_leaf=20`으로 리프 10~20개 확보. LLM은 시스템 프롬프트(피처 사전 + 판단 원칙)와 Tool Use로 구조화된 출력을 반환. 각 사례에 `incident_id`를 부여해 추후 이미지 매칭 기반을 마련.

**Tech Stack:** Python 3.11 (conda `daiso`), scikit-learn, boto3(Bedrock Converse API), React(Vite), Terraform

**관련 스펙:** [`docs/superpowers/specs/2026-05-07-llm-prompt-upgrade-design.md`](../specs/2026-05-07-llm-prompt-upgrade-design.md)

**엔지니어 주의사항:**
- 모든 Python 실행은 반드시 `conda run -n daiso python ...` 형식으로
- 각 Task 완료 후 반드시 git commit
- 기존 테스트 프레임워크가 없는 프로젝트이므로, 검증은 실제 스크립트 실행(출력 확인) 및 `local_server.py`를 통한 end-to-end 수동 확인으로 수행

---

## 파일 맵

### 신규 작성
- 없음 (기존 파일 수정 + 삭제만 해당)

### 수정
| 파일 | 책임 |
|------|------|
| `scripts/build_dataset.py` | 사고 CSV에 `incident_id` 부여 |
| `scripts/train.py` | 하이퍼파라미터 변경, `leaf_table.json`의 incidents에 `incident_id` 전파 |
| `core/llm.py` | 시스템 프롬프트(피처 사전), Tool Use 호출, Mock 모드 신 스키마 |
| `lambdas/simulate/handler.py` | `calculate_risk` 제거, 응답 risk 필드 제거, `_record_alert` 스키마 업데이트 |
| `lambdas/batch/handler.py` | risk 블록 제거, `_record_alert` 스키마 업데이트 |
| `lambdas/notify/handler.py` | risk 블록 제거, `_record_alert` 스키마 업데이트, 발송 메시지 본문 업데이트 |
| `proj/src/components/tabs/alert/AlertMonitoring.jsx` | 위험등급 UI 제거, 신규 가이드 스키마 렌더링 |

### 삭제
- `core/risk.py`

### 산출물 교체
- `models/cust/*`, `models/emp/*` (재학습)

---

## Task 1: `scripts/build_dataset.py`에 `incident_id` 부여

**Files:**
- Modify: `scripts/build_dataset.py` (Step 2 내부)

**목표:** 고객/직원 사고 CSV의 각 행에 `cust_0001`, `emp_0001` 형식의 고유 ID를 부여.

- [ ] **Step 1: `step2_build_incidents` 함수에 ID 부여 로직 추가**

`scripts/build_dataset.py`에서 `step2_build_incidents` 함수 내부, `cust.to_csv(...)` 직전과 `emp.to_csv(...)` 직전에 incident_id 컬럼을 삽입한다.

고객사고 저장 직전에 추가:
```python
# incident_id 부여 (0-padded, 4자리)
cust = cust.reset_index(drop=True)
cust["incident_id"] = [f"cust_{i+1:04d}" for i in range(len(cust))]
```

직원사고 저장 직전에 추가:
```python
emp = emp.reset_index(drop=True)
emp["incident_id"] = [f"emp_{i+1:04d}" for i in range(len(emp))]
```

- [ ] **Step 2: `step4_cleanup`에서 `incident_id` 보존**

`step4_cleanup` 함수에서 `CUST_CASE_COLS`/`EMP_CASE_COLS`를 기반으로 컬럼을 남기는데, `incident_id`도 유지 대상에 포함시켜야 한다.

기존:
```python
for c in TREE_FEATURES + CUST_CASE_COLS + ["source", "위도", "경도"]:
```

변경:
```python
for c in TREE_FEATURES + CUST_CASE_COLS + ["source", "위도", "경도", "incident_id"]:
```

동일하게 EMP 블록도 수정.

- [ ] **Step 3: 실행하여 CSV에 컬럼이 생겼는지 확인**

Run:
```bash
conda run -n daiso python scripts/build_dataset.py --step 2
conda run -n daiso python scripts/build_dataset.py --step 4
```

Expected: `processed/incidents_cust.csv`, `processed/incidents_emp.csv`에 `incident_id` 컬럼 존재

Run:
```bash
conda run -n daiso python -c "import pandas as pd; df=pd.read_csv('processed/incidents_cust.csv'); print(df['incident_id'].head()); print('총', len(df), '건'); assert df['incident_id'].is_unique, 'ID 중복!'"
conda run -n daiso python -c "import pandas as pd; df=pd.read_csv('processed/incidents_emp.csv'); print(df['incident_id'].head()); print('총', len(df), '건'); assert df['incident_id'].is_unique, 'ID 중복!'"
```

Expected: `cust_0001`, `cust_0002`, ... / `emp_0001`, `emp_0002`, ... 출력, 중복 없음

- [ ] **Step 4: 커밋**

`.gitignore`에 `processed/`가 없음을 확인했으므로 CSV도 함께 커밋한다.

```bash
git add scripts/build_dataset.py processed/incidents_cust.csv processed/incidents_emp.csv
git commit -m "feat(dataset): 사고 사례에 incident_id 부여"
```

---

## Task 2: `scripts/train.py` 하이퍼파라미터 변경 + `incident_id` 전파

**Files:**
- Modify: `scripts/train.py`

**목표:** 하이퍼파라미터를 새 값으로 변경하고, `leaf_table.json`의 `incidents` 배열 각 원소에 `incident_id` 필드를 포함한다.

- [ ] **Step 1: 하이퍼파라미터 변경**

`scripts/train.py` 상단 `TREE_PARAMS` 딕셔너리를 변경.

기존:
```python
TREE_PARAMS = dict(
    max_depth=5,
    min_samples_leaf=5,
    min_impurity_decrease=0.01,
    class_weight="balanced",
    criterion="gini",
    random_state=42,
)
```

변경:
```python
TREE_PARAMS = dict(
    max_depth=7,
    min_samples_leaf=20,
    min_impurity_decrease=0.005,
    class_weight="balanced",
    criterion="gini",
    random_state=42,
)
```

- [ ] **Step 2: `_build_leaf_table`에서 `incident_id`를 사례 필드에 포함**

기존 `_build_leaf_table`에서 `incident_cols`를 구성할 때 `incident_id`를 명시적으로 앞에 추가한다.

기존 (`scripts/train.py` 내부 `_build_leaf_table`):
```python
incident_cols = list(dict.fromkeys(
    case_cols + WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
))
incident_cols = [c for c in incident_cols if c in df.columns]
```

변경:
```python
# incident_id를 맨 앞에 두어 사례 식별이 명확하도록 함
incident_cols = list(dict.fromkeys(
    ["incident_id"] + case_cols + WEATHER_FEATURES + STORE_NUM_FEATURES + STORE_CAT_FEATURES
))
incident_cols = [c for c in incident_cols if c in df.columns]
```

- [ ] **Step 3: EMP 검증 기준 완화 (데이터량 제약 반영)**

`train_source` 끝부분의 assert 검증을 소스별로 분기한다.

기존:
```python
assert depth <= TREE_PARAMS["max_depth"], f"트리 깊이 초과: {depth}"
assert min_samples >= TREE_PARAMS["min_samples_leaf"], f"최소 사례 수 미달: {min_samples}"
assert has_incidents, "incidents 누락 리프 존재"
```

변경:
```python
# EMP는 데이터량(약 448건) 제약으로 리프 최소 15건까지 허용
min_required = 15 if source == "emp" else TREE_PARAMS["min_samples_leaf"]
assert depth <= TREE_PARAMS["max_depth"], f"트리 깊이 초과: {depth}"
assert min_samples >= min_required, (
    f"최소 사례 수 미달: {min_samples} (기대: {min_required}, 소스: {source})"
)
assert has_incidents, "incidents 누락 리프 존재"
# 리프 수 목표 범위 확인 (실패해도 경고만)
if not (8 <= n_leaves <= 20):
    print(f"  ⚠️ 리프 수 {n_leaves} — 목표 범위(8~20) 밖. max_depth 재조정 고려.")
```

- [ ] **Step 4: 재학습 실행**

Run:
```bash
conda run -n daiso python scripts/train.py
```

Expected:
- CUST: 트리 depth ≤ 7, 리프 10~20개, 리프당 최소 20건
- EMP: 트리 depth ≤ 7, 리프당 최소 15건
- `✅ 학습 + 산출물 생성 완료` 메시지

리프 수가 목표 범위(8~20) 밖이면 `max_depth`를 ±1 조정해 재실행.

- [ ] **Step 5: `leaf_table.json`에 `incident_id` 포함 확인**

Run:
```bash
conda run -n daiso python -c "import json; data=json.load(open('models/cust/leaf_table.json')); first_leaf=next(iter(data.values())); first_incident=first_leaf['incidents'][0]; print('incident_id' in first_incident); print(first_incident.get('incident_id'))"
conda run -n daiso python -c "import json; data=json.load(open('models/emp/leaf_table.json')); first_leaf=next(iter(data.values())); first_incident=first_leaf['incidents'][0]; print('incident_id' in first_incident); print(first_incident.get('incident_id'))"
```

Expected: `True` + `cust_XXXX`/`emp_XXXX` 형식 ID 출력

Run:
```bash
conda run -n daiso python -c "import json; m=json.load(open('models/cust/metadata.json')); print('CUST:', m['n_leaves'], '리프, 최소', m['leaf_min_samples'], '건')"
conda run -n daiso python -c "import json; m=json.load(open('models/emp/metadata.json')); print('EMP:', m['n_leaves'], '리프, 최소', m['leaf_min_samples'], '건')"
```

Expected: CUST 리프 10~20개 + 최소 20건 / EMP 리프 8~15개 + 최소 15건

- [ ] **Step 6: 커밋**

```bash
git add scripts/train.py models/cust/ models/emp/
git commit -m "feat(train): 하이퍼파라미터 조정(max_depth=7, min_samples_leaf=20) + incident_id 전파"
```

---

## Task 3: `core/risk.py` 삭제

**Files:**
- Delete: `core/risk.py`

**목표:** 근거 없는 위험 점수 산출 모듈 제거.

- [ ] **Step 1: 파일 삭제**

Run:
```bash
git rm core/risk.py
```

- [ ] **Step 2: `core/__init__.py`에서 `risk` 재-export 확인**

Run:
```bash
grep -n "risk" core/__init__.py || echo "no import found"
```

Expected: `no import found` (이미 안 쓰고 있으면 OK). import가 있으면 해당 줄 삭제.

- [ ] **Step 3: 커밋은 Task 4와 함께**

> `core/risk.py`를 단독 삭제하면 simulate/batch/notify가 임포트 실패로 깨짐. Task 4에서 호출부까지 제거한 뒤 함께 커밋한다.

---

## Task 4: `core/llm.py` 재작성 (시스템 프롬프트 + Tool Use + Mock 모드)

**Files:**
- Modify: `core/llm.py` (전면 재작성)

**목표:** Bedrock Converse API Tool Use로 구조화된 출력 강제, 시스템 프롬프트에 피처 사전 주입, Mock 모드를 신 스키마와 일치시킨다.

- [ ] **Step 1: 기존 `core/llm.py`를 아래 내용으로 전체 교체**

파일 전체를 다음으로 덮어쓴다:

```python
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
```

> **주의:** `generate_guide`의 시그니처가 변경되었다(`risk_info` 제거, `label_col` 추가). Task 5~6에서 호출부를 함께 수정해야 임포트가 깨지지 않는다.

- [ ] **Step 2: Mock 모드 스모크 테스트**

Run:
```bash
USE_MOCK_LLM=true conda run -n daiso python -c "
import json
from core.llm import generate_guide

leaf_data = json.load(open('models/cust/leaf_table.json'))
first_leaf = next(iter(leaf_data.values()))
store = {'매장명': '테스트매장', '지역': '서울', '형태': '직영점', '평수': 100, '매장인원': 5}
weather = {'temperature_2m_min': -3, 'precipitation_sum': 15, 'wind_speed_10m_max': 5}

guide = generate_guide(store, weather, first_leaf, '사고유형')
print(json.dumps(guide, ensure_ascii=False, indent=2))
print('---스키마 검증---')
assert '위험_요약' in guide
assert '주요_위험유형' in guide
assert '오늘의_특별_주의사항' in guide
assert '상시_주의사항' in guide
assert '오늘의_주의_사례' in guide
assert 3 <= len(guide['오늘의_주의_사례']) <= 5, f\"사례 수: {len(guide['오늘의_주의_사례'])}\"
print('✅ Mock 모드 스키마 OK')
"
```

Expected: 신 스키마 JSON 출력 + `✅ Mock 모드 스키마 OK`

> Task 4에서는 simulate/batch/notify가 아직 구 시그니처로 `generate_guide(store, weather, leaf_data, risk_info)`를 호출하므로 테스트 시 import 오류가 날 수 있다. 위 스모크는 `core.llm`만 직접 호출하므로 안전하다.

- [ ] **Step 3: 커밋은 Task 5에서 일괄 (위처럼 Task 3 `risk.py` 삭제와 묶어서)**

> `core/llm.py` 변경 후 simulate/batch/notify는 임포트 실패 상태. Task 5까지 마쳐야 통합적으로 빌드 가능. 이 Task 단독 커밋은 하지 않는다.

---

## Task 5: `core/risk.py` 완전 제거 + `lambdas/simulate/handler.py` 업데이트

**Files:**
- Delete: `core/risk.py` (Task 3에서 이미 `git rm`)
- Modify: `lambdas/simulate/handler.py`

**목표:** simulate 핸들러에서 `calculate_risk` 및 `risk_info` 관련 로직을 제거하고, LLM 신 시그니처에 맞게 호출을 수정하며, `_save_alert`의 요약 레코드를 신 스키마로 업데이트한다.

- [ ] **Step 1: import 제거**

`lambdas/simulate/handler.py` 상단 import 블록에서 다음 줄 삭제:
```python
from core.risk import calculate_risk
```

- [ ] **Step 2: `lambda_handler` 내 CUST/EMP 루프에서 risk 호출 제거**

기존 (`lambda_handler` 내부, `for source in SOURCES:` 루프):
```python
# 위험도 산출
leaf_summary = leaf_data.get("summary", {})
risk_info = calculate_risk(leaf_summary, total_incidents, label_col)

# LLM 안전 가이드 생성
guide = generate_guide(store, weather, leaf_data, risk_info)

# 결과 조립
matched_rule = leaf_data.get("rule", "")
incident_count = leaf_summary.get("total", 0)

results[source] = {
    "leaf_id": str(leaf_id) if leaf_id is not None else None,
    "fallback_level": fallback_level,
    "risk": risk_info,
    "guide": guide,
    "matched_rule": matched_rule,
    "incident_count": incident_count,
}
```

변경:
```python
# LLM 안전 가이드 생성 (신 시그니처: risk_info 제거, label_col 전달)
leaf_summary = leaf_data.get("summary", {})
guide = generate_guide(store, weather, leaf_data, label_col)

# 결과 조립
matched_rule = leaf_data.get("rule", "")
incident_count = leaf_summary.get("total", 0)

results[source] = {
    "leaf_id": str(leaf_id) if leaf_id is not None else None,
    "fallback_level": fallback_level,
    "guide": guide,
    "matched_rule": matched_rule,
    "incident_count": incident_count,
}
```

- [ ] **Step 3: `_save_alert`의 `summary_record` 스키마 업데이트**

기존:
```python
summary_record = {
    "store_code": store_code,
    "store_name": response_body.get("store_name", ""),
    "region": response_body.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": trigger_type,
    "risk_cust": cust_result.get("risk", {}).get("grade", ""),
    "risk_cust_score": cust_result.get("risk", {}).get("score", 0),
    "risk_emp": emp_result.get("risk", {}).get("grade", ""),
    "risk_emp_score": emp_result.get("risk", {}).get("score", 0),
    "dominant_type_cust": cust_result.get("risk", {}).get("dominant_type", ""),
    "dominant_type_emp": emp_result.get("risk", {}).get("dominant_type", ""),
    "detail_key": file_key,
}
```

변경:
```python
summary_record = {
    "store_code": store_code,
    "store_name": response_body.get("store_name", ""),
    "region": response_body.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": trigger_type,
    "주요_위험유형_cust": cust_result.get("guide", {}).get("주요_위험유형", ""),
    "주요_위험유형_emp": emp_result.get("guide", {}).get("주요_위험유형", ""),
    "detail_key": file_key,
}
```

- [ ] **Step 4: local_server로 Mock 통합 확인**

Run:
```bash
USE_MOCK_LLM=true conda run -n daiso python -c "
import json
from lambdas.simulate.handler import lambda_handler

event = {
    'httpMethod': 'POST',
    'body': json.dumps({'store_code': 10481, 'date': '2026-05-07'})
}
resp = lambda_handler(event, None)
body = json.loads(resp['body'])
print('status:', resp['statusCode'])
assert resp['statusCode'] == 200, body
assert 'results' in body
for src in ['cust', 'emp']:
    r = body['results'].get(src, {})
    assert 'risk' not in r, f'{src}에 risk 필드가 남아있음!'
    assert 'guide' in r
    g = r['guide']
    for k in ['위험_요약', '주요_위험유형', '오늘의_특별_주의사항', '상시_주의사항', '오늘의_주의_사례']:
        assert k in g, f'{src}.guide에 {k} 없음'
print('✅ simulate 신 스키마 OK')
print(json.dumps(body['results']['cust']['guide'], ensure_ascii=False, indent=2))
"
```

> `store_code` 10481이 `stores.json`에 존재하는지 먼저 확인. 없으면 `conda run -n daiso python -c "import json; stores=json.load(open('stores.json')); print(stores[0]['매장'])"`로 다른 코드 사용.

Expected: `✅ simulate 신 스키마 OK` + 각 소스별 guide JSON 출력, `risk` 필드 없음.

- [ ] **Step 5: 커밋 (Task 3 + Task 4 + Task 5 일괄)**

```bash
git add core/llm.py lambdas/simulate/handler.py
git commit -m "feat(llm): Tool Use 기반 구조화 출력 + risk 블록 제거"
```

> `core/risk.py`는 Task 3에서 `git rm`으로 staged 되어 있으므로 이 커밋에 포함된다.

---

## Task 6: `lambdas/batch/handler.py` + `lambdas/notify/handler.py` 업데이트

**Files:**
- Modify: `lambdas/batch/handler.py`
- Modify: `lambdas/notify/handler.py`

**목표:** batch/notify 핸들러의 risk 블록 제거, LLM 신 시그니처 호출, `_record_alert` 스키마와 메시지 본문 업데이트.

- [ ] **Step 1: `lambdas/batch/handler.py` import 제거**

제거:
```python
from core.risk import calculate_risk
```

- [ ] **Step 2: `lambdas/batch/handler.py` `_generate_store_guide` 수정**

기존 (`_generate_store_guide` 내부 `for source in SOURCES:` 루프 내):
```python
leaf_summary = leaf_data.get("summary", {})
risk_info = calculate_risk(leaf_summary, total_incidents, label_col)
guide = generate_guide(store, weather, leaf_data, risk_info)

results[source] = {
    "leaf_id": str(leaf_id) if leaf_id is not None else None,
    "fallback_level": fallback_level,
    "risk": risk_info,
    "guide": guide,
    "matched_rule": leaf_data.get("rule", ""),
    "incident_count": leaf_summary.get("total", 0),
}
```

변경:
```python
leaf_summary = leaf_data.get("summary", {})
guide = generate_guide(store, weather, leaf_data, label_col)

results[source] = {
    "leaf_id": str(leaf_id) if leaf_id is not None else None,
    "fallback_level": fallback_level,
    "guide": guide,
    "matched_rule": leaf_data.get("rule", ""),
    "incident_count": leaf_summary.get("total", 0),
}
```

- [ ] **Step 3: `lambdas/batch/handler.py` `_build_message_body` 업데이트**

기존:
```python
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [f"🏪 {store_name} 안전 가이드", f"📅 날짜: {date_str}", ""]
    for source in SOURCES:
        source_data = results.get(source, {})
        lines.append(f"━━ {SOURCE_LABEL.get(source, source.upper())} ━━")
        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
        else:
            guide = source_data.get("guide", {})
            lines.append(f"⚠️ {guide.get('위험_요약', '정보 없음')}")
            for tip in guide.get("안전_수칙", []):
                lines.append(f"  ☑️ {tip}")
        lines.append("")
    return "\n".join(lines)
```

변경:
```python
def _build_message_body(store_name: str, date_str: str, results: dict) -> str:
    lines = [f"🏪 {store_name} 안전 가이드", f"📅 날짜: {date_str}", ""]
    for source in SOURCES:
        source_data = results.get(source, {})
        lines.append(f"━━ {SOURCE_LABEL.get(source, source.upper())} ━━")
        if "error" in source_data:
            lines.append(f"  ❌ 오류: {source_data['error']}")
        else:
            guide = source_data.get("guide", {})
            lines.append(f"⚠️ {guide.get('위험_요약', '정보 없음')}")
            if guide.get("오늘의_특별_주의사항"):
                lines.append("  [오늘 특별 주의]")
                for item in guide["오늘의_특별_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
            if guide.get("상시_주의사항"):
                lines.append("  [상시 주의]")
                for item in guide["상시_주의사항"]:
                    lines.append(f"  ☑️ {item.get('수칙', '')}")
        lines.append("")
    return "\n".join(lines)
```

- [ ] **Step 4: `lambdas/batch/handler.py` `_record_alert`의 `summary_record` 스키마 업데이트**

기존:
```python
summary_record = {
    "store_code": store_code,
    "store_name": guide_result.get("store_name", ""),
    "region": guide_result.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": trigger_type,
    "channel": channel,
    "risk_cust": cust.get("risk", {}).get("grade", ""),
    "risk_cust_score": cust.get("risk", {}).get("score", 0),
    "risk_emp": emp.get("risk", {}).get("grade", ""),
    "risk_emp_score": emp.get("risk", {}).get("score", 0),
    "dominant_type_cust": cust.get("risk", {}).get("dominant_type", ""),
    "dominant_type_emp": emp.get("risk", {}).get("dominant_type", ""),
    "detail_key": file_key,
}
```

변경:
```python
summary_record = {
    "store_code": store_code,
    "store_name": guide_result.get("store_name", ""),
    "region": guide_result.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": trigger_type,
    "channel": channel,
    "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
    "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
    "detail_key": file_key,
}
```

- [ ] **Step 5: `lambdas/batch/handler.py` `lambda_handler`의 store_results 조립 블록 업데이트**

기존:
```python
store_results.append({
    "store_code": str(store_code),
    "store_name": store_name,
    "status": "success",
    "risk_cust": cust.get("risk", {}).get("grade", ""),
    "risk_emp": emp.get("risk", {}).get("grade", ""),
})
```

변경:
```python
store_results.append({
    "store_code": str(store_code),
    "store_name": store_name,
    "status": "success",
    "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
    "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
})
```

- [ ] **Step 6: `lambdas/notify/handler.py`에 동일 패턴 적용**

import 제거: `from core.risk import calculate_risk`

`_generate_store_guide` 내부 risk 블록 제거 (Task 6 Step 2와 동일 패턴).

`_build_message_body` 업데이트 (Task 6 Step 3과 동일).

`_record_alert`의 `summary_record` 스키마 업데이트:

기존 notify/handler.py:
```python
summary_record = {
    "store_code": store_code,
    "store_name": guide_result.get("store_name", ""),
    "region": guide_result.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": f"manual_send_{channel}",
    "channel": channel,
    "risk_cust": cust.get("risk", {}).get("grade", ""),
    "risk_cust_score": cust.get("risk", {}).get("score", 0),
    "risk_emp": emp.get("risk", {}).get("grade", ""),
    "risk_emp_score": emp.get("risk", {}).get("score", 0),
    "dominant_type_cust": cust.get("risk", {}).get("dominant_type", ""),
    "dominant_type_emp": emp.get("risk", {}).get("dominant_type", ""),
    "detail_key": file_key,
}
```

변경:
```python
summary_record = {
    "store_code": store_code,
    "store_name": guide_result.get("store_name", ""),
    "region": guide_result.get("region", ""),
    "date": date_str,
    "timestamp": datetime.now(KST).isoformat(timespec="seconds"),
    "trigger_type": f"manual_send_{channel}",
    "channel": channel,
    "주요_위험유형_cust": cust.get("guide", {}).get("주요_위험유형", ""),
    "주요_위험유형_emp": emp.get("guide", {}).get("주요_위험유형", ""),
    "detail_key": file_key,
}
```

`lambda_handler`의 store_results 블록에서 risk_cust/risk_emp를 주요_위험유형_cust/emp로 교체 (Task 6 Step 5와 동일 패턴).

- [ ] **Step 7: 통합 스모크 검증**

Run:
```bash
USE_MOCK_LLM=true conda run -n daiso python -c "
import json
from lambdas.notify.handler import lambda_handler

# stores.json에서 첫 매장 코드 추출
stores = json.load(open('stores.json'))
code = stores[0]['매장']

event = {
    'httpMethod': 'POST',
    'body': json.dumps({'store_codes': [code], 'date': '2026-05-07', 'channel': 'mock'})
}
resp = lambda_handler(event, None)
print('status:', resp['statusCode'])
body = json.loads(resp['body'])
print('summary:', body.get('summary'))
assert resp['statusCode'] == 200
print('✅ notify 신 스키마 OK')
"
```

Expected: `status: 200`, `summary: {'total': 1, 'success': 1, 'failed': 0}` (로컬에서 DAILY_BUCKET 미설정 시 '현황 기록 스킵' 로그 허용)

- [ ] **Step 8: 커밋**

```bash
git add lambdas/batch/handler.py lambdas/notify/handler.py
git commit -m "feat(lambda): batch/notify risk 블록 제거 + 신 가이드 스키마 반영"
```

---

## Task 7: `proj/src/components/tabs/alert/AlertMonitoring.jsx` 업데이트

**Files:**
- Modify: `proj/src/components/tabs/alert/AlertMonitoring.jsx`

**목표:** 위험등급(Badge/ScoreBar/필터/카운트) 제거, 신 가이드 스키마(오늘의 특별 주의사항 / 상시 주의사항 / 오늘의 주의 사례) 렌더링, 구 스키마 파일에 대한 안전한 폴백 유지.

- [ ] **Step 1: `RISK_META`, `RiskBadge`, `ScoreBar` 제거**

다음 두 컴포넌트 정의 전체를 파일에서 삭제:
```javascript
const RISK_META = { ... };

function RiskBadge({ grade }) { ... }
function ScoreBar({ score }) { ... }
```

관련 import 중 사용 안 하는 것도 정리:
- `SAFE_GREEN`, `ALERT_RED` 같은 import가 다른 곳에서 사용되지 않으면 제거

- [ ] **Step 2: `GuideSection` 컴포넌트 재작성**

기존 `GuideSection`을 다음으로 교체:

```javascript
function GuideSection({ type, label, result }) {
  const isCust = type === "CUST";
  const accentColor = isCust ? "#0891B2" : "#4F46E5";
  const bgClass = isCust ? "bg-sky-50 border-sky-100" : "bg-indigo-50 border-indigo-100";
  const guide = result?.guide || {};

  const special = guide["오늘의_특별_주의사항"] || [];
  const common = guide["상시_주의사항"] || [];
  const picks = guide["오늘의_주의_사례"] || [];
  const mainRisk = guide["주요_위험유형"] || "";
  const summary = guide["위험_요약"] || "";

  return (
    <div className={`rounded-xl border p-4 ${bgClass}`}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div
            className="w-6 h-6 rounded-md flex items-center justify-center text-white text-[10px] font-bold"
            style={{ background: accentColor }}
          >
            {type}
          </div>
          <span className="font-semibold text-stone-800 text-sm">{label}</span>
        </div>
        {mainRisk && (
          <span className="text-[11px] font-semibold text-stone-700 bg-white rounded-full px-2 py-0.5 border border-stone-200">
            {mainRisk}
          </span>
        )}
      </div>

      {summary && (
        <div className="text-xs font-semibold text-stone-700 bg-white rounded-lg px-3 py-2 border border-stone-200 mb-3">
          {summary}
        </div>
      )}

      {/* 오늘의 특별 주의사항 */}
      {special.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-red-700 mb-1.5">
            오늘의 특별 주의사항
          </div>
          <ul className="space-y-1.5">
            {special.map((item, i) => (
              <li key={i} className="bg-white rounded-lg px-3 py-2 border border-red-100">
                <div className="text-xs font-semibold text-stone-800">{item["수칙"]}</div>
                {item["관련_피처"] && (
                  <div className="text-[10px] text-red-600 mt-0.5 font-mono">
                    📊 {item["관련_피처"]}
                  </div>
                )}
                {item["근거_사례"] && (
                  <div className="text-[10px] text-stone-500 italic mt-0.5">
                    "{item["근거_사례"]}"
                  </div>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 상시 주의사항 */}
      {common.length > 0 && (
        <div className="mb-3">
          <div className="text-[11px] font-bold uppercase tracking-wide text-stone-600 mb-1.5">
            상시 주의사항
          </div>
          <ul className="space-y-1">
            {common.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-stone-700">
                <span
                  className="w-4 h-4 rounded-full text-white text-[9px] flex items-center justify-center flex-shrink-0 mt-0.5 font-bold"
                  style={{ background: accentColor }}
                >
                  {i + 1}
                </span>
                <span>
                  {item["수칙"]}
                  {item["근거_사례"] && (
                    <span className="text-stone-400 italic ml-1">"{item["근거_사례"]}"</span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 오늘의 주의 사례 (추후 이미지 자리) */}
      {picks.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wide text-amber-700 mb-1.5">
            오늘의 주의 사례
          </div>
          <ul className="space-y-1.5">
            {picks.map((pick, i) => (
              <li key={i} className="bg-amber-50 rounded-lg px-3 py-2 border border-amber-100">
                <div className="flex items-start gap-2">
                  <span className="text-[10px] font-mono text-amber-700 bg-white rounded px-1.5 py-0.5 border border-amber-200 flex-shrink-0">
                    {pick["incident_id"]}
                  </span>
                  <div className="flex-1">
                    <div className="text-xs text-stone-800">{pick["사고내용"]}</div>
                    {pick["선정_이유"] && (
                      <div className="text-[10px] text-stone-500 italic mt-0.5">
                        {pick["선정_이유"]}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result?.matched_rule && (
        <div className="text-[10px] text-stone-400 font-mono bg-stone-50 px-2 py-1 rounded mt-3">
          적용 규칙: {result.matched_rule}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: `AlertMonitoring` 함수에서 필터/카운트/테이블 컬럼 정리**

위험 등급 필터 상태 제거 및 카운트 위젯 교체. `AlertMonitoring` 함수 본문을 다음 패턴으로 수정:

1. `filter` 상태 및 관련 코드 삭제:
   ```javascript
   // 삭제
   const [filter, setFilter] = useState("all");
   const filtered = !result ? [] : filter === "all" ? result : result.filter(...);
   ```
   → 단순화:
   ```javascript
   const filtered = result || [];
   ```

2. `counts` 계산과 4-카드 위젯 제거. 대신 총 매장 수만 표시:
   ```javascript
   // 삭제
   const counts = result ? { total: ..., high: ..., medium: ..., low: ... } : null;
   {counts && ( <div className="grid grid-cols-2 sm:grid-cols-4 ...">...</div> )}
   ```
   → 단순화: 카운트 위젯 전체 제거. `{result && <span>{result.length}개 매장</span>}`는 이미 헤더에 있음.

3. 필터 탭 제거:
   ```javascript
   // 삭제
   <div className="flex gap-1 mb-3 border-b border-stone-100 pb-3">
     {[{id:"all",...},{id:"high",...},...].map(...)}
   </div>
   ```

4. 테이블 `<thead>`와 `<tbody>` 컬럼 교체:

   기존:
   ```jsx
   <thead>
     <tr className="border-b-2 border-stone-100 text-xs text-stone-400 uppercase">
       <th>매장</th>
       <th>지역</th>
       <th>발송 유형</th>
       <th>고객 위험도</th>
       <th>직원 위험도</th>
       <th>주 유형 (고객)</th>
       <th>주 유형 (직원)</th>
       <th>상세</th>
     </tr>
   </thead>
   ```

   변경:
   ```jsx
   <thead>
     <tr className="border-b-2 border-stone-100 text-xs text-stone-400 uppercase">
       <th className="text-left py-2 px-2 font-semibold">매장</th>
       <th className="text-left py-2 px-2 font-semibold">지역</th>
       <th className="text-center py-2 px-2 font-semibold">발송 유형</th>
       <th className="text-left py-2 px-2 font-semibold">주요 위험유형 (고객)</th>
       <th className="text-left py-2 px-2 font-semibold">주요 위험유형 (직원)</th>
       <th className="text-center py-2 px-2 font-semibold">상세</th>
     </tr>
   </thead>
   ```

   기존 `<tbody>`의 각 행:
   ```jsx
   <td className="py-2.5 px-2 text-center">
     <div className="flex flex-col items-center gap-1">
       <RiskBadge grade={s.risk_cust} />
       <ScoreBar score={s.risk_cust_score} />
     </div>
   </td>
   <td className="py-2.5 px-2 text-center">
     <div className="flex flex-col items-center gap-1">
       <RiskBadge grade={s.risk_emp} />
       <ScoreBar score={s.risk_emp_score} />
     </div>
   </td>
   <td className="py-2.5 px-2 text-xs text-stone-600">{s.dominant_type_cust || "—"}</td>
   <td className="py-2.5 px-2 text-xs text-stone-600">{s.dominant_type_emp || "—"}</td>
   ```

   변경:
   ```jsx
   <td className="py-2.5 px-2 text-xs text-stone-700">
     {s["주요_위험유형_cust"] || s.dominant_type_cust || "—"}
   </td>
   <td className="py-2.5 px-2 text-xs text-stone-700">
     {s["주요_위험유형_emp"] || s.dominant_type_emp || "—"}
   </td>
   ```

   > 구 스키마 파일(alerts/2026-05-04/index.json 등)이 `dominant_type_*`만 가지고 있을 수 있으므로 폴백을 유지한다.

   `colSpan` 업데이트:
   ```jsx
   <td colSpan={6} className="py-10 text-center text-stone-400 text-xs">
     매장 결과가 없습니다.
   </td>
   ```

- [ ] **Step 4: 프론트엔드 빌드 검증**

Run:
```bash
cd proj && npm run build
```

Expected: 빌드 성공(오류 없음). 경고는 허용.

> 빌드 실패 시 오류 메시지를 확인해 import 누락/미사용 변수를 정리.

- [ ] **Step 5: 로컬 확인 (선택)**

로컬에서 `local_server.py` 실행 후 프론트엔드 개발 서버(`cd proj && npm run dev`)를 띄워 `alerts/2026-05-05/index.json`(구 스키마)이 에러 없이 렌더링되는지 확인. 상세 모달은 구 스키마 파일에는 `오늘의_특별_주의사항` 등이 없으므로 그 영역이 빈 채로 표시되어야 한다.

> 긴 시간 실행되는 서버이므로 수동 검증이 어려우면 Step 4 빌드 통과만으로 진행.

- [ ] **Step 6: 커밋**

```bash
git add proj/src/components/tabs/alert/AlertMonitoring.jsx
git commit -m "feat(ui): 위험등급 UI 제거 + 신 가이드 스키마 렌더링"
```

---

## Task 8: End-to-End 검증 및 최종 커밋

**Files:**
- 실행 검증만 (파일 수정 없음)

**목표:** 전체 파이프라인이 Mock 모드로 정상 동작하는지 확인.

- [ ] **Step 1: simulate E2E (Mock 모드)**

Run:
```bash
USE_MOCK_LLM=true conda run -n daiso python -c "
import json
from lambdas.simulate.handler import lambda_handler

stores = json.load(open('stores.json'))
code = stores[0]['매장']
event = {'httpMethod': 'POST', 'body': json.dumps({'store_code': code, 'date': '2026-05-07'})}
resp = lambda_handler(event, None)
body = json.loads(resp['body'])
assert resp['statusCode'] == 200
for src in ['cust', 'emp']:
    r = body['results'][src]
    assert 'risk' not in r
    g = r['guide']
    assert 3 <= len(g['오늘의_주의_사례']) <= 5
    # incident_id 형식 검증
    for pick in g['오늘의_주의_사례']:
        assert pick['incident_id'].startswith(src + '_') or pick['incident_id'].startswith('mock_'), pick
print('✅ simulate E2E OK')
"
```

Expected: `✅ simulate E2E OK`

- [ ] **Step 2: batch E2E (Mock 모드, 로컬)**

batch 핸들러는 S3(MODELS_BUCKET) 필수이므로 로컬 E2E는 notify로 대체한다. 이미 Task 6 Step 7에서 notify E2E는 수행됨. 이 단계는 notify 재검증으로 갈음.

Run:
```bash
USE_MOCK_LLM=true conda run -n daiso python -c "
import json
from lambdas.notify.handler import lambda_handler
stores = json.load(open('stores.json'))
code = stores[0]['매장']
event = {'httpMethod': 'POST', 'body': json.dumps({'store_codes': [code], 'date': '2026-05-07', 'channel': 'mock'})}
resp = lambda_handler(event, None)
body = json.loads(resp['body'])
assert resp['statusCode'] == 200
assert body['summary']['success'] >= 1
print('✅ notify E2E OK')
"
```

Expected: `✅ notify E2E OK`

- [ ] **Step 3: 사이드 이펙트 확인 — 구 alerts 파일 로딩**

Run:
```bash
ls alerts/ 2>/dev/null | head -3
conda run -n daiso python -c "
import json, os
for d in sorted(os.listdir('alerts')):
    p = f'alerts/{d}/index.json'
    if os.path.exists(p):
        data = json.load(open(p))
        print(d, '→', len(data), '건')
"
```

Expected: 구 스키마 파일들이 존재하며, 프론트엔드가 `주요_위험유형_*`가 없어도 `dominant_type_*`로 폴백하도록 이미 구현되어 있음(Task 7 Step 3).

- [ ] **Step 4: 최종 커밋 (변경 잔여물 점검)**

Run:
```bash
git status
```

Expected: clean working tree. 변경사항이 남아 있으면 원인을 확인하고 별도 커밋.

- [ ] **Step 5: 작업 로그 커밋 (선택)**

필요 시 README/CHANGELOG 업데이트:
```bash
# (선택) 변경 요약을 README나 CHANGELOG에 기록 후
git add .
git commit -m "docs: LLM 가이드 고도화 완료 로그"
```

---

## 전체 요약

| Task | 산출물 | 검증 |
|------|--------|------|
| 1 | `build_dataset.py` + CSV에 `incident_id` | CSV 컬럼 존재, 유일성 |
| 2 | `train.py` 재학습, 리프 10~20개, `leaf_table.json`에 `incident_id` | metadata의 n_leaves, leaf_min_samples |
| 3+5 | `core/risk.py` 삭제 + `simulate` 수정 | simulate Mock 호출 200 OK |
| 4+5 | `core/llm.py` 전면 재작성(Tool Use) | 신 스키마 필드 전부 존재, 주의 사례 3~5건 |
| 6 | `batch` + `notify` 수정 | notify Mock 호출 200 OK |
| 7 | `AlertMonitoring.jsx` 신 스키마 | `npm run build` 성공 |
| 8 | E2E | simulate 및 notify 정상 |

---

## 비상 절차

### 재학습 결과가 목표 밖일 때
- CUST 리프 > 20개: `max_depth=6`으로 낮춰 재실행
- CUST 리프 < 10개: `max_depth=8`로 높이거나 `min_impurity_decrease=0.003`으로 완화
- EMP 최소 사례 < 15건: `min_samples_leaf=15`를 EMP 전용으로 조정(분기 필요)

### Bedrock Tool Use 호출 실패
- 모델이 toolChoice를 준수하지 않으면 `content` 블록에서 `toolUse`가 아닌 `text`만 돌아올 수 있음
- 이 경우 Mock fallback으로 전환됨(이미 구현). 로그 `[llm] Bedrock 호출 실패: ...`로 확인
- 모델 ID 변경이 필요하면 `.env`의 `BEDROCK_MODEL_ID` 조정

### 프론트엔드 빌드 실패
- 삭제한 심볼(`RiskBadge`, `ScoreBar`, `RISK_META`)이 다른 파일에서 참조되는지 확인
- `grep -r "RiskBadge\|ScoreBar\|RISK_META" proj/src`로 검색해 잔여 참조 제거

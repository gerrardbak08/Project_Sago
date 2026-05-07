# LLM 안전 가이드 고도화 — 설계 문서

**작성일**: 2026-05-07
**상태**: 승인됨
**관련 스펙**: `2026-04-28-daiso-safety-ai-design.md`

---

## 1. 목적 및 범위

### 1.1 배경

현재 시스템은 Decision Tree로 기상·매장 조건별 과거 사고 사례를 검색하고, LLM이 이를 바탕으로 안전 가이드를 생성한다. 운영해보니 세 가지 문제가 드러났다.

1. **리프 노드 크기 편차**: `max_depth=5`, `min_samples_leaf=5` 설정으로 리프당 사례 수가 5~621건까지 편차가 크고, 일부 리프는 LLM이 판단하기에 근거 사례가 부족하다. 동시에 리프 수가 7~8개로 적어 매장/기상 조건에 상관없이 비슷한 가이드가 반복된다.
2. **피처 맥락 부재**: LLM이 기상·매장 피처의 의미와 분포를 모른 채 수치만 보고 판단한다. 결과적으로 조건과 연관 있는 사고와 상시 부주의 사고를 구분하지 못한다.
3. **근거 없는 위험 점수**: `core/risk.py`가 임의 가중치(0.4/0.6)로 계산한 위험 점수가 대시보드에 노출되고 있다. 근거가 빈약하다.

### 1.2 목표

- **사례 검색 품질 향상**: 리프당 최소 20건(EMP는 15건) 확보
- **가이드 다양성**: 리프 수를 10~20개 범위로 조정해 매장·기상 조건별 차별화된 가이드 생성
- **LLM 판단력 강화**: 피처 설명과 판단 원칙을 시스템 프롬프트로 주입
- **출력 구조 개선**: "오늘의 특별 주의사항" / "상시 주의사항" / "오늘의 주의 사례"로 분리
- **이미지 매칭 기반 마련**: 사고 사례에 고유 ID 부여, LLM이 대표 사례 3~5건을 ID와 함께 반환
- **신뢰성 없는 점수 제거**: `risk` 블록 삭제

### 1.3 범위

**In Scope**
- `scripts/build_dataset.py`: 사고 사례에 `incident_id` 부여
- `scripts/train.py`: 하이퍼파라미터 재조정 + `incident_id` 전파
- `core/llm.py`: 시스템/유저 프롬프트 분리, Tool Use로 구조화 출력, Mock 모드 스키마 일치
- `core/risk.py`: 삭제
- `lambdas/simulate/handler.py`, `lambdas/batch/handler.py`, `lambdas/notify/handler.py`: risk 블록 제거, 새 가이드 스키마 반영
- `proj/src/components/tabs/alert/AlertMonitoring.jsx`: 위험등급 UI 제거, 신규 스키마 렌더링
- 재학습된 모델 산출물 교체

**Out of Scope**
- 트리 모델 알고리즘 교체 (Decision Tree 유지)
- 신규 데이터 피처 추가
- 이미지 생성 파이프라인 구축 (ID 매칭 기반만 준비)

---

## 2. 트리 모델 튜닝

### 2.1 하이퍼파라미터 변경

| 파라미터 | 현재 | 변경 | 근거 |
|---------|------|------|------|
| `max_depth` | 5 | **7** | 분할 여지 확대로 리프 10~20개 달성 |
| `min_samples_leaf` | 5 | **20** | LLM 판단에 필요한 최소 사례 수 확보 |
| `min_impurity_decrease` | 0.01 | **0.005** | 깊은 분할 허용 |
| `class_weight` | balanced | balanced | 유지 |
| `criterion` | gini | gini | 유지 |
| `random_state` | 42 | 42 | 유지 |

### 2.2 검증 기준

- CUST: 리프 수 10~20개, 리프당 최소 20건
- EMP: 리프 수 8~15개, 리프당 최소 15건 (데이터량 제약)
- 목표 미달 시 `max_depth` ±1 조정

### 2.3 기존 파이프라인 영향

- `leaf_table.json`, `siblings.json` 구조 변경 없음 → `rule_matcher.py` 그대로 동작
- `metadata.json`의 `hyperparameters` 필드만 갱신

---

## 3. incident_id 부여

### 3.1 ID 포맷

- CUST: `cust_0001`, `cust_0002`, ... (4자리 zero-padded)
- EMP: `emp_0001`, `emp_0002`, ...

### 3.2 부여 위치

- `scripts/build_dataset.py`에서 `incidents_cust.csv` / `incidents_emp.csv` 생성 시 소스별 순차 부여
- CSV에 `incident_id` 컬럼 추가
- `scripts/train.py`에서 `leaf_table.json`의 각 incident에 `incident_id` 포함

### 3.3 활용

- LLM이 "오늘의 주의 사례"를 선정할 때 `incident_id`와 함께 반환
- 추후 이미지 생성 파이프라인에서 동일 ID로 매칭 (예: `images/cust_0123.png`)

---

## 4. LLM 프롬프트 재설계

### 4.1 Bedrock Converse API 호출 구조

```python
client.converse(
    modelId=MODEL_ID,
    system=[{"text": SYSTEM_PROMPT}],
    messages=[{"role": "user", "content": [{"text": user_prompt}]}],
    toolConfig={
        "tools": [SAFETY_GUIDE_TOOL_SPEC],
        "toolChoice": {"tool": {"name": "generate_safety_guide"}},
    },
    inferenceConfig={"maxTokens": 2048, "temperature": 0.3},
)
# 응답: response["output"]["message"]["content"][0]["toolUse"]["input"]
```

Tool Use로 JSON Schema를 Bedrock 레벨에서 강제한다. 기존 `_parse_llm_json` 정규식 파싱은 제거한다.

### 4.2 시스템 프롬프트 구성 (고정, 요청별 동일)

1. **역할 정의**: 대형 유통매장 안전관리 전문가
2. **판단 원칙**:
   - 과거 사례를 두 범주로 구분
     - (a) 오늘의 기상·매장 환경과 명확히 연관된 사례 (예: 빗물 미끄러짐, 결빙 낙상, 강풍 전도)
     - (b) 조건 무관한 상시 부주의 사례 (예: 계단 넘어짐, 칼에 베임)
   - (a)는 "오늘의 특별 주의사항", (b)는 "상시 주의사항"으로 분리
   - 두 범주를 종합해 "오늘의 주의 사례" 3~5건을 선정
3. **피처 사전** — 18개 피처 각각 의미 + 단위 + 안전 연결고리
   - 기상 8개: `temperature_2m_min/max`, `precipitation_sum`, `snowfall_sum`, `rain_sum`, `wind_speed_10m_max`, `relative_humidity_2m_mean`, `soil_temperature_0_to_7cm_mean`
   - 매장 수치 9개: `평수`, `실평수`, `진열평수`, `창고`, `계약면적(㎡)`, `매장인원`, `입고도우미PO`, `일평균매출`, `일평균물동량`
   - 매장 범주 1개: `형태` (직영점/유통점/유통행사)

### 4.3 유저 프롬프트 구성 (요청별 동적)

```
## 오늘의 조건
- 날짜: {date}
- 매장: {매장명} ({지역}, {형태}, {평수}평)
- 매장 특성: 매장인원 N명, 일평균매출 M원, 일평균물동량 K박스, ...
- 기상: 최저기온 X°C, 최고기온 Y°C, 강수량 Zmm, 풍속 Wm/s, ...

## 유사 조건 과거 사고 사례 (리프 규칙: {rule}, 총 {total}건)
- 사고유형 분포: {분포}
- 원인/장소 분포: {분포}
- 전체 사례 (incident_id | 사고내용):
  - cust_0123 | 입구에서 빗물에 미끄러져 넘어짐
  - cust_0456 | 계단에서 발을 헛디뎌 넘어짐
  - ...

## 지시
위 사례를 오늘 조건과 연관된 것/상시 부주의로 분류하고, 각 범주별 안전 수칙을 작성하라.
두 범주를 종합해 오늘 특히 주의해야 할 대표 사례 3~5개를 incident_id와 함께 선정하라.
```

### 4.4 출력 JSON Schema (Tool Input Schema)

```json
{
  "type": "object",
  "properties": {
    "위험_요약": {
      "type": "string",
      "description": "오늘의 위험 상황 한 줄 요약"
    },
    "주요_위험유형": {
      "type": "string",
      "description": "예: 낙상(우천), 전도(강풍)"
    },
    "오늘의_특별_주의사항": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "수칙": { "type": "string" },
          "근거_사례": { "type": "string" },
          "관련_피처": {
            "type": "string",
            "description": "예: precipitation_sum=15mm"
          }
        },
        "required": ["수칙", "근거_사례", "관련_피처"]
      }
    },
    "상시_주의사항": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "수칙": { "type": "string" },
          "근거_사례": { "type": "string" }
        },
        "required": ["수칙", "근거_사례"]
      }
    },
    "오늘의_주의_사례": {
      "type": "array",
      "minItems": 3,
      "maxItems": 5,
      "description": "이미지 매칭을 위해 선정된 오늘의 대표 사고 사례",
      "items": {
        "type": "object",
        "properties": {
          "incident_id": { "type": "string" },
          "사고내용": { "type": "string" },
          "선정_이유": { "type": "string" }
        },
        "required": ["incident_id", "사고내용", "선정_이유"]
      }
    },
    "추가_참고": { "type": "string" }
  },
  "required": [
    "위험_요약",
    "주요_위험유형",
    "오늘의_특별_주의사항",
    "상시_주의사항",
    "오늘의_주의_사례"
  ]
}
```

### 4.5 Mock 모드

Bedrock 호출이 불가능한 환경(로컬 개발, 자격증명 없음)에서도 동일 스키마를 생성한다.

- 기상 조건 기반 규칙으로 "오늘의 특별 주의사항" 구성 (우천 → 미끄럼, 영하 → 결빙 등)
- 리프의 사례 중 상위 3~5건을 `오늘의_주의_사례`로 선정 (incident_id 그대로 전달)
- 나머지는 "상시 주의사항"으로 분류

---

## 5. risk 블록 제거

### 5.1 삭제 대상

- `core/risk.py` 파일
- `lambdas/simulate/handler.py`의 `calculate_risk` import 및 호출
- 응답 스키마의 `results.{cust,emp}.risk` 필드

### 5.2 대체 방안

- "주요 위험유형" 표시는 LLM이 반환하는 `guide.주요_위험유형`을 직접 사용
- `index.json`의 요약 레코드 변경
  - 제거: `risk_cust`, `risk_cust_score`, `risk_emp`, `risk_emp_score`, `dominant_type_cust`, `dominant_type_emp`
  - 추가: `주요_위험유형_cust`, `주요_위험유형_emp` (LLM `guide.주요_위험유형` 값)
- 변경된 요약 레코드 최종 스키마:
  ```json
  {
    "store_code": "...",
    "store_name": "...",
    "region": "...",
    "date": "...",
    "timestamp": "...",
    "trigger_type": "...",
    "주요_위험유형_cust": "...",
    "주요_위험유형_emp": "...",
    "detail_key": "..."
  }
  ```

### 5.3 기존 alerts 데이터 호환

- `alerts/**/index.json`의 구 스키마 파일은 그대로 유지
- 프론트엔드는 optional chaining과 기본값으로 구/신 스키마 모두 처리

---

## 6. 파일별 변경 요약

| 파일 | 변경 내용 |
|------|-----------|
| `scripts/build_dataset.py` | 사고 사례에 `incident_id` 컬럼 추가 |
| `scripts/train.py` | 하이퍼파라미터 조정, `leaf_table.json` incident에 `incident_id` 포함 |
| `core/llm.py` | 시스템/유저 프롬프트 분리, Tool Use 호출, Mock 모드 스키마 일치 |
| `core/risk.py` | 삭제 |
| `lambdas/simulate/handler.py` | `calculate_risk` 제거, 응답에서 `risk` 필드 제거 |
| `lambdas/batch/handler.py` | `index.json` 요약에서 risk 필드 제거, `주요_위험유형`으로 대체 |
| `lambdas/notify/handler.py` | 동일 (저장 스키마 일관성 유지) |
| `proj/src/components/tabs/alert/AlertMonitoring.jsx` | RiskBadge/ScoreBar/등급 필터/등급 요약 제거, 신규 가이드 스키마 렌더링 (오늘의 특별 주의사항 / 상시 주의사항 / 오늘의 주의 사례 3영역) |
| `models/cust/`, `models/emp/` | 재학습 산출물로 교체 |

---

## 7. 데이터 흐름 변경

### Before

```
simulate
  → rule_matcher
  → risk.py (score/grade/dominant_type)
  → llm.py (flat 안전_수칙)
  → response: {
      weather,
      results: {
        cust: { risk, guide, leaf_id, matched_rule, incident_count },
        emp:  { ... }
      }
    }
```

### After

```
simulate
  → rule_matcher
  → llm.py (Tool Use, 구조화 출력)
  → response: {
      weather,
      results: {
        cust: { guide, leaf_id, matched_rule, incident_count },
        emp:  { ... }
      }
    }
    guide = {
      위험_요약, 주요_위험유형,
      오늘의_특별_주의사항[], 상시_주의사항[],
      오늘의_주의_사례[], 추가_참고
    }
```

---

## 8. 테스트 전략

- **학습 검증**: `scripts/train.py` 실행 후 리프 10~20개, 리프당 최소 20건(EMP 15건) 확인. 기존 assert 보강.
- **Mock 단위 검증**: `core/llm.py`의 Mock 출력이 신규 스키마 필드를 모두 포함하고 `오늘의_주의_사례`가 3~5건이어야 함.
- **Simulate 통합**: `local_server.py` 경유로 Mock 모드 End-to-end 확인.
- **Bedrock 실호출**: 샘플 매장 1건으로 수동 검증 (Tool Use 호출 정상 동작 + 출력 스키마 준수).
- **프론트 수동 확인**: 구 alerts 파일(구 스키마)과 신 alerts 파일(신 스키마) 모두 에러 없이 렌더링되는지 확인.

---

## 9. 마이그레이션

- 기존 `alerts/**/index.json` 및 상세 파일은 구 스키마 유지
- 프론트엔드는 optional chaining/기본값으로 안전 처리
- 신규 배치/수동 실행부터 새 스키마로 저장
- 재학습된 모델은 `deploy.sh`를 통해 S3에 업로드

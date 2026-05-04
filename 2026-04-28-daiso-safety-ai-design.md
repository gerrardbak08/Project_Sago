# 다이소 매장 안전사고 예방 AI 시스템 — 설계 문서

**작성일**: 2026-04-28
**수정일**: 2026-05-04
**상태**: 승인됨 (v2)

---

## 1. 개요

기상 + 과거 사고 데이터 분석 기반 선제적 안전 알림 시스템. Decision Tree로 기상/매장 조건별 사고 사례 그룹을 자동 탐색하고, Bedrock LLM으로 맞춤형 안전 가이드를 생성한다.

**목표**: 전년도 112건 산업재해 10% 이상 절감, 중대재해 0건 달성.

---

## 2. 전체 아키텍처

```
[오프라인 — 로컬 1회 + 주기적 재구축]
  data/*.xlsx
    → scripts/build_dataset.py (pandas)
    → data/processed/stores.csv, incidents_cust.csv, incidents_emp.csv
    → scripts/train.py
    → models/{cust,emp}/*.json
  산출물 S3 업로드

[온라인 — Lambda]
  simulate:  매장+날짜 → 기상 API → rule_matcher → LLM → 안전 가이드

[배치 — 매일 아침 EventBridge → batch-orchestrator Lambda]
  전체 매장 순회 → simulate 호출 → SES 이메일 발송 + 결과 S3 저장

[프론트엔드 — S3 정적 호스팅]
  탭 1: 알림 발송 현황 모니터링
  탭 2: 수동 알림 생성 (simulate API 호출)
```

---

## 3. 프로젝트 구조

```
unicorn_gym_v4/
├── data/                          # 원본 엑셀 (git 추적 안 함)
│   └── processed/                 # 전처리 결과 CSV
├── models/
│   ├── cust/                      # CUST Decision Tree 산출물
│   └── emp/                       # EMP Decision Tree 산출물
├── scripts/
│   ├── build_dataset.py           # 전처리 파이프라인
│   └── train.py                   # Decision Tree 학습
├── core/
│   ├── rule_matcher.py            # 리프 노드 매칭 (순수 Python)
│   ├── weather.py                 # Open-Meteo API 클라이언트
│   ├── risk.py                    # 위험도 산출
│   └── llm.py                     # Bedrock LLM 호출 + Mock
├── lambdas/
│   ├── simulate/handler.py        # POST /api/simulate
│   └── batch/handler.py           # 매일 아침 배치 오케스트레이터
├── frontend/
│   ├── index.html                 # 메인 UI (2탭)
│   ├── css/
│   └── js/
├── infra/
│   └── main.tf                    # Terraform
├── local_server.py                # 로컬 개발 서버 (Lambda 핸들러 래퍼, 프로덕션 미포함)
├── tests/
└── requirements.txt
```

---

## 4. 오프라인 파이프라인

### 4.1 build_dataset.py — 4단계 전처리

데이터베이스 없이 pandas + CSV로 처리. SQLite 사용하지 않음.

**Step 1: 매장 지오코딩 + 인원현황/매출 통합**
- `매장리스트_260408.xlsx` → pandas DataFrame
- `신주소` → 카카오 지오코딩 API (`KAKAO_REST_API_KEY` 환경변수) → 위도/경도
- 이미 처리된 매장 스킵 (증분 처리)
- `직영점_인원현황DB.xlsx`, `유통점_인원현황DB.xlsx` → 조직코드 기준 merge
  - 추출 컬럼: TO, 합산PO, 입고도우미PO, 매장PO, 정규, 임시, 파트
  - 파생 컬럼: 매장인원 = 합산PO, 정규비율 = 정규 / 합산PO
- `직영점_일매출_평균.xlsx` → 매장코드 기준 merge
  - 추출 컬럼: 일평균매출(일평균), 일평균물동량(배송 박스 수)
  - 유통점은 일매출 데이터 없음 → NaN 허용
- 출력: `data/processed/stores.csv`

**Step 2: 사고 데이터 정제 + 매장 매칭**
- `고객사고DB.xlsx` → 매장명으로 stores.csv와 merge → 위경도 + 인원/매출 연결
- `직원사고DB.xlsx` → 동일
- 위경도 없는 매장의 사고 건은 스킵
- CUST 오타 정제: "중돌"→"충돌", "낙성"→"낙상", "추락"→"낙상"
- 출력: `data/processed/incidents_cust.csv`, `data/processed/incidents_emp.csv`

**Step 3: 기상 데이터 수집**
- incidents의 (위도, 경도, 발생일) 조합별 Open-Meteo Historical API 호출
- 사고 발생일의 기상 데이터만 수집
- **핵심 기상 8개 컬럼만 수집** (아래 피처 목록 참조)
- incidents CSV에 기상 컬럼 추가 (조인 완료된 최종 CSV)
- 이미 수집된 건 스킵 (증분 처리)
- 429 응답 시 지수 백오프 재시도 (최대 3회)

**Step 4: 핵심 피처만 남기고 정리**
- 최종 CSV에서 트리 학습에 사용할 피처 + 사고 사례 표시용 컬럼만 남김
- 불필요한 중간 컬럼, 사후 정보 컬럼(처리과정, 처리결과, 보상금액 등) 제거

### 4.2 train.py — Decision Tree 학습

**입력**: `data/processed/incidents_cust.csv`, `incidents_emp.csv`

**피처 (X) — 18개**:

기상 (8개):
| 피처 | 설명 | 선정 근거 |
|------|------|-----------|
| temperature_2m_min | 최저기온 | 영하 여부 → 낙상/재물 사고 강한 상관 (V=0.127) |
| temperature_2m_max | 최고기온 | 폭염 여부 → EMP 사고 강한 상관 (V=0.300) |
| precipitation_sum | 일강수량 | 비 오는 날 낙상 42%→52% |
| snowfall_sum | 적설량 | 눈 오는 날 충돌 2배 증가 |
| rain_sum | 강우량 | 비/눈 구분용 |
| wind_speed_10m_max | 최대풍속 | 간판/적재물 관련 사고 |
| relative_humidity_2m_mean | 평균습도 | 바닥 미끄러움 관련 |
| soil_temperature_0_to_7cm_mean | 지면온도 | 결빙 판단 |

매장 연속형 (9개):
| 피처 | 설명 | 선정 근거 |
|------|------|-----------|
| 평수 | 매장 전체 면적 | 매장 규모 |
| 실평수 | 실제 사용 면적 | 매장 밀집도 |
| 진열평수 | 진열 면적 | 고객 동선 밀집도 |
| 창고 | 창고 면적 | 직원 작업 공간 |
| 계약면적(㎡) | 계약 면적 | 매장 규모 보조 |
| 매장인원 | 총 근무 인원 (합산PO) | 인력 규모 |
| 입고도우미PO | 입고 작업 인력 | 입고 작업량 → 직원 사고 직결 |
| 일평균매출 | 일 평균 매출액 | 매장 혼잡도 프록시 |
| 일평균물동량 | 일 평균 배송 박스 수 | 물류 작업량 → 직원 사고 직결 |

매장 범주형 (1개):
| 피처 | 설명 | 선정 근거 |
|------|------|-----------|
| 형태 | 직영점/유통점/유통행사 | 매장형태별 사고 패턴 차이 (V=0.120) |

**라벨 (y)** — 분기 기준 전용 (예측 목적 아님):
- CUST: 사고유형 (5종)
- EMP: 재해 유형 (7종)

**하이퍼파라미터**:
```python
DecisionTreeClassifier(
    max_depth=5,              # 트리 깊이 제한 → 리프 최대 32개, 해석 가능성 유지
    min_samples_leaf=5,       # 리프 노드 최소 5건 보장
    min_impurity_decrease=0.01,  # 불순도 감소 미미한 분기 차단 → 과적합 방지
    class_weight='balanced',  # 소수 사고유형도 분기에 반영 (EMP 넘어짐 편중 보정)
    criterion='gini',         # 사고유형 분포 차이 기준
    random_state=42,
)
```

**하이퍼파라미터 선정 근거**:
- `max_depth=5`: 깊이 5면 최대 32개 리프. 1,918건 데이터에서 과적합 없이 의미 있는 분기 가능
- `min_samples_leaf=5`: 리프당 최소 5건 보장. 10건보다 세밀한 분기 허용하되 극단적 소수 방지
- `min_impurity_decrease=0.01`: Gini 감소가 1% 미만인 분기는 노이즈로 간주하여 차단
- `class_weight='balanced'`: EMP 447건 중 '넘어짐'이 과반 → 소수 유형(베임, 떨어짐 등)도 분기 기준에 반영

**산출물** (`models/{cust,emp}/`):
| 파일 | 용도 | Lambda 서빙 |
|------|------|------------|
| leaf_table.json | 리프별 규칙 + 사고 통계 + 사례 리스트 | ✅ |
| metadata.json | 피처명, 총 사고 건수, 리프 통계 | ✅ |
| encoder_map.json | 범주형 피처 인코딩 매핑 | ✅ |
| siblings.json | 부모 노드 롤업용 형제 리프 매핑 | ✅ |
| tree.pkl, encoder.pkl 등 | 학습/평가용 | ❌ |

---

## 5. Lambda 서빙

### 5.1 공통

- Python 3.12, Lambda Layer로 `core/` 모듈 공유
- 콜드 스타트 시 S3에서 JSON 로드 → 메모리 캐싱
- 모든 응답 JSON, CORS 헤더 포함
- sklearn 의존성 없음 (rule_matcher는 순수 Python)

### 5.2 simulate Lambda

```
POST /api/simulate
Body: { "store_code": 1234, "date": "2026-04-28" }

1. stores.json에서 매장 정보 조회
2. Open-Meteo API로 기상 데이터 조회 (날짜 기반 자동 선택: 과거 vs 예보)
3. rule_matcher로 leaf_table.json 매칭
4. 매칭 실패 시 siblings.json으로 부모 노드 롤업
5. 위험도 산출 (frequency_score + concentration_score, 0~100)
6. Bedrock Claude로 안전 가이드 생성 (Mock 모드 지원)
7. 응답 반환
```

**위험도 등급**: high(≥70), medium(≥50), low(<50)

**LLM**: Bedrock Claude Sonnet 4 (us-east-1). `USE_MOCK_LLM=true` 또는 자격증명 없으면 Mock 자동 전환.

### 5.3 batch-orchestrator Lambda

```
EventBridge 트리거: 매일 06:00 KST (cron(0 21 * * ? *) UTC)

1. S3에서 stores.json 로드
2. 전체 매장 순회 → simulate Lambda 호출 (invoke)
3. 결과 수집 → S3 저장: s3://bucket/daily/{date}/results.json
4. 매장별 안전 가이드를 AWS SES로 이메일 발송
   - 수신자: 매장 담당자 이메일 (stores.json에 포함)
   - 발신자: 안전관리팀 공용 이메일
5. 발송 결과(성공/실패, 매장별 위험도 등) S3 저장 → 모니터링 UI에서 조회
```

### 5.4 Fallback 전략

```
Level 0: 리프 노드 매칭 (rule_matcher) — 대부분 여기서 해결
Level 1: 부모 노드 롤업 (siblings.json) — 형제 노드 사례 포함
Level 2: 글로벌 Fallback — 전체 빈도 상위 유형 + 범용 안전 수칙
```

---

## 6. 프론트엔드

S3 정적 호스팅. 바닐라 HTML/CSS/JS. 빌드 도구 없음.

### 6.1 탭 1: 알림 발송 현황 모니터링

S3에 저장된 배치 결과 JSON을 fetch해서 표시.

| 영역 | 내용 |
|------|------|
| 날짜 선택 | 조회할 배치 날짜 선택 |
| 발송 요약 | 총 발송 수, 성공/실패 건수, 위험도별 분포 |
| 매장별 결과 테이블 | 매장명, 위험도 등급, 발송 상태, 주요 사고유형 |
| 상세 보기 | 행 클릭 시 해당 매장의 안전 가이드 전문 표시 |

### 6.2 탭 2: 수동 알림 생성

매장/날짜 선택 → simulate API 호출 → 결과 표시.

| 영역 | 내용 |
|------|------|
| 입력 패널 | 매장 검색 (자동완성), 날짜 선택, 생성 버튼 |
| 메타 정보 | 위험도 점수/등급, 매칭 리프 ID, Fallback 레벨 |
| 안전 가이드 | 생성된 안전 가이드 전문 표시 |
| 이메일 발송 | 결과 확인 후 SES로 수동 발송 버튼 |

---

## 7. 인프라 (Terraform)

### 7.1 AWS 리소스

| 리소스 | 이름 | 용도 |
|--------|------|------|
| S3 | daiso-safety-frontend | 정적 웹 호스팅 (HTML/CSS/JS) |
| S3 | daiso-safety-models | 모델 산출물 + stores.json (프라이빗) |
| S3 | daiso-safety-daily | 배치 결과 저장 (프라이빗) |
| Lambda | daiso-simulate | POST /api/simulate |
| Lambda | daiso-batch-orchestrator | EventBridge 배치 + SES 발송 |
| Lambda Layer | daiso-core | core/ 모듈 공유 |
| API Gateway | HTTP API | simulate Lambda 라우팅 + CORS |
| EventBridge | 매일 06:00 KST | batch-orchestrator Lambda 트리거 |
| SES | 이메일 발송 | 안전 가이드 이메일 전송 |
| IAM | Lambda 실행 역할 | S3 R/W, Bedrock 호출, SES 발송, CloudWatch 로그 |

### 7.2 Lambda 설정

| Lambda | 메모리 | 타임아웃 | 비고 |
|--------|--------|----------|------|
| simulate | 512MB | 60초 | LLM 호출 포함 |
| batch-orchestrator | 256MB | 900초 | 전체 매장 순회 + SES 발송 |

---

## 8. 로컬 개발 서버

프로덕션은 S3 정적 호스팅 + API Gateway → Lambda 구조이지만, 로컬 개발/테스트 시에는 Lambda가 없다. 이를 위해 Python 표준 라이브러리 `http.server`를 확장한 경량 로컬 서버(`local_server.py`)를 별도 파일로 제공한다.

**핵심 원칙:**
- Lambda 핸들러 코드에 일절 영향을 주지 않는 별도 파일
- 이미 구현된 Lambda 핸들러의 `lambda_handler(event, context)`를 그대로 호출하는 얇은 HTTP 래퍼
- 외부 프레임워크 의존성 없음 (순수 Python `http.server` 기반)
- 프론트엔드 정적 파일 서빙 + API 라우팅만 담당

**동작 방식:**
```
local_server.py
  ├── GET /api/* → Lambda 핸들러의 lambda_handler(event, context) 호출
  ├── POST /api/* → Lambda 핸들러의 lambda_handler(event, context) 호출
  └── 그 외 → frontend/ 디렉토리에서 정적 파일 서빙
```

**실행:**
```bash
python local_server.py  # http://localhost:8000
```

---

## 9. 구현 순서

접근 A: 오프라인 먼저, 온라인 나중에.

1. **오프라인 파이프라인**: build_dataset.py → train.py
2. **서빙 로직**: core/ 모듈 (rule_matcher, weather, risk, llm)
3. **Lambda**: simulate + batch-orchestrator 핸들러
4. **로컬 개발 서버**: local_server.py (Lambda 핸들러를 로컬에서 테스트)
5. **프론트엔드**: 알림 모니터링 + 수동 알림 생성 UI
6. **인프라**: Terraform으로 AWS 리소스 배포
7. **E2E 테스트**: 전체 파이프라인 검증

---

## 10. 이번 스코프에서 제외

- 카카오톡 알림톡 실제 발송 연동 (비즈니스 채널 미확보)
- 피드백 루프 (사고 추이 모니터링, 근로자 설문)
- 근로자 근무 정보 연동

---

## 11. 수용 기준

| ID | 기준 | 검증 방법 |
|----|------|-----------|
| AC-1 | 전처리 파이프라인이 원본 엑셀에서 CSV를 정상 생성한다 (인원현황+매출 포함) | stores/incidents CSV 건수 + 인원/매출 컬럼 NOT NULL 확인 |
| AC-2 | 카카오 지오코딩으로 매장 위경도가 정상 확보된다 | stores.csv 위도 NOT NULL 비율 > 95% |
| AC-3 | Open-Meteo Historical API로 사고 건별 핵심 기상 8개 컬럼이 수집된다 | incidents CSV 기상 컬럼 NOT NULL 확인 |
| AC-4 | Decision Tree 리프 노드 최소 사례 수 ≥ 5건 | min(leaf_sizes) >= 5 |
| AC-5 | rule_matcher가 sklearn tree.apply()와 동일한 리프에 매칭 | 학습 데이터 전수 비교 테스트 |
| AC-6 | simulate Lambda가 안전 가이드 JSON을 정상 반환 | 샘플 10건 호출 → 스키마 검증 |
| AC-7 | 알림 모니터링 UI가 배치 결과를 정상 표시 | 배치 결과 JSON → 테이블 렌더링 확인 |
| AC-8 | 수동 알림 생성 UI가 simulate API 호출 후 결과 표시 | 매장+날짜 입력 → 안전 가이드 렌더링 확인 |
| AC-9 | batch-orchestrator가 전체 매장 순회 후 SES 이메일 발송 | SES 발송 로그 + S3 결과 파일 확인 |
| AC-10 | Terraform으로 전체 인프라가 정상 배포된다 | terraform apply 성공 |

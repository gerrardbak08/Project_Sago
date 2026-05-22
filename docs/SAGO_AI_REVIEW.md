# SAGO AI 코드 리뷰 및 개선 제안

> 본 문서는 `docs/SAGO_AI_OVERVIEW.md` 소개서와 실제 코드(`core/`, `lambdas/`, `models/`, `infra/`, `processed/`)를 대조해 발견한 불일치, 잠재 리스크, 개선 우선순위를 정리한 것입니다.
> 다른 개발자가 단독으로 읽고도 작업을 시작할 수 있도록 파일 경로와 라인 번호를 함께 표기했습니다.

---

## 1. 검증 방법

- 소개서(`docs/SAGO_AI_OVERVIEW.md`)의 주장을 항목별로 추출
- 다음 산출물을 직접 읽어 대조
  - `models/{cust,emp}/metadata.json` — 학습 결과 메타
  - `processed/incidents_{cust,emp}.csv` — 사고 사례
  - `core/notifier.py`, `core/rule_matcher.py`, `core/llm.py`
  - `lambdas/notify/handler.py`, `lambdas/alerts/handler.py`, `lambdas/batch/handler.py`
  - `infra/main.tf`
- 일치 / 불일치 / 빠진 부분 / 잠재 리스크로 분류

---

## 2. 일치 확인 (문서가 정확한 부분)

| 영역 | 확인 결과 |
|---|---|
| 피처 18개 구성 (기상 8 + 매장 수치 9 + 범주 1) | `models/cust/metadata.json` `feature_names` 일치 |
| CUST 1,481건 · 56 leaves | `metadata.json` `total_incidents:1481, n_leaves:56` |
| EMP 448건 · 23 leaves | `metadata.json` `total_incidents:448, n_leaves:23` |
| 런타임 sklearn 의존성 제거 | `core/rule_matcher.py`에 sklearn import 없음, JSON 트리만 실행 |
| Lambda 3종 (notify / alerts / batch) | `lambdas/` 디렉토리 구조 일치 |
| Terraform 리소스 정의 | `infra/main.tf` — frontend/models/daily S3 버킷, 3 Lambda + Function URL, EventBridge, Lambda Layer, IAM 모두 존재 |
| Open-Meteo 기상 8피처 | `core/weather.py` 일치 |
| 데이터셋 4종 산출물 | `processed/incidents_cust.csv`, `incidents_emp.csv`, `stores.csv`, `weather.csv` |
| Tool Use 결과 한글 키 번역 | `core/llm.py` `_translate_response()` 존재 |

소개서의 골격은 코드와 거의 일치합니다. 아래는 보완이 필요한 부분만 정리합니다.

---

## 3. 문서 ↔ 코드 불일치

### 3.1 카카오 발송은 `core/notifier.py`가 아니라 notify Lambda에 인라인

- **소개서 표현**: 7절에서 "카카오 친구 메시지 API로 발송"이라고만 기술되어, 채널 추상화(`core/notifier.py`) 흐름으로 읽힘.
- **실제 코드**:
  - `core/notifier.py:78` `KakaoNotifier.send()` → `NotImplementedError`
  - `lambdas/notify/handler.py:257` `_upload_kakao_image()`, `:293` `_build_kakao_template()`, `:336` `_send_kakao_friend_message()` 가 직접 카카오 API 호출
- **영향**: batch Lambda(`lambdas/batch/handler.py`)는 이 코드를 재사용할 수 없어 현재 발송 로직이 비어 있음.
- **조치**: 카카오 함수들을 `core/notifier.py`의 `KakaoNotifier`로 이전 후 두 Lambda에서 공유하도록 리팩터.

### 3.2 EMP 모델 분류 성능이 매우 낮음 (문서에 미언급)

- `models/emp/metadata.json`
  - `accuracy: 0.0555`, `f1_macro: 0.0439`
  - 라벨 분포: `사망:1, 질병(뇌출혈 등):2, 깔림:9, 끼임:12, 질병(만성):10` 등 13개 클래스 중 절반이 한 자릿수
- **참고**: 소개서는 트리를 "사례 검색용 인덱스"로 정당화하고 있어 라벨 정확도가 핵심 KPI는 아니나, 외부에 보여줄 자료라면 이 수치가 어떤 한계와 어떻게 연결되는지 한 단락 추가가 필요.
- 참고로 CUST 모델은 `accuracy 0.263, f1_macro 0.236` — 5개 클래스로 정규화돼 분기 신호가 더 살아 있음.

### 3.3 사소한 표기 불일치

| 항목 | 문서 | 실제 |
|---|---|---|
| 면적 컬럼명 | `계약면적` | `계약면적(㎡)` (피처 키) |
| `형태` 인코딩 순서 | "유통점, 유통행사, 직영점 순" 박제 | sklearn LabelEncoder 결과이므로 `encoder_map.json` 기준으로 표현해야 안전 |
| EMP 베스트 하이퍼파라미터 | 후보 범위만 기술 | 실제 선택값은 `criterion=gini, max_depth=15, min_samples_leaf=15` (CUST는 entropy) |

### 3.4 이미지 자산 수량 검증 불가

- 소개서: "이미지 자산 190개 준비"
- 로컬: `images/` 디렉토리는 비어 있음 (S3에만 업로드된 것으로 추정)
- 데이터셋에서 참조하는 image_url 유일값
  - CUST 1,481건 중 1,094건 채움 → 유일 파일 110개
  - EMP 448건 중 425건 채움 → 유일 파일 123개
  - 합집합으로 약 180~200개로 추정되므로 "190개"가 그럴듯하나, 로컬 검증 수단이 없음
- **조치**: `scripts/match_images.py` 또는 별도 스크립트에서 `images/` 폴더와 CSV의 image_url 정합성 검사를 CI/배포 전 체크로 추가.

### 3.5 문서에서 누락된 컴포넌트

- `local_server.py` — Lambda 없이 로컬에서 notify/alerts를 흉내내는 개발 서버
- `tests/`, `scripts/test_rules.py`, `scripts/kakao_message_test.py`
- Bedrock 모델 ID와 리전 환경변수 (`BEDROCK_REGION`, 모델 ARN), batch의 `NOTIFY_CHANNEL`, `BATCH_STORE_CODES`
- 카카오 fallback 이미지 URL이 카카오 공식 데모 이미지(`developers.kakao.com/.../kakaolink_btn_medium.png`)로 박혀 있는 점

---

## 4. 코드/인프라 잠재 리스크

### 4.1 Terraform state가 repo에 커밋되어 있을 가능성

- `infra/`에 `terraform.tfstate`, `terraform.tfstate.*.backup` 7개 존재
- state 파일에는 리소스 ARN·계정 ID·간혹 시크릿 참조가 포함될 수 있음
- **조치**
  - `.gitignore`에 `*.tfstate*`, `*.tfvars` 추가
  - `git rm --cached infra/terraform.tfstate*` 로 인덱스에서 제거
  - 원격 백엔드(S3 + DynamoDB lock)로 이전

### 4.2 batch Lambda는 "발송"을 하지 않음

- `lambdas/batch/handler.py` — 가이드 생성과 `daily/{date}/results.json` 저장까지만 동작
- 수신자(매장별 직원 UUID) DB가 없어 카카오 전송 단계는 비어 있음
- **영향**: "매일 아침 자동 발송"이라는 핵심 가치가 현재 동작하지 않음

### 4.3 `매장 형태` 인코딩 미존재 값 처리

- `core/rule_matcher.py`는 `encoder_map.json`의 `형태` 매핑을 사용
- 신규/오타 매장에서 매핑 미스가 발생할 수 있음
- **조치**: 알 수 없는 카테고리는 명시적으로 "직영점" 인코딩 또는 별도 fallback 코드로 매핑하고 WARN 로그 출력

### 4.4 Bedrock 실패 시 Mock fallback 흔적 부족

- `core/llm.py`가 Bedrock 호출 실패 시 Mock으로 자동 대체
- 운영 시 "왜 Mock으로 떨어졌는지" 추적 불가하면 사용자에게 보내는 가이드 품질이 조용히 떨어짐
- **조치**: CloudWatch Logs에 `{store_code, source, leaf_id, bedrock_error_code, fallback_used}` JSON 구조 로깅

### 4.5 PII 처리 정책 부재

- 사고 사례에 매장명·지역·상병명이 포함된 채 Bedrock으로 전송
- 산업안전보건 데이터는 보존·열람 권한 통제가 필요
- **조치 후보**
  - LLM 전송 전 매장명/지역을 매장코드로 마스킹
  - 상병명은 카테고리화 ("두부 외상" 등)
  - S3 alerts 버킷에 Access Logging 활성화, IAM 최소권한 적용
  - Bedrock 호출 로그 보존 기간 명시

### 4.6 카카오 친구 메시지 API의 운영 한계

- 현재 흐름은 "친구 추가된 카카오 계정"에만 발송 가능 → 전 매장 직원에게 확장 불가
- 운영 전환 시 카카오톡 비즈메시지(알림톡) 채널 필요, 템플릿 사전 승인 소요

---

## 5. 개선 우선순위 (P0 즉시 / P1 단기 / P2 중기)

### P0 — 1~2주 안에 처리

| ID | 작업 | 산출물/파일 |
|---|---|---|
| P0-1 | 카카오 발송 코드를 `core/notifier.py`로 이전, notify/batch가 공유 | `core/notifier.py`, `lambdas/notify/handler.py`, `lambdas/batch/handler.py` |
| P0-2 | Terraform state 파일 인덱스 제거 + 원격 백엔드 전환 | `.gitignore`, `infra/main.tf` (backend block) |
| P0-3 | 소개서 문서 정정 (3.1~3.3, 3.5) | `docs/SAGO_AI_OVERVIEW.md` |
| P0-4 | EMP 모델 한계 명시 단락 추가 | `docs/SAGO_AI_OVERVIEW.md` 3장 |

### P1 — 2~4주 안에 처리

| ID | 작업 | 메모 |
|---|---|---|
| P1-1 | batch Lambda의 매장→수신자 매핑 (`recipients.json`) 도입 | 모델 버킷에 `recipients.json` 업로드, batch가 로드 |
| P1-2 | 카카오 fallback 이미지를 자사 자산으로 교체, 환경변수화 | `KAKAO_FALLBACK_IMAGE_URL` |
| P1-3 | Bedrock 호출 구조화 로깅, Mock fallback 사용 시 명시적 마킹 | `core/llm.py` |
| P1-4 | `매장 형태` 미존재 값 fallback 처리 + 경고 로그 | `core/rule_matcher.py` |
| P1-5 | `images/` 폴더와 CSV image_url 정합성 검사 스크립트 + 배포 전 체크 | `scripts/` |

### P2 — 1~3개월

| ID | 작업 | 메모 |
|---|---|---|
| P2-1 | EMP 모델 재설계 (라벨 통합 또는 트리 → nearest-cases 검색) | 13개 → 5~6개 통합 권장 |
| P2-2 | 카카오 알림톡 채널 전환 및 템플릿 사전 등록 | 승인 시간 고려해 일찍 시작 |
| P2-3 | 발송 승인 플로우 (초안 → 검토 → 승인 → 발송) | alerts 인덱스에 `status` 필드, `dry_run=true` 모드 |
| P2-4 | PII 마스킹 정책 및 보존기간 합의/구현 | 사내 보안/법무 협의 필요 |
| P2-5 | 모델 재학습 자동화 (월 1회) | GitHub Actions 등 CI에서 train → 검증 → 승인 → S3 업로드 |
| P2-6 | 효과 측정 KPI 정의 | 발송/미발송 매장 사고율, 가이드 적중률, 사용자 반응률 |

---

## 6. 가장 ROI가 큰 단일 묶음: P0-1 + P1-1

이유:

- 두 작업이 합쳐지면 batch Lambda가 비로소 "매일 아침 자동 발송"을 수행 — 서비스의 핵심 가치가 실제로 동작
- 코드 한 벌(`core/notifier.py`)이 manual notify와 batch에서 공유되므로 중복 발송 로직 유지보수 비용이 사라짐
- 다른 모든 운영 전환 작업(P2-2 알림톡, P2-3 승인 플로우)이 이 묶음을 전제로 함

권장 작업 순서:

1. `core/notifier.py`에 `KakaoNotifier`를 실구현 (notify handler.py에서 함수 이전)
2. `lambdas/notify/handler.py`는 `get_notifier("kakao").send(...)` 한 줄로 단순화
3. `recipients.json` 스키마 정의 후 모델 버킷에 업로드
4. `lambdas/batch/handler.py`에서 `recipients.json` 로드 → `get_notifier(...)` 호출
5. 파일럿 매장 1~3곳만 `recipients.json`에 등록해 운영 검증

---

## 7. 권장 진행 일정

| 주차 | 작업 |
|---|---|
| 1주 | P0-2 Terraform state 정리, P0-3 / P0-4 문서 정정 |
| 2~3주 | P0-1 KakaoNotifier 이전, P1-1 recipients.json, batch 발송 연결 |
| 4주~ | P2-2 알림톡 템플릿 신청(승인 대기 시작), P2-4 PII 정책 합의 |
| 1~2개월 | P2-1 EMP 재설계, P2-3 승인 플로우, P2-5 재학습 자동화, P2-6 KPI 정의 |

---

## 8. 체크리스트 (리뷰어용)

- [ ] `core/notifier.py`의 `KakaoNotifier`가 실제로 카카오 API를 호출하는가
- [ ] `lambdas/batch/handler.py`가 수신자 정보를 로드해 실제 발송까지 수행하는가
- [ ] `infra/`에 `*.tfstate*` 파일이 추적되지 않는가 (`git ls-files infra | grep tfstate`)
- [ ] Bedrock 실패 시 CloudWatch에 fallback 사실이 구조화 로그로 남는가
- [ ] `images/` 자산과 `processed/incidents_*.csv`의 `image_url` 정합성이 검증되는가
- [ ] 소개서의 카카오 발송 흐름이 실제 구현과 일치하도록 갱신되었는가
- [ ] EMP 모델의 분류 정확도 한계가 문서에 명시되어 있는가
- [ ] PII 처리 정책이 문서로 합의되어 있는가

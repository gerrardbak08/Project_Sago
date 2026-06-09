# Product: SAGO AI

**Last updated:** 2026-06-08
**Method:** codebase scan + conversation

## Product Identity
- **One-liner:** 안전보건 담당자가 매장과 날짜를 선택하면, 과거 사고 사례와 당일 기상·매장 조건을 결합한 AI가 매장별 맞춤 안전 가이드를 생성하고 담당자 카카오톡으로 전달한다.
- **Category:** ai-ml-tool (내부 기업용 안전관리 SaaS PoC)
- **Product type:** B2B internal — 아성다이소 단일 법인 내부 운영 도구. 멀티테넌트 아님.
- **Collaboration:** multiplayer — 안전보건팀·본부·영업조직이 동일 대시보드를 공유하고, 매장 담당자는 카카오 수신자로 참여.

## Business Model
- **Monetization:** 내부 PoC (현재 비용 부과 없음 — AWS 인프라 비용은 아성다이소 부담)
- **Pricing tiers:** 없음 (단일 내부 서비스)
- **Billing integration:** 없음 (Stripe/Paddle 미탐지)

## Tech Stack
- **Primary language:** Python (백엔드·ML), TypeScript/JavaScript (프론트엔드)
- **Framework:** React + Vite + Tailwind CSS (프론트) / AWS Lambda + Function URL (백엔드, 프레임워크 없음)
- **Database:** S3 기반 JSON/CSV 파일 저장소 (전통적 DB 없음) — 모델은 `models/`, 알림 이력은 `alerts/{date}/`, 매장 정보는 `stores.json`
- **Background jobs:** AWS EventBridge + batch Lambda (매일 아침 KST 기준 배치 실행)
- **HTTP client patterns:** `requests` (Python — Open-Meteo API, 카카오 API 호출)
- **Module organization:** `core/` 공유 패키지 (Lambda Layer로 배포), `lambdas/{notify,alerts,batch,ai,ack}/` 개별 핸들러, `proj/src/components/tabs/{worker,customer,alert}/` 탭별 React 컴포넌트

## Value Mapping

### Primary Value Action
**안전 가이드 발송(Alert Send)** — 관리자가 매장과 날짜를 선택 → Lambda가 당일 기상·매장 조건으로 유사 사고 리프를 찾고 → Bedrock LLM이 오늘의 수칙을 생성 → 카카오 메시지로 전달. 이 흐름이 하루 0건이면 서비스가 실패한 것이다.

### Core Features (직접 가치 제공)
1. **AI 안전 가이드 생성** — CUST/EMP Decision Tree 리프 매칭 + Bedrock LLM이 오늘 조건에 맞는 수칙·재현 가능성을 생성. 이것이 제품의 핵심 차별점.
2. **카카오 메시지 발송** — 생성된 가이드를 피드 템플릿(이미지·대표 수칙·링크)으로 카카오 친구 메시지 API를 통해 전달.
3. **알림 현황 모니터링** — 날짜별 발송 결과 조회, 매장별 CUST/EMP 위험유형·상세 가이드 열람, 카카오톡 미리보기.

### Supporting Features (핵심 기능을 가능하게 함)
1. **안전보건 대시보드** — 과거 사고 통계(근로자/고객 탭), 부서·팀·매장 단위 현황, 매장 위험지도(카카오맵). 가이드 발송 대상 우선순위 파악에 사용.
2. **ML 모델 파이프라인** — 엑셀 전처리 → Decision Tree 학습 → JSON 모델 export → S3 업로드. 런타임은 scikit-learn 없이 순수 Python으로 트리 실행.
3. **위험 점수 엔진(risk_score.py)** — S1(조건위험)·S2(사례근접)·S3(심각도) 가중합으로 발동 여부 결정. Conformal calibration 적용, v2 learned weights.
4. **기상 데이터 조회** — Open-Meteo API로 매장 위도·경도 기준 당일 기상 8개 피처 수집.

## Entity Model

### Users (현재 인증 없음 — 향후 추가 예정)
- **ID format:** 현재 없음. 향후 추가 시 정의 필요.
- **Roles:** 안전보건팀(전체 관리), 본부/영업 관리자(조회), 매장 담당자(알림 수신 — 대시보드 접근 없음)
- **Multi-account:** No — 아성다이소 단일 조직

### Stores (매장) — 핵심 분석 단위
- **ID format:** 정수형 매장코드 (예: `10130`, `10481`)
- **Attributes:** 매장명, 지역, 형태(직영/유통), 평수, 인원, 매출, 물동량, 위도·경도
- **Hierarchy:** 매장 > 팀 > 영업부 > 부서 (stores.json에 `팀`, `영업부`, `부서` 필드 존재)

### Incidents (사고 사례) — ML 학습 및 가이드 생성 재료
- **ID format:** `cust_NNNN` (고객 사고), `emp_NNNN` (직원 사고)
- **Types:** CUST (고객 사고 1,481건), EMP (직원/산재 448건)

### Alerts (알림) — 발송 이력
- **ID format:** `{store_code}_{timestamp}` (S3 파일명 기반)
- **Storage:** `s3://alerts-bucket/alerts/{date}/index.json` + 상세 JSON

## Group Hierarchy

```
아성다이소 (단일 법인)
└── 부서 (영업본부 등)
    └── 팀 / 영업부
        └── 매장 (이벤트 발생 최소 단위)
```

| Group Type | Parent | Where Actions Happen |
|------------|--------|----------------------|
| 부서 | 법인 | 부서별 사고 집계 조회 |
| 팀/영업부 | 부서 | 팀별 사고 현황 조회 |
| 매장 | 팀 | 안전 가이드 발송·사고 분석의 모든 이벤트 |

**Default event level:** 매장 (store_code 기준)
**Admin actions at:** 부서/팀 수준 (대시보드 필터 및 조회)

## Current State
- **Existing tracking:** 없음 — 어떤 분석 도구도 미연동
- **Documentation:** Partial — `docs/SAGO_AI_OVERVIEW.md`에 서비스 설명 있으나 트래킹 계획 없음
- **Known issues:**
  - 사용자 인증 없어 누가 대시보드를 쓰는지 알 수 없음
  - 발송 성공/실패 이력은 S3에 저장되나 집계·분석 불가
  - 배치 실행 결과(batch Lambda)의 성공률·지연 모니터링 부재
  - 매장별 위험 점수 트리거 발동률을 운영 중 관찰할 방법 없음

## Integration Targets

| Destination | Purpose | Priority |
|-------------|---------|----------|
| Accoil | 제품 사용 행동 분석 — 발송 빈도·피처 채택률. **주의: 이벤트 이름만 저장, 프로퍼티 미저장. 이벤트 명칭 설계 시 이 제약 고려 필요.** | High |
| Amplitude | 퍼널 분석 — 매장 선택 → 발송 → 확인 흐름 | High |
| Mixpanel | 코호트·리텐션 — 관리자별 발송 패턴 (인증 추가 후 유효) | Medium |
| 사내 데이터웨어하우스 | 알림 이력 + 사고 데이터 통합 장기 분석 | Medium |

## Codebase Observations
- **Feature areas inferred (from components/tabs):**
  - `worker/` — 근로자 사고 분석 (요약, 부서팀, 매장IR, 파트장, 위험지도, 시계열, 요인분석, 인적요인, 재발재해자, 의료심각도, 법적보고, 비용손실)
  - `customer/` — 고객 사고 분석 (요약, 부서별, 유형·장소, 보상, 모니터링, 피해자)
  - `alert/` — 알림 발송(AlertSend), 알림 현황(AlertMonitoring)
- **Entity model inferred (from core/ + models/ + stores.json):**
  - `stores.json` — 매장 마스터 (매장코드, 위도경도, 팀, 영업부, 부서, 면적, 인원 등)
  - `models/{cust,emp}/` — Decision Tree JSON + leaf_table + siblings + risk_policy
  - `s3://alerts-bucket/alerts/` — 날짜별 발송 이력 JSON
- **ML artifacts:** v2 learned weights (cust AUC 0.845, emp AUC 0.831), conformal calibration, display_score 0~1 정규화
- **Serverless-only backend:** Lambda Function URL 기반, 전통적 DB 없음 — 트래킹은 클라이언트사이드(React) 또는 Lambda 내부 이벤트 emit으로 구현해야 함

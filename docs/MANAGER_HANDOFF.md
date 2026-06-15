# SAGO AI — 매니저 인수인계 문서

> **대상**: 이 프로젝트를 이어받는 매니저 / 개발 담당자  
> **최종 업데이트**: 2026-06-15  
> **작성자**: Claude (Gerrard와 협업)

---

## 1. 프로젝트 한 줄 요약

**SAGO AI**는 아성다이소 전국 매장의 산업재해·고객 사고를 AI로 분석해, 매장별 맞춤 안전 가이드를 카카오톡으로 자동 발송하는 사고 예방 시스템입니다.

```
과거 사고 데이터 + 기상 + 물동량
        ↓
   ML 위험점수 산정
        ↓
  임계 초과 매장 탐지
        ↓
 LLM 안전 가이드 생성 (AWS Bedrock)
        ↓
  카카오톡 채널 발송
        ↓
   S3 랜딩 페이지 (수칙 상세)
```

---

## 2. 아키텍처 전체 그림

```
┌─────────────────────────────────────────────────────────┐
│                      프론트엔드 (React)                   │
│  S3 정적 호스팅  daiso-safety-v1-frontend.s3-website...  │
│                                                          │
│  탭: 근로자현황 / 고객현황 / 알림관리 / (예정: 산재승인DB) │
└────────────────────────┬────────────────────────────────┘
                         │ fetch
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
  alerts Lambda     notify Lambda    batch Lambda
  (이력 조회)       (카카오 발송)    (일별 스케줄)
        │                │                │
        └────────────────┴────────────────┘
                         │
                    S3 버킷들
              ┌──────────┴──────────┐
         models/                frontend/
       (ML 모델)              (guide HTML)
```

### Lambda 5종

| Lambda | 역할 | 트리거 |
|--------|------|--------|
| `batch` | 전 매장 위험점수 산정 + 가이드 생성 스케줄 실행 | EventBridge (매일 오전) |
| `notify` | 카카오톡 채널 발송 + S3 가이드 업로드 | batch 호출 / 수동 |
| `alerts` | 날짜별 발송 이력 JSON 반환 | 프론트엔드 fetch |
| `ack` | 수신 확인 처리 | 랜딩 페이지 클릭 |
| `ai` | LLM 가이드 단독 생성 (개발용) | 수동 |

---

## 3. 기술 스택

| 영역 | 기술 |
|------|------|
| 프론트엔드 | React 18 + Vite + Tailwind CSS + Recharts |
| 인프라 | AWS (Lambda, S3, EventBridge) + Terraform |
| ML | scikit-learn (로지스틱 회귀 위험점수), pandas |
| LLM | AWS Bedrock (claude-sonnet-4-6) — Tool Use |
| 알림 | 카카오 채널 API |
| 기상 | Open-Meteo API |
| 분석 | Amplitude (이벤트 트래킹, API Key 미입력 상태) |

---

## 4. 핵심 파일 지도

```
sago_ai/
├── core/                    ← ML + 알림 + LLM 핵심 로직
│   ├── llm.py               ★ LLM 가이드 생성 (Bedrock Tool Use + Mock 모드)
│   ├── risk_score.py        ← 위험점수 산정 (S1/S2/S3 3축 로지스틱)
│   ├── rule_matcher.py      ← 의사결정트리 사례 인덱스 매칭
│   ├── rule_enrichment.py   ← 리프 노드 위험 해석
│   ├── notifier.py          ← 카카오 피드 카드 발송 템플릿
│   ├── recipients.py        ← 수신자 관리
│   ├── alert_state.py       ← 발송 상태 추적
│   └── weather.py           ← Open-Meteo 기상 피처 수집
│
├── lambdas/                 ← AWS Lambda 함수들
│   ├── batch/handler.py     ← 스케줄 배치 (위험점수 → 발송 결정)
│   ├── notify/handler.py    ← 카카오 발송 + S3 가이드 업로드
│   ├── alerts/handler.py    ← 이력 조회 API
│   └── ack/handler.py       ← 수신 확인
│
├── proj/src/                ← React 프론트엔드
│   ├── App.jsx              ← 탭 라우팅, alertTab 상태 관리
│   └── components/tabs/
│       ├── alert/           ← 알림관리 탭 3종
│       │   ├── AlertMonitoring.jsx  ★ KPI바 + 필터 + 트렌드 차트
│       │   ├── AlertSend.jsx        ★ 발송 + 사전 미리보기
│       │   └── AlertReview.jsx      ★ 위험도 검토
│       ├── worker/          ← 근로자 현황 탭
│       └── customer/        ← 고객 현황 탭
│
├── processed/               ⚠️ CSV 절대 수정 금지
│   ├── incidents_emp.csv    ← 직원 사고 448건
│   ├── incidents_cust.csv   ← 고객 사고 1,481건
│   ├── stores.csv           ← 매장 정보
│   └── weather.csv          ← 기상 데이터
│
├── models/                  ← 학습된 ML 모델 파일
│   ├── cust/                ← 고객 위험 모델 (AUC 0.845)
│   └── emp/                 ← 직원 위험 모델 (AUC 0.831)
│
├── scripts/                 ← 유틸리티 스크립트
│   ├── build_guide_page.py  ← S3 가이드 HTML 생성 (batch Lambda 사용)
│   ├── forecast_scan.py     ← 기상예보 기반 선제 스캐너 (MVP 축3)
│   ├── simulate_triggers.py ← ML 트리거 시뮬 + AUC 측정
│   └── train.py             ← ML 모델 학습
│
├── infra/main.tf            ← Terraform 인프라 정의
├── deploy.sh                ★ 유일한 배포 진입점
├── .env                     ← 환경변수 (카카오 API 키 등)
└── .claude/HANDOFF.md       ← Claude 세션 재개용 (자동 갱신)
```

---

## 5. 현재 완료된 작업

### ML 파이프라인
- [x] 고객/직원 분리 위험점수 모델 (S1 조건/S2 사례근접/S3 심각도 3축)
- [x] 의사결정트리 사례 인덱스 (리프 노드별 유사 사고 클러스터링)
- [x] Cross-leaf kNN 재정렬 (IQR 정규화 가중 거리)
- [x] 기상예보 선제 스캔 (`scripts/forecast_scan.py`)
- [x] 평가: cust AUC 0.845 / emp AUC 0.831

### 알림 시스템
- [x] 카카오 채널 피드카드 발송 (이미지 + 수칙 + S3 랜딩 링크)
- [x] S3 랜딩 페이지 자동 생성 (매장별 날짜별 HTML)
- [x] LLM 안전가이드 생성 (Bedrock claude-sonnet-4-6, Mock 폴백)
- [x] 발송 이력 DB (S3 JSON)

### 대시보드 UI
- [x] 알림 발송 탭 (매장 선택 + 사전 카카오카드 미리보기)
- [x] 알림 모니터링 탭 (KPI 바 + 위험도 필터 + 주간 트렌드 차트 + 가이드 링크)
- [x] 알림 검토 탭 (위험도별 매장 카드)
- [x] 근로자/고객 현황 탭 (차트, 히트맵, 위험지도)
- [x] 카카오맵 위험 지도 (StoreRiskMap)

### 캐릭터 & 미디어
- [x] 사고유형별 CSS 애니메이션 SVG 10종 (`assets/character/animated/`)
- [x] 카카오 피드카드 → S3 랜딩 2단계 UX 목업 (`docs/alert_preview.html`)

---

## 6. 미완료 / 예정 작업

### 최우선 (ML)

| 항목 | 설명 |
|------|------|
| **A+B 안전수칙 혼합** | `core/safety_rules.py` 유형별 정적 수칙 DB 생성 후 LLM 프롬프트에 주입 — LLM이 오늘 조건에 맞게 구체화 |
| **축4 임계 자가보정** | `alert_state` ack 이력 + 사후 사고 데이터로 위험 임계값 θ 재학습 루프 |
| **S1 역변별 근본 검토** | `enrich_leaf_rule`의 risk_level이 사고와 반대로 매핑되는 원인 분석 |

### 알림관리 고도화

| 축 | 항목 | 상태 |
|----|------|------|
| 축1 | KPI 바 + 필터칩 + 가이드 링크 | ✅ 완료 |
| 축2 | 발송 전 카카오카드 미리보기 | ✅ 완료 |
| 축3 | 주간 트렌드 뷰 (Recharts) | ✅ 완료 |
| 축4 | 수신자 관리 (localStorage 프리셋) | 🔲 예정 |
| 축5 | 수신 확인률 (ack rate) 연동 | 🔲 예정 |
| 축6 | 발송 이력 CSV 다운로드 | 🔲 예정 |

### 운영 전환

| 우선순위 | 항목 |
|---------|------|
| P1 | 사내 IT 본부 API 연동 (사고현황 / 물동량 실시간) |
| P1 | 알림 발신업체 추상화 (`core/notifier.py` 리팩터링) |
| P2 | 카카오맵 연동 완성 |
| P2 | 산재 승인 DB 탭 (1차 Excel, 2차 HR API) |
| P3 | Amplitude API Key 발급 → `proj/.env.local` 입력 |

---

## 7. 절대 지켜야 할 규칙

```
⚠️  processed/*.csv     — 절대 수정·덮어쓰기 금지 (원본 사고 데이터)
⚠️  ./deploy.sh         — 인프라 배포는 반드시 이것만 사용 (raw terraform apply 금지)
⚠️  core/llm.py 구조    — 변경 시 반드시 Gerrard와 합의 후 소단위 구현
⚠️  카드 디자인         — 카드 사이드에 border-left 색상 막대 절대 금지
```

---

## 8. 로컬 개발 환경 설정

```bash
# 1. 환경변수 설정
cp .env.example .env
# .env에 카카오 API 키, AWS 자격증명 등 입력

# 2. Python 의존성
pip install -r requirements.txt

# 3. 프론트엔드
cd proj
npm install
npm run dev          # 로컬 개발 서버 (localhost:5173)
npm run build        # 프로덕션 빌드

# 4. 배포 (빌드 + S3 업로드 + Lambda 패키징 자동)
./deploy.sh
```

---

## 9. 주요 환경변수 (`.env`)

| 변수명 | 설명 |
|--------|------|
| `KAKAO_API_KEY` | 카카오 채널 REST API 키 |
| `KAKAO_CHANNEL_ID` | 카카오 채널 ID |
| `AWS_DEFAULT_REGION` | ap-northeast-2 (서울) |
| `BEDROCK_MODEL_ID` | us.anthropic.claude-sonnet-4-6 |
| `USE_MOCK_LLM` | `true`로 설정 시 Bedrock 미호출 (개발용) |
| `VITE_FRONTEND_URL` | S3 프론트엔드 베이스 URL |
| `VITE_ALERTS_URL` | alerts Lambda URL |
| `VITE_API_BASE` | notify Lambda URL |

---

## 10. ML 모델 재현 방법

```bash
# AUC 평가 (현재 기준값: cust 0.845 / emp 0.831)
python3 scripts/simulate_triggers.py --source cust --evaluate
python3 scripts/simulate_triggers.py --source emp --evaluate

# 모델 재학습 (processed/ CSV 변경 후)
python3 scripts/train.py --source cust
python3 scripts/train.py --source emp

# 기상예보 선제 스캔 (내일 위험 매장 사전 탐지)
python3 scripts/forecast_scan.py
```

---

## 11. Claude와 협업하는 방법

이 프로젝트는 Claude Code CLI와 함께 작업합니다.

**새 세션 시작 시 첫 번째로 할 것:**
```
.claude/HANDOFF.md 읽어줘
```
→ Claude가 직전 세션 작업현황을 즉시 파악합니다.

**도메인별 전문 에이전트 활용 (Claude Code에서):**

| 에이전트 | 호출 시점 |
|---------|----------|
| `sago-orchestrator` | 복합 작업, 어디서 시작할지 모를 때 |
| `sago-frontend` | React UI 수정, 차트, 탭 |
| `sago-ml` | 위험점수, AUC, 모델 재학습 |
| `sago-notify` | 카카오 발송, LLM 가이드, 랜딩 페이지 |
| `sago-infra` | Lambda 배포, 환경변수, 인프라 |
| `sago-data` | 데이터 갱신, 스냅샷, 엑셀 변환 |

**병렬 작업 요청 방법:**
```
"오케스트레이터 역할하고 에이전트들 활용해"
```
→ Claude가 독립적인 작업을 에이전트 여러 개에 동시 위임합니다.

---

## 12. 배포 URL

| 서비스 | URL |
|--------|-----|
| 프론트엔드 대시보드 | `daiso-safety-v1-frontend.s3-website.ap-northeast-2.amazonaws.com` |
| notify Lambda | `https://7sbybssdb5ovsxkv54adpcmvm40milsr.lambda-url.ap-northeast-2.on.aws/` |
| alerts Lambda | `https://ydxoov53qgobkvspmebqahlar40umaiv.lambda-url.ap-northeast-2.on.aws/` |

---

## 13. GitHub 저장소

- **저장소명**: `Project_Sago` (구 `sago_ai` — 이름 변경됨, remote URL 갱신 완료)
- **기본 브랜치**: `main`

---

## 14. 연락처 / 오너십

| 역할 | 담당 |
|------|------|
| 프로젝트 오너 | Gerrard (gerrardbak08@gmail.com) |
| AI 협업 | Claude Sonnet 4.6 (claude-sonnet-4-6) |

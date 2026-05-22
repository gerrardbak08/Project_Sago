# SAGO AI 작업 백로그

병렬 에이전트 조사 + 대화 누적 기준 미구현·미완성 항목 마스터 목록. (2026-05-22 기준)

## 🔴 P0 — 데이터 정확성 (가장 시급)

| # | 항목 | 위치 | 내용 |
|---|---|---|---|
| 1 | **고객 사고 데이터 미갱신** | `customerData.js` | 2026년이 1~4월 136건만 — 근로자(568건)는 갱신됐으나 고객은 옛 데이터. `DB/고객사고DB.xlsx` 기반 재생성 필요 |
| 2 | 고객 데이터 재생성 파이프라인 없음 | `scripts/` | `regenerate-data.mjs`는 근로자만. 고객 사고용 스크립트 추가 필요 |
| 3 | `computeCustomer.js` 견고성 | `utils/computeCustomer.js` | 연도 하드코딩, null 검증 부재 |

## 🔴 P0 — 기능 미작동 (키/설정 누락)

| # | 항목 | 위치 | 필요한 것 |
|---|---|---|---|
| 4 | **AI 요약 작동 안 함** | `hooks/useGeminiStream.js` | `GEMINI_API_KEY=''` 빈 값. Gemini 키 발급 또는 Bedrock 전환 결정 |
| 5 | **카카오맵 작동 안 함** | `StoreRiskMap.jsx`, `index.html` | 카카오맵 JS SDK `<script>` 태그 누락 + appkey 미설정. 카카오 개발자 JS 키 필요 |

## 🟡 P1 — 추정값 → 실데이터 전환

| # | 항목 | 위치 |
|---|---|---|
| 6 | Overview 재무손실 — 일부 하드코딩 상수 잔존 | `Overview.jsx` (간접비계수 등) |
| 7 | 연도별 부문/팀 breakdown 없음 (기간 비례 추정 중) | `Overview.jsx`, `TimeSeries.jsx` |
| 8 | 중상해 점유율 — 추정 가중치, 분모 검증 필요 | `SeverityAnalysis.jsx` |
| 9 | IR 배너 분모(재직자) 연도 미연동 | `Overview.jsx` — 부문별 시계열 필요 |
| 10 | CrossAnalysis 상관 분석 미완성 | `CrossAnalysis.jsx` |

## 🟡 P1 — 알림 운영 전환

| # | 항목 | 위치 |
|---|---|---|
| 11 | 카카오 발송 = 친구 UUID 테스트 단계 | `AlertSend.jsx` |
| 12 | 수신자 관리 시스템 없음 (UUID 직접 입력) | `AlertSend.jsx` — 지역/팀/매장 단위 발송 = 발신업체 연동 필요 |
| 13 | batch Lambda 수신자 비어 dry-run | `lambdas/batch/handler.py` |

## 🟢 P2 — 로드맵 (사용자 4축)

| # | 항목 |
|---|---|
| 14 | 대시보드 최적화 — 메뉴별 순차 검토 (진행 중) |
| 15 | 사내 API 연동 — 현재 엑셀 수동. 동적 전환 구조 설계 |
| 16 | 카카오맵 연동 완성 — 마커(매장명·사고이력·위험등급·AI조언·로드뷰), 지역 단위 매핑 |
| 17 | `core/llm.py` 고도화 — 사용자와 협업 |
| 18 | HR App 연동 — 개인 로그인 시 자동 팝업 알림 |

## 🟢 P2 — 인프라/배포

| # | 항목 |
|---|---|
| 19 | GitHub 첫 push (가이드: `docs/GITHUB_PUBLISH_GUIDE.md`) |
| 20 | URL 단축 (한국 서비스 접근 불가 — 대안 검토) |
| 21 | 자체 도메인 + CloudFront (전사 플랫폼 도입 시) |

## 미조사 (다음 라운드)

- 근로자 탭 6개: ParjangDashboard, StoreAnalysis, RepeatWorkers, LegalReporting, CostRisk, StoreDeepDive
- 위 탭들의 추정값·placeholder 여부 점검 필요

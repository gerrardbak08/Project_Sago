# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 이번 세션 (2026-06-16) — 알림관리 고도화 축1~6 전체 완료 + ML 축4 임계 자가보정

### 완료한 작업

#### 0. 알림관리 탭 3개 전면 리디자인 (직전 세션)
(AlertReview/Send/Monitoring 전면 리디자인, dead script 12개 제거)

#### 1. 알림관리 고도화 축1~6 전체 완료
- **AlertMonitoring 축1**: 5종 KPI 바(총발송/성공/고위험/실패/확인률) + 위험도 필터칩 5종 + S3 가이드 링크
- **AlertSend 축2**: 발송 전 카카오 피드카드 미리보기 토글 (최대 2개 매장 형식 표시)
- **AlertMonitoring 축3**: 주간 트렌드 뷰 — 7/14일 ComposedChart(총발송·고위험 Bar + 성공률 Line)
- **AlertSend 축4**: 수신자 프리셋 관리 (localStorage CRUD, PresetForm + RecipientPresetManager 모달)
- **AlertMonitoring 축5**: 수신 확인률 — S3 alert_state fetch → per-store ack 배지 + KPI 확인률
- **AlertMonitoring 축6**: 발송 이력 CSV 다운로드 (10컬럼, BOM UTF-8, `sago_alert_{date}.csv`)

#### 2. A+B 안전수칙 혼합
- `core/safety_rules.py` 신설: 고객/직원 유형별 정적 수칙 DB (CUSTOMER_RULES / EMPLOYEE_RULES)
- `core/llm.py` 소단위 4개소 수정: 수칙 DB → LLM 프롬프트 주입 (간략·명료 제약 추가)

#### 3. 랜딩 MP4 영상 슬롯 사전 구현
- `scripts/build_guide_page.py` + `docs/alert_preview.html`: video_url 없으면 숨김, 있으면 표시

#### 4. 매니저 핸드오프 문서
- `docs/MANAGER_HANDOFF.md` — 아키텍처, 완료/예정 작업, 규칙, 배포 URL, Claude 에이전트 가이드

#### 5. ML 축4 임계 자가보정 스크립트
- `scripts/calibrate_theta.py` 신설 (19KB)
  - S3 ack_state + 발송 이력 → F_beta(β=2) grid search → dampened θ 갱신
  - cold-start 보호(기본 20건 미만 스킵), ±25% 클램프, calibration_history 최대 20개 유지
  - `--dry-run / --source / --days / --min-samples / --local-alerts` 옵션
  - S3 업로드 graceful degrade (boto3 없거나 버킷 미설정 → 로컬만 갱신)

#### 3. 이전 세션 누적 작업 (모두 커밋·배포 완료)
- CSS 애니메이션 SVG 10종 (`assets/character/animated/`) — 사고유형별 캐릭터 모션
- 랜딩페이지: 기본 라이트모드, subtitle keep-all, OrbitBg(6점 궤도), FlowDiagram(3단계 흐름)
- UI/Motion 전면 적용: `proj/src/utils/motion.js` (useCountUp, useInView, keyframes), 탭 전환 슬라이드, KPI 카운트업, Card hover lift
- 카카오맵 SDK 로딩 수정: Vite `htmlEnvPlugin` 추가로 `%VITE_*%` 치환
- 예보 기반 선제 위험 스캐너 (`scripts/forecast_scan.py`) — MVP 축3 완료

### 배포 상태
- GitHub `main` 브랜치 최신 동기화 완료
- S3 프론트엔드: `daiso-safety-v1-frontend.s3-website.ap-northeast-2.amazonaws.com`
- Lambda(notify/batch/alerts): 최신 코드 반영됨

---

## 현재 scripts/ 살아있는 파일 목록
| 파일 | 용도 |
|---|---|
| `build_guide_page.py` | S3 가이드 랜딩 HTML 생성 (batch Lambda 사용) |
| `build_dataset.py` | 데이터셋 빌드 |
| `build_non_incidents.py` | 비사고 데이터 수집 |
| `fit_risk_weights.py` | 로지스틱 가중치 재학습 |
| `forecast_scan.py` | 기상예보 선제 스캔 (축3) |
| `simulate_triggers.py` | 트리거 시뮬레이션·AUC 측정 |
| `train.py` | ML 학습 |
| `make_safety_video.py` | FFmpeg+Pillow 안전영상 PoC |
| `build_alarm_preview.py` | 알림 카드 미리보기 HTML |
| `kakao_message_test.py` | 카카오 메시지 API 로컬 테스트 |
| `make_scenario_svgs.py` | 시나리오 SVG 생성 |
| `preview_card.py` | 카드 미리보기 |
| `character/animate.py` | 캐릭터 애니메이션 |
| `character/make_stills.py` | 캐릭터 정지컷 생성 |
| `character/physics_fall.py` | 캐릭터 물리 애니 |
| `character/scenarios.py` | 캐릭터 시나리오 |
| `character/walk_cycle.py` | 캐릭터 워크사이클 |
| `character/worker.py` | 캐릭터 워커 |

---

## 다음 작업 후보

### ML (최우선)
| 항목 | 비고 |
|---|---|
| **축4 자가보정 운영 투입** | `scripts/calibrate_theta.py --dry-run` 선행 후 실 데이터 누적 시 운영 적용 |
| **notify handler risk_score 기록** | index.json에 raw risk_score도 저장 → 자가보정 스케일 사상 정확도 향상 |
| **부서 단위 점수** | emp 기인물→부서 매핑 (사고데이터 부서컬럼 없음 → 도메인 규칙) |
| **S1 역변별 근본 검토** | enrich_leaf_rule risk_level이 사고와 반대인 이유 |

### 프론트/알림
| 항목 | 비고 |
|---|---|
| **Amplitude/Accoil API Key** | `proj/.env.local` 입력 (코드는 완성됨) |
| **산재 승인 DB 탭** | 1차 Excel(npm run data:approval), 2차 HR API |
| **Higgsfield MCP 인증** | `claude mcp auth higgsfield` 완료 후 영상 생성 가능 |

### 운영 전환
| 우선순위 | 항목 |
|---|---|
| P1 | 사내 API 연동 (사고현황/물동량 실시간) |
| P1 | 알림 발신업체 추상화 (core/notifier.py 리팩터링) |
| P2 | 카카오맵 연동 완성 |

---

## ML 객관 평가 (2026-06-02 측정, 재현 가능)
- **cust score AUC 0.845** / **emp score AUC 0.831**
- S2(사례근접 kNN) 단일축이 변별력 전담. S1(조건위험) 역변별, S3(심각도) 무변별
- 재현: `python3 scripts/simulate_triggers.py --source {cust,emp} --evaluate`

---

## 건드리지 말 것
- `processed/*.csv` — 절대 수정·덮어쓰기 금지
- 인프라 변경 시 `./deploy.sh` 경유, raw `terraform apply` 금지
- `core/llm.py` 구조 변경은 사용자와 합의 후 소단위 구현

# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 이번 세션 (2026-06-15) — 알림관리 탭 리디자인 + 코드 정리 + 배포

### 완료한 작업

#### 1. 알림관리 탭 3개 전면 리디자인
- **AlertReview**: stone-900 gradient 헤더 통일, Card 컴포넌트 통합, 위험도별 `border-l-4` 색상 강조 (red/amber/emerald), slate → stone 컬러 전환
- **AlertSend**: 발송 성공 매장에 카카오 피드카드 미니 미리보기 블록 추가 (카드 구조 + 이미지 플레이스홀더 + S3 랜딩 힌트)
- **AlertMonitoring**: 9컬럼 테이블 완전 제거 → 위험도 border 카드 리스트 (모바일 가로스크롤 제거, 클릭 시 DetailModal 유지)

#### 2. Dead 스크립트 12개 제거 (픽토그램·실사이미지 폐기에 따른 정리)
제거됨: `make_pictogram_gifs`, `make_category_images`, `make_category_images_ai`, `animate_scene`, `annotate_scene`, `build_scenes`, `gen_scene`, `match_images`, `generate_safety_media`, `media_prompts`, `sample_fall_gif`, `sample_fall_lottie`

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
| **축4 임계 자가보정** | alert_state ack_history + 사후 사고로 θ 재학습 루프 |
| **부서 단위 점수** | emp 기인물→부서 매핑 (사고데이터 부서컬럼 없음 → 도메인 규칙) |
| **S1 역변별 근본 검토** | enrich_leaf_rule risk_level이 사고와 반대인 이유 |

### 프론트/알림
| 항목 | 비고 |
|---|---|
| **Amplitude/Accoil API Key** | `proj/.env.local` 입력 (코드는 완성됨) |
| **카카오 피드카드 실제 발송 미리보기** | AlertSend 발송 결과에 S3 랜딩 링크 직접 연결 |
| **산재 승인 DB 탭** | 1차 Excel(npm run data:approval), 2차 HR API |

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

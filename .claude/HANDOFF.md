# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 마지막 커밋
`feat(ml): cross-leaf 재정렬 — 직계 형제 리프 사례 회수 + 메인 우선 보너스` (2026-05-31)

## 방금 완료 — AlphaFold 분석 Phase 1 + 2 + cross-leaf 전체

### Phase 1 (a5c53bf)
- kNN 유사 사례 재정렬 (IQR 정규화, 기상×2/매장×1/형태×0.5)
- `train.py` feature_stats export, balanced_accuracy/f1_per_class 평가지표

### Phase 2 (9766f26, 6f496c3)
- **신뢰도 게이팅**: `compute_confidence(fallback_level, samples, class_counts, calibration)` → high/med/low
- **conformal calibration** (`calibration.json`): 온도 스케일링 T + q̂ 오프라인 계산, 런타임 순수 Python
  - cust: T=0.9, q̂=0.8509, n=297 / emp: T=0.9, q̂=0.9412, n=90
- llm.py: low 신뢰도 시 '참고용 가설' 톤, notify handler: low 매장 `⚠️ [데이터 부족]` 배지

### cross-leaf 재정렬 (방금)
- **설계**: 메인 우선 + 보너스(×0.7), 직계 형제만 (사용자 합의)
- `rule_matcher.py`: `_smallest_sibling_group()` 추출(match_with_fallback과 공유), `expand_with_siblings()` 추가 — level 0 시 형제 리프 사례를 후보 풀에 추가, leaf_table 캐시 불변(얕은 복사)
- `llm.py` `rank_incidents`: `main_leaf_id`/`main_bonus=0.7` — 메인 리프 사례 거리 ×0.7 할인 (incident의 `leaf_id` 태그로 구분)
- handlers: level 0일 때 expand_with_siblings 배선 (confidence는 메인 분기 기준 유지)
- **검증**: 보너스 OFF 형제 4~8건 점유 → ON 0~4건으로 억제. 트리 신뢰하며 30%+ 더 가까운 형제만 회수
- 모델 재생성 불필요 (train.py 미변경)

---

## 다음 작업 목록 (ML 고도화 최우선 — 2026-05-31 사용자 지시)

| 우선순위 | 항목 | 파일 | 비고 |
|---|---|---|---|
| ~~P1~~ ✅ | ~~cross-leaf 재정렬~~ | — | 완료 |
| **P1** | **오프라인 baseline 비교** | `scripts/train.py` 오프라인만 | CatBoost/TabPFN vs 단일트리 리프 라우팅 품질 (macro-F1/top-k). 런타임 JSON 불변 |
| P2 | **Bedrock Titan 임베딩 재정렬** (Phase 3) | `scripts/train.py`(배치), `core/llm.py` | 별도 산출물 — processed/*.csv 수정 금지 |

> 운영 전환(사내 API, 알림 추상화, 카카오맵, UI)은 ML 고도화 이후. 상세는 메모리 [[project-ml-priority]]

### 운영 전환 (로드맵 4축)
| 우선순위 | 항목 | 현재 상태 | 목표 |
|---|---|---|---|
| P1 | **사내 API 연동** | 엑셀 전처리 기반 | 사고현황/물동량 실시간 수신, 데이터 로딩 한 곳에 격리 |
| P1 | **알림 발신업체 추상화** | 카카오 친구 UUID 단건 | `core/notifier.py` 리팩터링 → 업체 API 교체 가능 구조 |
| P2 | **카카오맵 연동** | 없음 | 대시보드 내 매장 위치 지도 |
| P2 | **대시보드 UI 고도화** | 현 PoC 수준 | 근로자/고객 화면 정비, 신뢰도 배지 프론트 반영 |
| P3 | **사내 HR App 연동** | 없음 | 개인 로그인 시 자동 팝업 |

---

## 건드리지 말 것
- `processed/*.csv` — 절대 수정·덮어쓰기 금지
- 인프라 변경 시 `./deploy.sh` 경유, raw `terraform apply` 금지
- `core/llm.py` 구조 변경은 사용자와 합의 후 소단위 구현

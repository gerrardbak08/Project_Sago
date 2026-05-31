# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 마지막 커밋
`feat(ml): 위험 점수 트리거 엔진 — per-entity 위험 분석 → 선별 발동` (2026-05-31)

## 방금 완료 — 위험 점수 트리거 엔진 (방향 전환: 검색품질 → 트리거 알림)

> 계획: [.claude/plans/greedy-bubbling-kite.md], 의도: 메모리 [[project-trigger-engine]]
> "전 매장 매일 무차별 발송" → "위험할 때 그 대상에게만 적시 발송"

- **core/risk_score.py** (신규, 순수 Python): 위험 점수 = 0.45·S2(사례근접) + 0.30·S1(조건위험) + 0.25·S3(심각도믹스), 신뢰도 게이트(low 차단). compute_risk_score → {risk_score, signals, trigger, severity, reason}
- **scripts/train.py**: SEVERITY_WEIGHTS 상수(사고유형별 심각도) + severity_weights.json dump
- **scripts/simulate_triggers.py** (신규): 사고 조건 점수분포 → P70=θ_score/P90=θ_high → risk_policy.json. weather-셔플 대조로 AUC 변별력 검증. 네트워크-free, CSV 읽기전용
- **lambdas/batch/handler.py**: `_generate_store_guide` → `_score_store`(LLM前 점수) + `_generate_guide_for`(trigger된 source만 Bedrock). 메인 루프: 미발동→무발송+대시보드 기록(trigger_type="scored_skip"), 쿨다운 통과 후에만 LLM. `_infer_severity`는 폴백으로 강등(보존). `_load_model_files` 8-tuple
- **tests/test_risk_score.py**: 14개 통과 (전체 18개)

### 검증 결과 (시뮬레이션)
- 발동률: CUST 28%(목표~30% 부합) / EMP 11%
- **AUC 0.565/0.588** — 0.5보단 높으나 약함. weather만 셔플한 대조라 "기상 단독 변별력은 약하다"는 정직한 신호 → 진짜 신호는 매장 환경 피처에 있음(문서 §5 결론 일치)
- EMP 신뢰게이트 78% 차단 (13클래스 분산 → conformal low 多)

### ⚠️ 다음 세션 검토 포인트
- AUC가 낮은 건 한계 신호. S2 가중을 더 높이거나, 매장환경 기반 변별 강화 검토 가능
- EMP 게이트 78% 차단이 과도한지(직원 사망 포함) — gate_policy 조정 여지
- 실제 운영 발동률은 배치 dry-run 로그로 측정·θ 재조정 필요(env RISK_SCORE_THRESHOLD)

## 이전 완료 — AlphaFold 분석 Phase 1 + 2 + cross-leaf

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

트리거 엔진 작업 축 ([[project-trigger-engine]]):

| 우선순위 | 항목 | 파일 | 비고 |
|---|---|---|---|
| ~~축1~~ ✅ | ~~위험 점수 엔진~~ | — | 완료 (방금) |
| **축3** | **적시성 — 기상예보 N일 선제 알림** | `lambdas/batch/handler.py`, `core/weather.py` | get_weather가 미래 forecast 지원 → 위험일 사전 발송 |
| 축4 | **임계 자가보정** | `scripts/simulate_triggers.py`, ack 피드백 | alert_state ack_history + 사후 사고로 θ 재학습 루프 |
| 후속 | **부서 단위 점수** | `core/risk_score.py`, emp 기인물→부서 매핑 | 사고데이터에 부서 컬럼 없음 → 도메인 규칙 필요 |
| 검토 | **변별력 강화** | `core/risk_score.py` | AUC 0.57 낮음 — S2 가중·매장환경 변별 개선 |

기존 ML 검색품질 작업 (트리거의 근거 데이터 품질):
| ~~Phase1~~ ✅ kNN재정렬 / ~~Phase2~~ ✅ conformal / ~~cross-leaf~~ ✅ | | | |
| 보류 | 오프라인 baseline 비교(CatBoost) | `scripts/train.py` | 모델 한계 진단용, 트리거 방향 우선이라 후순위 |

> 운영 전환(사내 API, 알림 추상화, 카카오맵, UI)은 ML 고도화 이후. 상세는 [[project-ml-priority]]

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

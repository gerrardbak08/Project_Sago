# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 마지막 커밋
`feat(ml): Phase 2 신뢰도 게이팅 + leaf class_counts export` (2026-05-30)

## 방금 완료
### HANDOFF 시스템 구축
- `.claude/HANDOFF.md` 생성 — 새 채팅 시작 시 즉시 파악용 파일

### Phase 2 — leaf class_counts + 신뢰도 게이팅
- **`scripts/train.py`** → `_export_tree_rules`: 리프 노드에 `class_counts` 추가 (`tree_.value` 기반, conformal prediction 전제)
- **`core/rule_matcher.py`** → `compute_confidence()` 추가
  - level 0 + ≥15건 → high, <15건 → med
  - level 1 + ≥10건 → med, <10건 → low
  - level 2 → low (항상)
- **`core/llm.py`** → `generate_guide` / `generate_guide_mock` / `build_user_prompt`에 `confidence` 파라미터 관통
  - low 시 Mock: `위험_요약` 앞에 `[데이터 부족 — 참고용]` 접두어
  - low 시 Bedrock: 프롬프트에 '참고용 가설 톤' 지시 추가
- **`lambdas/notify/handler.py`** → `compute_confidence` 배선, 결과에 `confidence` 키 추가, low 시 `⚠️ [데이터 부족 — 참고용 가설]` 배지 출력
- **`lambdas/batch/handler.py`** → 동일 배선

## 다음 작업 (Phase 2 나머지)
1. **conformal prediction + temperature scaling** (Phase 2 마지막)
   - `scripts/train.py` 오프라인: MAPIE로 class-wise 커버리지 캘리브레이션 → `calibration.json` export
   - `core/rule_matcher.py`: `compute_confidence()` 를 `calibration.json` 기반 보정치로 교체
   - `lambdas/batch/handler.py`: `calibration.json` 로드 + 런타임 적용

## 대기 중인 결정
- conformal prediction 도입 전 **캘리브레이션 세트 크기 확인** 필요 (cust 1481행, emp 448행 — 부족 시 보정 출력 보류 정책 검토)

## 건드리지 말 것
- `processed/*.csv` — 절대 수정·덮어쓰기 금지
- 인프라 변경 시 `./deploy.sh` 경유, raw `terraform apply` 금지

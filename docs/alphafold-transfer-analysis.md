# AlphaFold 오픈소스 → SAGO 안전 ML 모델 적용 분석 보고서

> 대상 시스템: SAGO AI 안전가이드 (DecisionTree → JSON export → Lambda 순수 트리순회 추론)
> 검증 범위: 모든 코드 인용은 실제 리포(`core/rule_matcher.py`, `scripts/train.py`, `core/llm.py`, `lambdas/batch/handler.py`, `lambdas/notify/handler.py`, `core/rule_enrichment.py`)를 직접 읽어 확인함.
> 생성: 다중 에이전트 워크플로(웹 리서치 3 + 기법 적대평가 7 + 종합 1).

---

## 1. AlphaFold 오픈소스 구조 요약

### 1-1. 핵심 아키텍처

| 항목 | AlphaFold2 (Jumper 2021) | AlphaFold3 (Abramson 2024) |
|---|---|---|
| 입력 | 단백질 단일서열 + **MSA(다중서열정렬, 공진화 신호)** + 템플릿 | 단백질·DNA·RNA·리간드·이온 토큰화 (다종 복합체) |
| 표현 | MSA 표현 + pair 표현 (이중 트랙) | single + pair 표현 중심 (MSA 비중 대폭 축소) |
| 트렁크 | **Evoformer 48블록** (row/col gated attention, outer product mean, **triangle multiplicative update + triangle self-attention**) | **Pairformer 48블록** (MSA 4블록 경량화 + pair-weighted averaging) |
| 구조 생성 | **Structure Module + IPA**(Invariant Point Attention), torsion/frame 예측, FAPE 손실 | **Diffusion 모듈** (원자 좌표 직접 생성, 구조 분포 산출) |
| 반복 | **Recycling** (출력 표현 되먹임, 통상 3회) | 동일 계열 |
| 학습 전략 | **Noisy-Student 자가증류** (Uniclust30 35만 서열 의사라벨) | — |
| 신뢰도 헤드 | **pLDDT**(per-residue 0~100), **PAE**(pairwise 오차), **pTM** | pLDDT/PAE/**PDE**, diffusion rollout에 대해 학습 |
| 성능 | CASP14 중앙값 GDT 92.4, 평균오차 ~1.6Å | PoseBusters에서 AF3 ~76% |

### 1-2. OSS·라이선스·상업적 사용 가능성

| 구현 | 코드 라이선스 | 가중치 | 상업적 사용 |
|---|---|---|---|
| **deepmind/alphafold (AF2)** | Apache 2.0 | CC BY 4.0 | **가능** (출처표시, 임상 비권장 고지) |
| **OpenFold** | Apache 2.0 | 자체 학습 가중치 공개 | **가능** (PyTorch 재학습 재현체) |
| **ColabFold** | (AF2 기반) | — | MMseqs2로 MSA 가속 |
| **deepmind/alphafold3** | **CC-BY-NC-SA 4.0 (비상업)**, 추론 코드만 | 폼 신청·승인 게이트, 비상업 한정 | **사실상 불가** |
| **Chai-1** | Apache 2.0 | 공개 | **가능** |
| **Boltz-1** | MIT | 학습 코드·가중치 포함 | **가능** (최초 완전 상업가능 AF3급 OSS) |
| **Protenix (ByteDance)** | Apache 2.0 | 코드·가중치 모두 | **가능** |

**운영 교훈**: AF3 본체는 비상업 게이트이지만 동일 성능 재현체(Boltz/Protenix)가 Apache/MIT로 빠르게 대체했다 — 외부 모델 채택 시 **가중치 라이선스·게이트 여부 사전 검증** 필수.

---

## 2. 정직한 결론 먼저 — AF의 *문자 그대로의 아키텍처*는 이식되지 않는다

**AlphaFold의 핵심 연산(MSA attention / triangle attention / IPA / diffusion)은 18피처 tabular 안전모델에 직접 이식할 수 없다.** 겸손이 아니라 도메인 사실이다.

| AF 메커니즘 | 성립 전제 | 우리 모델에서의 부재 |
|---|---|---|
| **Triangle attention** | 잔기쌍 거리의 **삼각 부등식** 물리 사전지식 | 18개 평면 피처에 `Nres` 축도, 거리 일관성 제약도 없음 |
| **MSA / Evoformer** | 수백~수천 동족 서열의 **공진화 신호** | 사고는 동족 서열 같은 외부 정렬 집합이 없음(단 "유사 사례 조건화" 추상개념은 §3에서 생존) |
| **IPA / Structure Module** | 3D 강체 프레임, 회전·병진 불변성 | 출력이 3D 좌표가 아니라 사고유형 분류 + 텍스트 가이드 |
| **Diffusion 구조 생성** | 연속 원자 좌표 분포 생성 | 출력이 좌표가 아님 |
| **Recycling** | **학습된 연속 표현(tensor)** + recycling-aware 학습 | `compute_leaf_id`(`rule_matcher.py:33`)는 결정론적 트리순회 — 되먹일 표현 없음 |

요약: AlphaFold은 단백질 3D 기하 전용 머신이며, 그 가치는 "기하학적 사전지식을 attention bias로 주입"하는 데서 나온다. 우리 문제(소표본·다중클래스·불균형 tabular + LLM 생성)에는 그 기하 신호가 존재하지 않는다.

---

## 3. 그럼에도 진짜 이식 가능한 *개념* (기법별)

판정: **genuine**(AF 진짜 유래 + 우리 자산 정렬) / **partial** / **stretch**(이름만 빌림, 도메인 부적합).

| AF 유래 개념 | 우리 파이프라인 매핑 | 구체 적용법 | 임팩트/노력 | 판정 |
|---|---|---|---|---|
| **pLDDT·PAE식 보정 신뢰도** → conformal prediction + temperature scaling | `match_with_fallback`가 `fallback_level` 반환(`rule_matcher.py:65`), `batch/handler.py:173,176` 저장. **단 보정 안 됨, 클래스 확률조차 없음** — `train.py:226-244`가 leaf에 `samples`만 export하고 `tree_.value`(클래스 카운트) 누락 | ①`train.py`에 leaf `class_counts` 추가 ②held-out으로 temperature T + class-wise(APS/Mondrian) q̂ 오프라인 적합→`calibration.json` ③`rule_matcher.py`에 `compute_confidence()` 순수 연산 ④`batch/handler.py` 첨부 ⑤`llm.py` 게이팅 | medium / medium | **genuine / recommend** |
| **MSA식 검색-조건화** → leaf 사례 kNN/임베딩 재정렬 | retrieval 이미 존재하나 거칢: `_build_leaf_table`=인덱스, `compute_leaf_id`=쿼리, `llm.py`=결과 사용. **공백**: leaf 내부 순위 전무 — Mock은 `llm.py:516` `incidents[:5]` 임의 절단, Bedrock은 leaf 전체(cust 20~39건) 무정렬 덤프 | ①[즉시·의존성0] `llm.py`에 순수 파이썬 kNN 재정렬('오늘 조건' vs incidents 가중거리 상위 k건만). `train.py`가 피처별 분위수/IQR을 `metadata.json`에 export 필요 ②siblings로 cross-leaf 확장 ③[신중] Bedrock Titan 임베딩 코사인 재정렬 | medium / low | **genuine / recommend** |
| **신뢰도 기반 산출물 게이팅** | `fallback_level`+`leaf_summary.total`+`rule_enrichment.py:278` `risk_level` 모두 계산·전파되나 `llm.py`·`notify/handler.py:238`이 활용 안 함 | `rule_matcher`에 high/med/low 라벨 → `llm.py` low면 '참고용 가설'·단정 금지(기존 `today_recurrence_likelihood` enum prior로 연결) → `notify`에서 low 매장 배지 + 운영자 검토 플래그 | medium / low | **partial / consider** |
| **자가증류(Noisy-Student)** | 부적합: ⓐ원천 DB 이미 100% 라벨링 ⓑ버려지는 행은 y가 아니라 X(위경도→날씨) 결손 ⓒteacher가 26.3%/5.6% 무작위 수준 | — (데이터 보강은 매장 퍼지매칭으로 X 복구 / LLM oracle 라벨 *검증*) | low / high | **stretch / avoid** |
| **Recycling / 반복 정제** | 되먹일 학습된 표현 없음. `compute_leaf_id` 결정론적 | — (강제 시 Bedrock 콜 2~3배, 비용·지연만↑) | low / medium | **stretch / avoid** |
| **Pair표현 + Triangle attention** | 이식 시 `train.py`·`rule_matcher.py`·5종 JSON·Lambda 패키징 전부 무효. 448~1481행에 깊은 트랜스포머 과적합 확정 | — | low / high | **stretch / avoid** |
| **단일 트리 → CatBoost/TabPFN 교체** | **오진 기반**: 코드에 `predict/proba/argmax` 없음 — 트리는 분류기가 아니라 **leaf 라우팅=사례검색 인덱스**. 26.3%/5.6%는 leaf 클래스순도일 뿐 가이드 입력 아님. TabPFN은 PyTorch라 sklearn-free Lambda 제약 위반 | — (단 §5 *오프라인 평가* baseline으로만 가치) | low / high | **stretch / avoid (단 §5)** |

`deep ensembling`: AF2 논문 자체가 "앙상블 없이도 정확도 거의 동일"이라 근거 약함 → **avoid**.

---

## 4. 우선순위 로드맵 (impact↑ / effort↓)

> **전제**: 우리 트리는 **분류기가 아니라 retrieval 인덱스**다. 아래 어떤 항목도 26.3%/5.6% "정확도 숫자"를 직접 올리지 않는다. 진짜 임팩트는 **안전가이드 품질 + 정직한 신뢰 표기**다.

### Phase 1 — 즉시 (effort low, 새 의존성 0, Lambda 제약 무관)
| 항목 | 건드릴 파일 | 검증법 |
|---|---|---|
| 유사 사례 kNN 재정렬 | `core/llm.py`(`build_user_prompt`에 `rank_incidents` 삽입; Mock `incidents[:5]`도 교체) | today_precautions 기상 Δ 절댓값 합 감소 + 사람 평가 |
| 신뢰도 게이팅 | `core/rule_matcher.py`(라벨), `core/llm.py`(톤 분기), `lambdas/notify/handler.py:238`(배지) | low 비율이 전 매장 ~100%로 붕괴 안 하는지 |
| 피처별 분위수/IQR metadata export | `scripts/train.py` `_build_metadata` | 정규화 거리에서 매출·면적이 기상 압도 안 하는지 |

### Phase 2 — 단기 (effort medium, 오프라인 계산 + 런타임 순수 산술)
| 항목 | 건드릴 파일 | 검증법 |
|---|---|---|
| leaf class_counts export (보정 전제) | `scripts/train.py:226-244`(신규 키 **optional**, 누락 시 graceful degrade) | 기존 아티팩트·테스트 회귀 확인 |
| conformal 예측집합 + temperature scaling | MAPIE는 **오프라인 캘리브레이션만**, export된 q̂/T만 런타임 적용 → `rule_matcher.py` `compute_confidence`, `batch/handler.py`, `llm.py` 게이팅 | class-wise 커버리지 검증. calibration set 부족 시 신뢰도 출력 보류 |
| cross-leaf 재정렬 | `core/rule_matcher.py`(siblings 확장) + `core/llm.py` | 축 경계 너머 회수율 |

### Phase 3 — 신중·조건부 (effort high 또는 운영 리스크)
| 항목 | 건드릴 파일 | 검증법 |
|---|---|---|
| Bedrock Titan 임베딩 코사인 재정렬 | `scripts/train.py`(배치 1회, **별도 산출물** — processed CSV 수정 금지) + `core/llm.py` | 산출물 크기·콜드스타트·재현성 |
| 오프라인 baseline 비교(CatBoost 등) | `scripts/train.py` 오프라인만, 런타임 JSON 불변 | macro-F1/top-k로 leaf 라우팅 품질 vs GBDT |

**제외(avoid)**: Recycling 강제 루프, FT-Transformer/triangle attention, 자가증류, 서빙 모델 교체, deep ensembling.

---

## 5. 정확도의 *진짜 지렛대* — AF 기하가 아니라 이것

AlphaFold 정확도는 풍부한 데이터(PDB 17만 + 무한 unlabeled 서열) + 거의 완벽한 신호(공진화·기하 제약)에서 나온다. 우리 통증은 정반대(cust 1481행/5클래스 26.3%, emp 448행/13클래스 5.6% = 다중클래스 무작위 수준). 진짜 레버 3가지:

| 진짜 지렛대 | 왜 AF 기하보다 우선인가 | 액션 |
|---|---|---|
| **① 평가지표 재정의 [최우선]** | accuracy 26%/5.6%는 무작위 수준 → 잘못된 목표 최적화 가능성. 모델 교체보다 먼저 | accuracy 폐기 → macro-F1 / balanced-acc / **top-k** / per-class recall / 예측집합 커버리지 (`train.py` 오프라인 평가) |
| **② tabular SOTA 현실** | 단일 트리는 SOTA 아님. GBDT > 단일트리, TabPFNv2가 소표본 sweet spot. 단 우리 트리는 retrieval 인덱스라 서빙 교체는 과대비용 → 오프라인 비교만 | `train.py` 오프라인에서 CatBoost/TabPFN과 leaf 라우팅 품질 비교 |
| **③ 신뢰도 보정 (pLDDT 정신)** | 정확도를 못 올려도 "모를 때 모른다"를 정직히 신호화하면 안전 오탐 비용↓. 단정적 수칙을 무작위 예측으로 내보내는 건 신뢰·법적 리스크 | §4 Phase 2 conformal/temperature + abstain → LLM 톤 게이팅 |

> **우선순위 전도 금지**: §4의 kNN·게이팅은 가이드 품질 레버이지 정확도 레버가 아니다. `fallback_level`을 보정 없이 '신뢰도'로 포장하지 말 것 — 'retrieval 적합도'로 정직히 한정 표기.

---

## 6. 3줄 요약 + 다음 액션

1. AlphaFold *아키텍처*(MSA/triangle/IPA/diffusion)는 단백질 3D 기하 전용 → 18피처 tabular 안전모델에 직접 이식 불가. 직접 이식 가능한 건 **개념 2가지뿐**: ①예측과 분리된 보정 신뢰도(pLDDT→conformal), ②유사 사례 검색-조건화(MSA→leaf kNN 재정렬).
2. 우리 트리는 분류기가 아니라 **retrieval 인덱스**(코드상 `predict` 부재) → 26%/5.6% "정확도"를 올리려 모델을 갈아엎는 건 오진. 진짜 임팩트는 가이드 품질 + 정직한 신뢰 표기.
3. 정확도의 진짜 지렛대는 AF가 아니라 **평가지표 재정의 → 오프라인 baseline 비교(CatBoost/TabPFN) → 신뢰도 보정** 순. AF에서 빌릴 건 "예측 + 자기신뢰도를 1급 출력으로"라는 *설계 철학*.

**다음 액션 (택1)**
- **(A)** 가장 싸고 즉시 — `core/llm.py` 유사 사례 kNN 재정렬. 새 의존성·재학습 0, 파일 1개.
- **(B)** 정직성 강화 — 신뢰도 게이팅(`fallback_level`/leaf 표본수 → low/med/high 라벨 → 톤 다운 + 운영자 검토).
- **(C)** 근본 레버 — `scripts/train.py` 오프라인 평가를 macro-F1/top-k로 재정의.
- **(D)** 보정 신뢰도 본격 — Phase 2 전체(class_counts → conformal → 런타임 적용 → LLM 게이팅).

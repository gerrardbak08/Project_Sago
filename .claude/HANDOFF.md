# HANDOFF — 마지막 작업 현황

> 이 파일은 Claude가 세션 끝마다 갱신합니다. 새 채팅에서 "파악해" 한 마디면 여기만 읽으면 됩니다.

---

## 이번 세션 (2026-06-10) — 알림 파이프라인 완성: 랜딩 페이지 배선

### Phase 1-1 완료: batch Lambda → S3 랜딩 페이지 자동 생성 배선
- `lambdas/batch/handler.py` 에 `_upload_guide_page()` 함수 추가
  - `GUIDE_BUCKET` 또는 `FRONTEND_BUCKET` 환경변수 참조
  - `scripts/build_guide_page.build(guide_result)` 호출 → `guide/{date}/{store_code}.html` 업로드
  - 베스트 에포트 (실패해도 알림 발송 차단 없음)
- `_record_alert` 의 S3 record에 `guide_key` 필드 추가 (대시보드 탭 링크용)
- 발동 위치: 트리거 통과 + 쿨다운 통과 매장만 → 발송 직후, `_record_alert` 직전
- `notify/handler.py`의 `_upload_guide_page`와 동일 로직 (코드 중복 있으나 Lambda 분리 구조상 허용)

### 확인된 완전한 엔드-투-엔드 플로우
```
EventBridge 06:00 → batch Lambda
  → 위험 점수 계산 (_score_store)
  → 트리거 게이트 통과
  → Bedrock LLM 가이드 생성 (_generate_guide_for)
  → 카카오 피드 카드 발송 (notifier.send_guide)
  → 랜딩 페이지 HTML 생성 + S3 업로드 (_upload_guide_page) ← 이번 세션
  → 현황 JSON 기록 (_record_alert, guide_key 포함)
  → 알림 상태 쿨다운 업데이트
```

### 잔여 (다음 세션)
- **deploy.sh 실행** — 이번 변경사항 Lambda 반영
- **Amplitude / Accoil API Key** 발급 → `proj/.env.local`
- **images/ S3 동기화** — deploy.sh에 배선 필요
- 카카오 `_guide_link` URL이 실제 `FRONTEND_BUCKET` 도메인 + `guide/{date}/{store}.html` 경로를 가리키는지 확인 (`core/notifier.py` → `_guide_link` 생성 로직)
- ML 축3 (기상예보 N일 선제 알림), 축4 (임계 자가보정)

---

## 이전 세션 (2026-06-09) — 트래킹·픽토그램·자율 오케스트레이션

### 픽토그램 10종: 실사 GIF → ISO 졸라맨 스타일 교체
- `scripts/make_pictogram_gifs.py` 신규: rsvg-convert 기반 SVG→GIF 파이프라인
- 카테고리 10종 모두 ISO 스타일 졸라맨 픽토그램으로 교체 (images/ — gitignore, S3 동기화 필요)

### Product Tracking 전체 파이프라인
- `.telemetry/product.md` — 제품 모델 정의
- `.telemetry/current-state.yaml` — no-tracking 판정, 5개 우선 이벤트 도출
- `.telemetry/tracking-plan.yaml` + `delta.md` — 트래킹 플랜 설계 완료

### 트래킹 구현
- `proj/src/utils/analytics.js` (신규): 공통 analytics 유틸리티
- `AlertSend`, `StoreRiskMap`, `App.jsx` 이벤트 5종 배선
- Amplitude SDK 설치 (`@amplitude/analytics-browser`) + Accoil CDN 배선
- API 키 위치: `proj/.env.local` (발급 후 입력 필요)

### 알림 후속 수정
- `#7` `title` 200자 상한 적용
- `#8` `_guide_link` S3 가드 (미생성 시 404 방지)
- Dead code 제거

### 잔여 (다음 세션)
- **Amplitude API Key / Accoil API Key** 발급 및 `proj/.env.local` 입력
- **images/ S3 동기화** — `./deploy.sh` 실행
- ML 축3 (기상예보 N일 선제 알림), 축4 (임계 자가보정)

---

## 이번 세션 (2026-06-08) — 미커밋 정리 + 픽토그램 default 완성

### 커밋 3개
- `feat(notify)`: 알림 정합성·품질 6건 + 이미지 스크립트 + 테스트 89 passed
- `feat(frontend)`: StoreRiskMap Places 좌표 재해상 + 데이터 갱신
- `chore(agents)`: Claude 에이전트 조직도 신설

### 픽토그램 3레이어 10종 완전 (images/ — gitignore, S3 동기화 필요)
| 레이어 | 경로 | 수 | 크기 |
|---|---|---|---|
| 경고 표지판 | images/categories/*.png | 10종 | 800×400 |
| 실사 장면 | images/scenes/*.png | 10종 | 886×665 |
| 애니 GIF | images/scenes/anim/*.gif | 10종 | 480×360, 18f |
- default.png/gif: PIL로 직접 생성 (안전 삼각형 + 락온 GIF). scripts/out/ → .gitignore 추가

### 잔여 (다음 세션)
- `tests/test_train_outputs.py` sklearn importorskip (pytest collection 중단)
- 알림 후속: #7 제목 길이 상한, #8 `_guide_link` S3 가드
- **images/ S3 동기화** — deploy.sh에 배선 필요 (이미지 실제 반영은 여기서 막힘)
- ML: score 정규화, v2 발동률 dry-run, S1 역변별 근본 검토

---

## 이전 세션 (2026-06-06) — 에이전트 조직도 + 카카오 알림 정합성·품질 고도화

### 에이전트 조직 신설 (`.claude/agents/`)
- **sago-orchestrator**(opus) + 워커 6종(ml·frontend·notify·infra·data·qa). 오케스트레이터: HANDOFF 읽기→분해→Task 위임→가드레일 강제→HANDOFF 갱신.
- ⚠️ 커스텀 에이전트는 **세션 재시작 후** 레지스트리 등록. 커밋 시 팀 공유.

### 카카오 알림 정합성·품질 고도화 (sago-orchestrator 주도: 감사→수정→테스트)
워커 2개 병렬 읽기전용 감사 → 결함 도출 → 수정:
- **#1** `scripts/build_alarm_preview.py`: `keywords`(없는 키)→`category_for` 재사용. 미리보기가 항상 default.png만 보이던 버그. 재물→property.png 확인.
- **#2** `lambdas/notify/handler.py` `_build_message_body`: 존재하지 않는 키(`오늘의_특별_주의사항`)를 읽어 text 채널 수칙 전체 누락 → `KakaoNotifier._precautions` 재사용(신·구 스키마 양립).
- **#3** `core/notifier.py` `build_template`/`_compose_description`: 신뢰도 **low 카드에 "[데이터 부족·참고용]" caveat 주입** (text엔 있었으나 피드 카드 누락이었음).
- **#4** `core/safety_visuals.py` `category_for`: 양방향 substring→정확일치 우선+2자 가드("사"→health 오매칭 차단).
- **#5** `core/notifier.py` `_select_source`: 비-dict results 크래시 방어(`'str'.get`).
- **#6** `core/notifier.py` `_truncate`: 끝의 고아 마커(②) 제거.
- **신규 `tests/test_notifier.py`**: 38개(실 alert 11 계약 + #3·#4·#5·#6 회귀 가드). 전체 **89 passed**(notifier 경로 테스트 0건→커버).

### 다음 검토 (감사 잔여)
- `tests/test_train_outputs.py` 의 sklearn import가 `pytest tests/` 전체 collection 중단 → `importorskip` 필요(sago-ml/qa 영역).
- #7 제목 길이 상한, #8 `_guide_link` S3 페이지 존재 가드(미생성 시 404), `images/scenes/default.png` 부재 — 후속.

---

## 이번 세션 (2026-06-02) — 카드/실사/랜딩 (전부 미커밋)
> ML 모델은 변경 없음. 알림 카드 비주얼 + 수신자 랜딩 페이지 구축.
- 카드 빌더 개선([core/notifier.py]): 위험도 높은 소스 선택·수칙 먼저·등급 제목. 이미지 계층 = 사례사진→실사장면→경고표지판→브랜드기본
- 경고표지판 10종(`images/categories/`) + **실사 장면 9종**(`images/scenes/`, 고정 여성+다이소 유니폼) + **무료 애니 GIF 9종**(`images/scenes/anim/`, PIL 모션)
- 수신자 모바일 랜딩 페이지 생성기 `build_guide_page.py`(카드 탭→풍부한 가이드, 히어로 GIF). 카드 링크 `_guide_link`→가이드 페이지로 교체
- 신규: core/safety_visuals.py, scripts/{gen_scene,build_scenes,annotate_scene,animate_scene,build_guide_page,preview_card}.py
- 이미지 생성: 유료 API 전부 막힘(OpenAI 결제·Gemini 이미지 유료·Bedrock legacy) → **무료 Pollinations(flux) 확정**. provider 교체식이라 결제 시 승급
- 카카오: Client Secret 등록, 토큰 .env 갱신(access6h/refresh60d). 친구0(개발단계)→ 본인발송(memo)으로 검증. GIF 카드 업로드 시 .gif 보존 확인
- ⚠️ 미반영: 이미지·GIF·페이지 **S3 동기화**, 배치 페이지 생성/업로드 배선, **전체 커밋**, 미커밋 emp ML 산출물

## ML 모델 객관 평가 (2026-06-02 측정·재현)
2축 구조:
- **트리(검색 인덱스)** — cust 56리프/depth12/entropy, emp 23리프/depth10/gini. *분류기로는 약함*: cust balanced_acc **0.31**(랜덤0.20)·f1_macro0.24 / emp **0.08**(랜덤~0.08)·f1_macro0.04 → 타입분류 신뢰 낮음, '사례 풀'로만 사용.
- **위험점수 트리거(운영 핵심)** — 로지스틱(S1·S2·S3) + 실제 비사고 라벨. **score AUC cust 0.845 / emp 0.831**(재현됨, test≈train 과적합 적음).
  - 변별력 전원이 **S2(사례근접 kNN)** = cust0.841/emp0.831. S1(조건위험) 역·무변별, S3(심각도) 무변별.
- 보정(conformal): cust T0.9·q̂0.851·n297·5클래스, emp 유효.
- **한줄 결론**: "매장×조건 *위험일* 이진 판별기로 쓸 만함(AUC~0.84). 단 신호=사례유사도 **단일축**, 타입분류·emp는 데이터 한계로 약함."
- 재현: `python3 scripts/simulate_triggers.py --source {cust,emp} --evaluate`

## 마지막 커밋
`feat(ml): 비사고 데이터 구축 + 가중치 재학습 — cust AUC 0.57→0.85` (2026-06-01)

## 방금 완료 — 비사고 데이터 구축 → 진짜 변별력 측정 → 가중치 재학습

> 계획: [.claude/plans/greedy-bubbling-kite.md] (비사고 데이터 편)
> 동기: 위험 점수 엔진의 AUC가 누수 제거 후 0.49(동전던지기)였음 — negative 데이터 부재가 원인

### 핵심 성과: cust score AUC 0.572 → **0.845**
- **비사고 데이터 구축**: 같은 매장·같은 계절(±45일) 비사고일의 **실제 archive 날씨** 수집 (랜덤 생성 아님). cust 304매장/2292건 (`data/non_incidents_cust.csv`)
- **진짜 변별력 측정** (leave-one-out 누수 차단, 공정 매장 매칭):
  - S2(사례근접) AUC **0.841** — 강한 신호 확정
  - S1(조건위험) 0.344 — **역변별**(enrich_leaf_rule risk_level이 실제 사고와 반대)
  - S3(심각도) 0.528 — 거의 무변별(leaf 상수)
- **가중치 재학습** (로지스틱): S1=-1.94, S2=+7.22, S3=-1.47 → score AUC **0.845** (train 0.839/test 0.855, 과적합 적음). `models/cust/risk_policy.json` v2-learned

### 신규/변경 파일
- `core/weather.py`: get_weather_range() + 429 backoff 재시도
- `scripts/build_non_incidents.py` (신규): 비사고 수집(resume/중간저장)
- `scripts/fit_risk_weights.py` (신규): 로지스틱 가중치 재학습 → risk_policy.json
- `scripts/simulate_triggers.py`: evaluate()(라벨 AUC), diagnose()(신호×음성축 매트릭스), apply_policy
- `core/risk_score.py`: case_proximity exclude_ids (leave-one-out 평가)

### emp 결과 (추가 완료)
- emp 332매장 1341건 수집 완료 (`data/non_incidents_emp.csv`)
- 가중치: S1=-0.149, S2=+5.685, S3=-0.216 → score AUC **0.831** (train 0.822 / test 0.852)
- `models/emp/risk_policy.json` v2-learned 갱신

### ⚠️ 다음 세션 검토 포인트
2. **score 정규화** — 학습 가중치로 score가 0~1 벗어남(음수가중, 평균 3.8). trigger/severity 동작은 정상(θ도 같은 분포)이나 _record_alert·대시보드 표시는 정규화 검토
3. **발동률 재측정** — v2 정책의 실제 발동률을 batch dry-run으로 확인, θ 조정
4. **S1 역변별 근본 검토** — enrich_leaf_rule risk_level이 사고와 반대인 이유(rule_enrichment 임계 재점검). 현재는 학습이 음수가중으로 자동 교정 중

## 이전 완료 — 위험 점수 트리거 엔진 (방향 전환: 검색품질 → 트리거 알림)

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

# 다이소 근로자 캐릭터 — Rive 리깅 가이드

> 이 문서는 Rive 애니메이터(사람/외주)를 위한 작업 지시서입니다.
> 캐릭터 디자인·레이어 분해·시나리오 명세·웹 통합은 모두 준비되어 있습니다.
> **애니메이터가 채울 것은 "움직임"뿐입니다.**

## 0. 입력 파일
- `daiso_worker_rig.svg` — 부위별 명명 레이어로 분해된 캐릭터 (Rive Import)
- `../scenario_expression_map.json` — 사고유형별 표정·포즈·모션·트리거 명세

## 1. Import & 본(Bone) 계층
`daiso_worker_rig.svg`를 Rive에 Import하면 아래 `id` 그룹이 그대로 들어옵니다. 권장 본 계층:

```
root (골반 60,116)
├─ spine → torso (+ apron, nametag 자식)
│   ├─ neck → head (face_* 5종, hair_front, ponytail 자식)
│   ├─ shoulder_L → arm_L → hand_L
│   └─ shoulder_R → arm_R → hand_R
├─ hip_L → leg_L → shoe_L
└─ hip_R → leg_R → shoe_R
```

피벗(관절) 좌표는 SVG 주석에 명시: 목(60,52)·어깨(41/79,68)·팔꿈치(38/82,90)·고관절(52/68,118)·무릎(49/71,138).
팔/다리는 단일 shape이므로 **Mesh + Bone 변형**으로 굽힘을 주세요(상박/하박 분리 불필요).

## 2. 표정 = 상태머신 입력
`head` 그룹 안에 표정 5종이 들어있고, **하나만 visible**(`face_default`), 나머지는 `display:none`:
- `face_default` 기본 · `face_safe` 안전 · `face_shock` 놀람 · `face_pain` 아픔 · `face_warn` 주의

→ Rive에서 **`expression` (Number/Enum) 입력**을 만들고, 값에 따라 해당 face 레이어만 opacity 100, 나머지 0으로.

## 3. 만들 애니메이션 (State Machine: `accident`)
`scenario_expression_map.json`의 `rive_trigger` 와 1:1로 트리거를 만드세요:

| Trigger | 동작 | 표정 | 우선순위 |
|---|---|---|---|
| `slip` | 걷다 물기에 미끄러져 뒤로 자빠짐 | shock | ★ 데모 1순위 |
| `fall` | 단차에서 앞으로 떨어짐, 팔 방어 | shock | ★ |
| `collision` | 부딪혀 휘청·반동 | shock | |
| `strain` | 상자 들다 허리 삐끗 | pain | |
| `cut` | 베여서 손 움켜쥠 | pain | |
| `health` | 가슴 쥐고 무릎 꺾여 주저앉음 | pain | |
| `property` | 낙하물 보고 움찔 물러남 | shock | |
| `claim` | 난처한 손짓(굽신) | warn | |
| `default` | 경고 가리키기 | warn | |
| `idle_safe` | 밝게 손 흔들기/엄지척 | safe | 평상시 |

각 클립은 **2~3초, 끝에서 정지(hold) 후 idle 복귀** 권장 (웹 루프용).

## 4. 전달 포맷
- **`daiso_worker.riv`** 1개 파일 (모든 트리거·표정 상태머신 포함)
- 상태머신 이름: `accident`
- 입력: `expression`(Number 0~4), 트리거 10종(위 표)
- 캔버스 투명 배경

## 5. 통합(자동) — 애니메이터가 신경 쓸 필요 없음
`daiso_worker.riv` 를 `proj/public/character/` 에 두면:
- 웹 가이드 랜딩페이지가 `@rive-app/react-canvas` 로 재생 (카드 클릭 시)
- 대시보드 위험지도/가이드에서도 동일 재생
- 배치 Lambda가 매장 dominant 사고유형 → 해당 trigger 자동 발동
통합 코드는 `proj/src/components/shared/CharacterPlayer.jsx` 에 이미 작성됨.

## 6. 대안 (Rive 작업 전까지 임시)
`.riv` 가 아직 없으면 `CharacterPlayer` 가 **정지 PNG(시나리오별 표정/포즈)** 로 자동 폴백합니다.
정지컷은 `scripts/character/` 파이프라인으로 자율 생성 가능 → 모션 완성 전에도 서비스 가능.

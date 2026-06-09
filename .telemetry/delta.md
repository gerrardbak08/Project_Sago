# Tracking Delta — Current → Target

## 완료 (이번 세션)

| event_name | 발화 위치 |
|---|---|
| `tab_viewed` | `proj/src/App.jsx` — 탭 전환 및 대시보드 모드 전환 시 발화 |
| `alert_send_submitted` | `proj/src/components/tabs/alert/AlertSend.jsx` — 알림 전송 버튼 클릭 시 |
| `alert_send_result` | `proj/src/components/tabs/alert/AlertSend.jsx` — Lambda 응답 후 성공/실패 분기 |
| `ai_guide_requested` | `proj/src/components/tabs/worker/StoreRiskMap.jsx` — AI 가이드 요청 시 |
| `ai_guide_result` | `proj/src/components/tabs/worker/StoreRiskMap.jsx` — AI 응답 수신 후 성공/실패 분기 |

Analytics 추상화 레이어: `proj/src/utils/analytics.js`
- Amplitude npm SDK + Accoil CDN global 동시 지원
- 키 없이도 동작 (콘솔 로그 + 내부 큐잉, 최대 100건)

---

## SDK 연동 대기

### Amplitude
- 키 위치: https://app.amplitude.com → Settings → Projects → 프로젝트 선택 → API Key
- 설정 파일: `proj/.env.local` — `VITE_AMPLITUDE_API_KEY=<키 붙여넣기>`
- 활성화: `npm run dev` 재시작 (또는 프로덕션 빌드 시 환경 변수 주입)
- 현재 상태: 키 란이 비어 있음 (`VITE_AMPLITUDE_API_KEY=`)

### Accoil
- 키 위치: https://app.accoil.com → Settings → API Key
- 설정 파일: `proj/.env.local` — `VITE_ACCOIL_API_KEY=<키 붙여넣기>`
- 활성화: Accoil은 CDN 스니펫 방식이므로 `proj/index.html`에 스니펫 삽입 필요
  (analytics.js는 `window.accoil.track` 전역을 자동 감지해 사용)
- 현재 상태: 키 란이 비어 있음 (`VITE_ACCOIL_API_KEY=`)

---

## 미구현 이벤트

| event_name | 우선순위 | 파일 (예상) | 예상 작업량 |
|---|---|---|---|
| `data_uploaded` | 높음 | `components/shared/UploadPanel.jsx` | 소 (1–2 track 호출) |
| `filter_applied` | 높음 | `App.jsx` (yearFilter, roleFilter 변경 핸들러) | 소 (2–3 track 호출) |
| `risk_map_store_clicked` | 중간 | `components/tabs/worker/StoreRiskMap.jsx` | 소 (마커 클릭 핸들러에 1 track) |
| `export_triggered` | 중간 | `utils/exportUtils.jsx` | 소 (내보내기 함수 진입부에 1 track) |
| `admin_login_attempted` | 중간 | `components/admin/AdminLoginPanel.jsx` | 소 (로그인 submit에 2 track — 시도/결과) |
| `approval_data_loaded` | 낮음 | `src/data/approvalData.js` 또는 로더 컴포넌트 | 소 (데이터 로드 완료 시 1 track) |
| `period_comparison_toggled` | 낮음 | `components/shared/PeriodComparison.jsx` | 소 (토글 핸들러에 1 track) |
| `page_viewed` | 낮음 | `App.jsx` 또는 `main.jsx` (초기 로드) | 소 (마운트 시 1 track, 상수 이미 정의됨) |

---

## 다음 구현 순서

1. **`data_uploaded`** — `UploadPanel.jsx`
   - 이유: 데이터 업로드는 대시보드 사용의 시작점으로, 업로드 성공률과 파일 형식 분포 파악이 운영 품질 관리에 즉시 활용 가능. 구현이 단순해 빠르게 ROI 확보 가능.

2. **`filter_applied`** — `App.jsx` (yearFilter, roleFilter 변경 핸들러)
   - 이유: 필터 사용 패턴(어떤 연도·역할 필터가 많이 쓰이는지)은 데이터 준비 우선순위 결정에 직접 유용. 이미 핸들러가 집중되어 있어 2–3줄로 완성 가능.

3. **`export_triggered`** — `utils/exportUtils.jsx`
   - 이유: 내보내기 빈도와 형식(PNG/CSV/PDF 등)은 현장 보고 업무 흐름 이해에 핵심. exportUtils.jsx가 단일 진입점이어서 한 곳에서 모든 내보내기를 커버할 수 있음.

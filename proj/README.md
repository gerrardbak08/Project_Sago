# ㈜아성다이소 안전보건 대시보드

React + Vite + Tailwind CSS 기반 통합 안전보건 분석 대시보드

---

## 시작하기

```bash
npm install       # 최초 1회
npm run dev       # 개발 서버 → http://localhost:5173
npm run build     # 프로덕션 빌드 → dist/
npm run preview   # 빌드 결과 확인
```

---

## 폴더 구조

```
src/
├── main.jsx                          # React 마운트 진입점
├── App.jsx                           # 최상위 컴포넌트 (모드 전환, 탭 라우팅)
├── index.css                         # 전역 스타일 (Tailwind + Pretendard)
│
├── data/                             # 초기 데이터 (상수)
│   ├── workerData.js                 # DEFAULT_DATA — 근로자 사고 538건
│   ├── storesData.js                 # MAP_STORES — 영업매장 1,337개
│   ├── customerData.js               # CUSTOMER_DATA — 고객 사고 1,512건
│   └── logo.js                       # DAISO CI 심볼 (누끼 PNG base64)
│
├── constants/                        # 전역 상수
│   ├── colors.js                     # DAISO_RED, DEEP_BLUE 등 브랜드 색상
│   ├── metrics.js                    # MIN_WAGE_DAY, CURRENT_YEAR 등
│   ├── riskColors.js                 # 재해유형별 차트 색상
│   ├── customerColors.js             # 고객사고 전용 색상
│   ├── tabs.js                       # TABS_VIEWER, HUB_LABELS, CTABS
│   └── schemas.js                    # 양식 검증 스키마 4종
│
├── utils/                            # 순수 함수 / 유틸
│   ├── format.js                     # estimateLossDays, fmtKRW, fmtShort
│   ├── uiHelpers.js                  # pct, fmt, fmtKrw, TT(Tooltip), EmptyState
│   ├── exportUtils.jsx               # exportCSV, ExportBtn 컴포넌트
│   ├── dataHelpers.js                # yoy, scaleObj, scaleRow, recalcRate
│   ├── filterData.js                 # getFilteredData (연도 필터 핵심 로직)
│   ├── parseHelpers.js               # categorizeBum, parseTenure 등
│   ├── validation.js                 # downloadTemplate, validateSchema
│   ├── parseExcel.js                 # parseExcelFile, parseExcelFileWorkers
│   ├── processData.js                # processWorkers (사원 데이터 변환)
│   ├── processAccidents.js           # processAccidents (사고 데이터 집계)
│   ├── processStores.js              # fuzzyMatchStore, computeStoreMerged
│   └── customerHelpers.js            # yearKey, compKey, cFilter
│
├── hooks/
│   └── useGeminiStream.js            # Gemini AI 스트리밍 훅
│
└── components/
    ├── shared/                       # 재사용 컴포넌트
    │   ├── Card.jsx                  # Card, TT, EmptyState, EstimateBadge
    │   ├── GeminiAiCard.jsx          # AI 사고 현황 요약 카드
    │   ├── UploadPanel.jsx           # 파일 업로드 + 검증 패널
    │   └── ChartHelpers.jsx          # CalcTip, HeatmapGrid, BarRank, Matrix
    │
    ├── layout/
    │   └── CustomerDashboard.jsx     # 고객사고 대시보드 (헤더 + 탭 라우팅)
    │
    ├── admin/
    │   ├── AdminLoginPanel.jsx       # 관리자 로그인
    │   ├── AdminUpload.jsx           # 근로자 데이터 업로드
    │   └── CustomerAdminPanel.jsx    # 고객 데이터 업로드
    │
    └── tabs/
        ├── worker/                   # 근로자 사고 탭 13개
        │   ├── Overview.jsx          # 요약 (역할별 분기)
        │   ├── DeptTeamStore.jsx     # 부서·팀
        │   ├── StoreRiskMap.jsx      # 매장위험지도 (대형 컴포넌트 1,418줄)
        │   ├── TimeSeries.jsx        # 시계열
        │   ├── CrossAnalysis.jsx     # 요인×결과
        │   ├── HumanFactors.jsx      # 인적요인
        │   ├── CostRisk.jsx          # 비용손실
        │   ├── LegalReporting.jsx    # 법적보고
        │   ├── StoreAnalysis.jsx     # 매장 IR
        │   ├── RepeatWorkers.jsx     # 재발재해자
        │   ├── SeverityAnalysis.jsx  # 의료심각도
        │   ├── ParjangDashboard.jsx  # 파트장
        │   └── StoreDeepDive.jsx     # 매장 딥다이브
        │
        └── customer/                 # 고객 사고 탭 6개
            ├── COverview.jsx
            ├── CDept.jsx
            ├── CTypePlace.jsx
            ├── CComp.jsx
            ├── CWatch.jsx
            └── CVictim.jsx
```

---

## 색상 토큰 (`src/constants/colors.js`)

| 변수 | 값 | 용도 |
|---|---|---|
| `DAISO_RED` | `#D70011` | 브랜드 레드, 근로자 모드 강조 |
| `DEEP_BLUE` | `#13245A` | 고객 모드 헤더 |
| `ALERT_RED` | `#B91C1C` | 위험 경고 |
| `SAFE_GREEN`| `#15803D` | 안전·정상 |
| `CUSTOMER_BLUE` | `#0EA5E9` | 고객 탭 강조 |

---

## Gemini AI 설정

`src/hooks/useGeminiStream.js` 파일의 `GEMINI_API_KEY`에 키를 입력하세요.
환경 변수 사용을 권장합니다:

```js
// .env
VITE_GEMINI_API_KEY=your_key_here

// useGeminiStream.js
const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;
```

---

## 라이선스

Internal use only — ㈜아성다이소

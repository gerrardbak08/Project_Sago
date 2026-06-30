# 데이터층 (Data Layer) — 사고 대시보드 재구성

> **기본 원칙**: 데이터 출처는 `accidentSource.mjs` 한 곳에서만 정의한다.
> 사장님이 raw DB(시트)만 갱신하면 대시보드 숫자가 자동 전환된다. 정적 스냅샷 없음.

## 출처 구조 (현재)

```
Google Sheet (raw DB)              Apps Script Web App                프론트(어댑터)
┌──────────────────┐  매 요청 read  ┌────────────────────────┐  JSON  ┌────────────────┐
│ 사고경위DB 시트   │ ────────────▶ │ "산재 대시보드 API v4.0" │ ─────▶ │ accidentSource │
│ 산재승인DB 시트   │               │  ?action=startup        │        │  .mjs          │
└──────────────────┘               └────────────────────────┘        └────────────────┘
```

- **엔드포인트**: `script.google.com/macros/s/AKfycbz…/exec`
- **동작 확인**: `?action=` 없이 호출 → `{"ok":true,"message":"산재 대시보드 API v4.0 — 정상 동작 중"}`
- **시트 직접 read(gviz/export)는 401** — Apps Script(소유자 권한)만 시트 접근. 즉 Apps Script가 곧 어댑터.

## API 계약 — `?action=startup&division=…&year=…&month=…`

| 키 | 내용 |
|---|---|
| `init` | `years`, `departments`(12), `accidentTypes`(15) — 필터 옵션 |
| `dashboard` | 서버 선계산 KPI/차트/`repeatStores`(47)/`yearlyTrend`(3개년) |
| `rows` | **사고경위DB 원본** (전체 612건, 2020~2026) |
| `approvalRows` | **산재승인DB 원본** (210건, 전부 approvalYn=Y) |

행 스키마: `recordId, division, year, month, stdDept, stdTeam, store, employeeNo, victimName, accidentDate, accidentType, causeObject, accidentContent, approvalYn, lostDays, kpiCategory`

`division` 파라미터: `안전보건팀`(전체) / `수도권영업부문` / `지방영업부문`

## 검증된 KPI 공식 (라이브 100% 일치 — `node verify.mjs` 로 재현)

| 지표 | 공식 | 2026 |
|---|---|---|
| 사고경위 총건수 | `rows` 연도 카운트 | 173 |
| 산재승인 건수 | `approvalRows` 연도 카운트 | 32 |
| 3대 재해 | type ∈ {넘어짐, 무리한 동작, 물체에 맞음} | 19 |
| 근로손실일수 | Σ `lostDays` | 1,853 |
| 91일↑(중상해) | count(`lostDays` ≥ 91) | 6 |
| 중상해 근로손실 | Σ(≥91 lostDays) | 736 |
| 반복사고 매장 | 최근1년(최신사고일 기준) + 출퇴근 제외 + 동일매장 2건↑ | 47 |

## 사용

```js
import { fetchSnapshot, incidentKpi, approvalKpi, severeStores, repeatStores } from './accidentSource.mjs';

const snap = await fetchSnapshot({ division: '안전보건팀', year: '2026' });
incidentKpi(snap.incident.rows, '2026');   // 사고경위 대시보드
approvalKpi(snap.approval.rows, '2026');    // 산재승인 대시보드
severeStores(snap.approval.rows, '2026');   // 중상해 매장
repeatStores(snap.incident.rows, { minCount: 2, asOf: '2026-06-20', windowDays: 365, excludeTypes: ['출퇴근'] });
```

검증: `node datalayer/verify.mjs 안전보건팀 2026` → 10/10 ✅

## 추후: 사내 API 전환

`accidentSource.mjs` 의 `SOURCE.kind` 분기와 `fetchSnapshot()` 매핑만 교체하면 화면/파생함수는 무수정.
`fetchSnapshot()` 이 반환하는 `{ init, incident.rows, approval.rows }` 형태만 동일하게 맞추면 됨.

## ⚠️ 거버넌스 — 개인정보(PII)

응답 JSON에 **`victimName`(피해자 성명), `employeeNo`(사번)** 가 평문 포함됨.
대시보드 노출/전송 전 마스킹 정책 필요(산업안전보건 + 개인정보보호).

# Apps Script `startup` 캐시 패치 (서버 16~20초 → <1초)

## 왜
데이터 최신화가 느린 원인은 100% **newjuna Apps Script 서버의 `startup` 처리 시간**입니다.
측정: 3회 연속 호출 모두 **TTFB 16.6s / 18.4s / 19.5s** (캐시 없음·콜드스타트 아님, payload 90KB·832행).
DNS/연결/TLS/전송 합계는 0.2초, 이 저장소의 Node 마스킹/검증은 1초 미만 — 손댈 곳은 서버뿐입니다.

이 패치는 이 repo에서 배포할 수 없습니다(코드가 구글 Apps Script 프로젝트 안에 있음).
**newjuna Apps Script 편집기에서 아래를 붙여넣어야** 적용됩니다.

## 패치 ① — CacheService 캐시 (가장 큰 효과)

`doGet` 의 `action === 'startup'` 분기를 아래처럼 감쌉니다:

```javascript
function doGet(e) {
  if (e.parameter.action === 'startup') {
    const cache = CacheService.getScriptCache();
    const key = 'startup:' + e.parameter.division + ':' + e.parameter.year + ':' + e.parameter.month;

    const hit = cache.get(key);
    if (hit) {
      return ContentService.createTextOutput(hit)
        .setMimeType(ContentService.MimeType.JSON);   // 캐시 히트 → <1초
    }

    const json = JSON.stringify(buildStartupPayload(e));  // ← 기존 집계 로직(이름만 맞추세요)
    try { cache.put(key, json, 1800); } catch (_) {}      // 30분 캐시
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
  // ... 기존 다른 action 분기 ...
}
```

- **30분(1800초)** 은 조정 가능. 사고 대시보드는 실시간이 아니므로 30~60분이면 충분합니다.
- ⚠️ CacheService 값 최대 크기 = **100KB**. 현재 payload 90KB라 안전하나, 데이터가 늘어 100KB를 넘으면
  `cache.put` 가 조용히 실패(위 `try/catch`로 스킵)합니다. 그 경우 청크 분할(여러 key로 나눠 저장)이 필요합니다.

## 패치 ② — 시트 벌크 읽기 (추가 수배 단축, 해당 시)

`startup` 집계가 행별로 `getRange(i, ...)` 를 반복 호출하면 Apps Script에서 가장 느린 패턴입니다.
**한 번의 벌크 읽기**로 바꾸세요:

```javascript
// 느림 (행마다 시트 왕복):
// for (let i = 2; i <= last; i++) { const v = sheet.getRange(i, 1, 1, N).getValues()[0]; ... }

// 빠름 (한 번에 전부):
const values = sheet.getDataRange().getValues();   // 헤더 포함 2차원 배열
const header = values[0];
for (let i = 1; i < values.length; i++) { const row = values[i]; ... }
```

## 적용 후 확인
```bash
# 워밍업 1회 후 재호출이 <1초면 성공
curl -sS -L -o /dev/null -w 'TTFB %{time_starttransfer}s\n' \
  'https://script.google.com/macros/s/.../exec?action=startup&division=안전보건팀&year=전체&month=전체'
```

## 이 repo 쪽 보완(이미 적용됨)
`.github/workflows/bake-live-snapshot.yml` — 6시간마다(또는 수동) 서버에서 대신 최신화 →
`liveSnapshot.js` 항상 최신 → 사용자는 로컬 대기 0초. 서버 캐시까지 붙으면 이 스케줄 job 도 <1초로 끝납니다.

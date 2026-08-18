# Apps Script `startup` 캐시 패치 (서버 20~25초 → <1초)

## 왜
데이터 최신화가 느린 원인은 100% **newjuna Apps Script 서버의 `startup` 처리 시간**입니다.

| 측정일 | 응답시간 | payload | 행수 |
|---|---|---|---|
| 초기 | 16.6 / 18.4 / 19.5s | 90KB | 832 |
| **2026-08-07** | **21.7 / 24.7 / 24.0s** | **503KB** | 664+219 |

DNS/연결/TLS/전송 합계는 0.2초, 이 저장소의 Node 마스킹/검증은 1초 미만 — 손댈 곳은 서버뿐입니다.

이 패치는 이 repo에서 배포할 수 없습니다(코드가 구글 Apps Script 프로젝트 안에 있음).
**newjuna Apps Script 편집기에서 아래를 붙여넣어야** 적용됩니다.

> ⚠️ **2026-08-07 갱신** — payload가 503KB로 커져 `CacheService` 값 한도(**100KB**)를 넘었습니다.
> 이전 버전의 단일 `cache.put(key, json)` 은 이제 **조용히 실패**해서 효과가 없습니다.
> 아래 패치 ①은 청크 분할 버전으로 교체했습니다. 이 저장소 쪽은 클라이언트 타임아웃을 25s→60s로
> 늘려(`liveSource.js`) 서버가 느려도 일단 성공하게 해뒀지만, 20초 대기는 그대로입니다.

## 패치 ① — CacheService 청크 캐시 (가장 큰 효과)

`doGet` 의 `action === 'startup'` 분기를 아래처럼 감쌉니다. 100KB 한도를 넘는 값을
90KB 조각으로 잘라 여러 키에 저장하고, 읽을 때 순서대로 이어 붙입니다.

```javascript
// ── 청크 캐시 헬퍼 (한도 100KB → 90KB 조각으로 분할 저장) ──
var CHUNK = 90 * 1024;   // 90KB (한도 100KB에 여유)

function cachePutChunked(cache, key, str, ttlSec) {
  var n = Math.ceil(str.length / CHUNK);
  var kv = {};
  for (var i = 0; i < n; i++) kv[key + ':' + i] = str.substr(i * CHUNK, CHUNK);
  kv[key + ':n'] = String(n);
  cache.putAll(kv, ttlSec);   // 한 번에 저장 — 부분 저장 방지
}

function cacheGetChunked(cache, key) {
  var nStr = cache.get(key + ':n');
  if (!nStr) return null;
  var n = parseInt(nStr, 10);
  var keys = [];
  for (var i = 0; i < n; i++) keys.push(key + ':' + i);
  var parts = cache.getAll(keys);
  var out = '';
  for (var j = 0; j < n; j++) {
    var p = parts[key + ':' + j];
    if (p == null) return null;   // 조각 하나라도 만료/유실 → 캐시 미스로 처리
    out += p;
  }
  return out;
}

function doGet(e) {
  if (e.parameter.action === 'startup') {
    var cache = CacheService.getScriptCache();
    var key = 'startup:' + e.parameter.division + ':' + e.parameter.year + ':' + e.parameter.month;

    var hit = cacheGetChunked(cache, key);
    if (hit) {
      return ContentService.createTextOutput(hit)
        .setMimeType(ContentService.MimeType.JSON);   // 캐시 히트 → <1초
    }

    var json = JSON.stringify(buildStartupPayload(e));  // ← 기존 집계 로직(이름만 맞추세요)
    try { cachePutChunked(cache, key, json, 1800); } catch (_) {}   // 30분 캐시
    return ContentService.createTextOutput(json)
      .setMimeType(ContentService.MimeType.JSON);
  }
  // ... 기존 다른 action 분기 ...
}
```

- **30분(1800초)** 은 조정 가능. 사고 대시보드는 실시간이 아니므로 30~60분이면 충분합니다.
- 조각 수 = payload ÷ 90KB. 503KB면 6조각. `getAll`/`putAll`은 한 번의 왕복이라 조각이 늘어도 느려지지 않습니다.
- CacheService 전체 용량은 넉넉하지만(스크립트당 수 MB), 조각 하나라도 만료되면 캐시 미스로 떨어져 안전합니다.
- 시트에 사고가 추가된 직후 30분간은 캐시가 구값을 줍니다. 즉시 반영이 필요하면 시트 `onEdit` 트리거에서
  `cache.remove(key + ':n')` 한 줄로 무효화하세요(`:n` 키만 지우면 전체가 미스 처리됨).

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

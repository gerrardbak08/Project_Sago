# 안전보건 활동 기록 — Apps Script 백엔드 (go-live)

현재 앱은 실시 기록을 **브라우저 localStorage**에 저장합니다(단일 기기 데모, 즉시 작동).
**다기기·영구 저장**으로 가려면 아래 Apps Script를 붙이고 앱의 백엔드 플래그만 바꾸면 됩니다.
화면 코드는 `utils/complianceSource.js` 함수만 호출하므로 **UI 무수정**입니다.

## 1) Google Sheet 준비
- 시트에 탭 하나 추가: **`활동기록`**
- 1행 헤더:
  `id | program | store | bum | dept | team | date | attendees | topic | scenario | assessType | hazards | manager | note | createdAt`

## 2) Apps Script — `doPost`(저장) + `doGet` 분기(조회)
기존 산재 대시보드 Apps Script(또는 새 프로젝트)에 추가:

```javascript
const SHEET_ID = '활동기록 시트의 스프레드시트 ID';
const TAB = '활동기록';
const COLS = ['id','program','store','bum','dept','team','date','attendees','topic','scenario','assessType','hazards','manager','note','createdAt'];

function doPost(e) {
  const body = JSON.parse(e.postData.contents || '{}');
  if (body.action === 'compliance_create') {
    const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
    sh.appendRow(COLS.map(c => body[c] != null ? body[c] : ''));
    // program별 목록 캐시 무효화
    try { CacheService.getScriptCache().remove('compliance:' + body.program); } catch (_) {}
    return json({ ok: true, id: body.id });
  }
  return json({ ok: false, error: 'unknown action' });
}

// 기존 doGet의 action 분기에 아래를 추가 (startup 캐시 패치와 공존)
function handleComplianceList(e) {
  const program = e.parameter.program || '';
  const cache = CacheService.getScriptCache();
  const key = 'compliance:' + program;
  const hit = cache.get(key);
  if (hit) return json({ ok: true, records: JSON.parse(hit) });

  const sh = SpreadsheetApp.openById(SHEET_ID).getSheetByName(TAB);
  const values = sh.getDataRange().getValues();
  const header = values[0];
  const records = [];
  for (let i = 1; i < values.length; i++) {
    const row = values[i]; const o = {};
    header.forEach((h, j) => o[h] = row[j]);
    if (!program || o.program === program) records.push(o);
  }
  try { cache.put(key, JSON.stringify(records), 300); } catch (_) {}
  return json({ ok: true, records });
}

function json(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
```

`doGet` 안에서:
```javascript
if (e.parameter.action === 'compliance_list') return handleComplianceList(e);
```

## 3) 배포
- **배포 관리 → 기존 배포 편집 → 새 버전** (⚠️ `/exec` URL 유지). 새 배포를 만들면 URL이 바뀝니다.
- 액세스: "모든 사용자"(익명 POST 허용) — 필요 시 토큰 검증 추가.

## 4) 앱 스왑 (2줄)
`proj/src/utils/complianceSource.js`:
```javascript
export const COMPLIANCE_BACKEND = 'apps-script';           // 'local' → 'apps-script'
export const COMPLIANCE_SOURCE = { endpoint: 'https://script.google.com/macros/s/.../exec' };
```
재빌드·재배포하면 파트장 입력이 서버에 저장되고 안전보건팀 모니터가 서버에서 읽습니다.

## 파트장 링크
`https://<앱주소>/#compliance-input?program=tbm`  (program = tbm | risk | drill)
- `&store=고양화정점` 를 붙이면 매장 프리필. QR로 매장에 부착 가능.
- 로그인 없이 입력 화면만 뜹니다.

## 확인
```bash
# 저장
curl -sS -L -X POST '.../exec' -d '{"action":"compliance_create","program":"tbm","store":"테스트점","date":"2026-07-12"}'
# 조회 (<1초, 캐시)
curl -sS -L '.../exec?action=compliance_list&program=tbm'
```

## 참고
- 토큰 매직링크(파트장→매장 서버 도출)로 스푸핑 차단은 다음 단계. 지금은 매장 선택식.
- 향후 AWS(DynamoDB+Lambda) 이관 시에도 `complianceSource.js`만 교체(같은 SOURCE 심). `lambdas/ack/handler.py`가 템플릿.

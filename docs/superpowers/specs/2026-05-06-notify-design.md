# 알림 발송 기능 설계 문서

## 개요

안전 가이드 메시지를 이메일로 발송하는 기능을 추가한다.
현재는 알림 생성 시 자동으로 현황에 기록되는데, 이를 제거하고 **발송한 경우에만** 현황에 기록되도록 변경한다.
나중에 카카오톡으로 채널을 교체할 수 있도록 메신저 추상화 레이어를 설계한다.

---

## 아키텍처

```
[알림 생성 탭]  →  POST /api/simulate  →  결과 반환만 (S3 저장 X)

[알림 발송 탭]  →  POST /api/notify
                    { store_code, date, recipients: ["a@b.com", "b@c.com"] }
                        │
                        ├── simulate Lambda 내부 호출 (가이드 생성)
                        ├── NotifierFactory.get("email") → EmailNotifier
                        ├── SES 발송 (recipients 각각)
                        └── 발송 성공 시에만 → S3 alerts/{date}/index.json 기록
```

---

## 컴포넌트

### `core/notifier.py` (신규)
메신저 추상화 레이어. 채널 교체 시 이 파일만 수정.

```python
class BaseNotifier:
    def send(self, recipients: list[str], subject: str, body: str) -> dict: ...
    # returns: {"sent": [...], "failed": [...]}

class EmailNotifier(BaseNotifier):  # AWS SES
class KakaoNotifier(BaseNotifier):  # 미구현 stub

def get_notifier(channel: str = "email") -> BaseNotifier
```

### `lambdas/notify/handler.py` (신규)
- `POST /api/notify` 처리
- simulate Lambda를 boto3로 직접 호출해 가이드 생성
- `get_notifier("email")`로 발송
- 발송 성공 건만 `alerts/{date}/index.json`에 기록 (`sent_to` 필드 포함)

### `lambdas/simulate/handler.py` (수정)
- `_save_alert()` 호출 제거 (알림 생성 시 S3 저장 안 함)

### `proj/src/components/tabs/alert/AlertSend.jsx` (신규)
- 매장 선택 (stores.json 기반 드롭다운)
- 날짜 선택
- 수신자 입력 (쉼표 구분, 여러 개)
- 발송 버튼 → `POST /api/notify`
- 발송 결과 표시 (성공/실패 수신자 목록)

### `proj/src/constants/tabs.js` (수정)
- `ALERT_TABS`에 `{ id: "alert_send", l: "알림 발송", Icon: Send }` 추가

### `infra/main.tf` (수정)
- `aws_lambda_function.notify` 추가
- `POST /api/notify` API Gateway 라우트 추가
- IAM: notify Lambda에 simulate Lambda invoke 권한 포함 (기존 `lambda:InvokeFunction` 정책 재사용)

### `deploy.sh` (수정)
- `notify.zip` 패키징 단계 추가

---

## 알림 현황 기록 형식

`alerts/{date}/index.json` 항목에 `sent_to` 필드 추가:

```json
{
  "store_code": "10130",
  "store_name": "강남점",
  "date": "2026-05-06",
  "timestamp": "2026-05-06T14:30:00+09:00",
  "trigger_type": "manual_send",
  "risk_cust": "high",
  "risk_cust_score": 75,
  "risk_emp": "medium",
  "risk_emp_score": 52,
  "sent_to": ["a@b.com", "c@d.com"],
  "send_failed": [],
  "detail_key": "alerts/2026-05-06/10130_1234567890.json"
}
```

---

## 채널 교체 방법 (나중에 카카오로 전환 시)

1. `core/notifier.py`의 `KakaoNotifier` 구현
2. `lambdas/notify/handler.py`의 `CHANNEL` 환경변수를 `"kakao"`로 변경
3. `infra/main.tf` Lambda 환경변수 `NOTIFY_CHANNEL = "kakao"` 변경
4. 수신자 입력 UI에서 이메일 → 전화번호 placeholder 변경

---

## 제약 사항

- SES 샌드박스 모드: 인증된 이메일만 수신 가능
- `recipients` 최대 50개 (SES 단건 발송 제한)
- notify Lambda timeout: 60초 (simulate 호출 포함)

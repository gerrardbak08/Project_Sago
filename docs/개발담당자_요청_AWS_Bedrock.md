# [요청] Lambda Function URL 403 확인 + Bedrock 지식베이스(RAG) 도입 검토

작성 2026-08-19 · 대상: AWS 계정 관리 담당자 / 개발 담당자

---

## 1. 지금 막힌 것 — Lambda Function URL 403

SAGO 안전 도우미(챗봇)가 배포 이후 전혀 작동하지 않습니다. AI Lambda 뿐 아니라
notify·alerts Lambda 3개 전부 같은 증상이라, 개별 함수 문제가 아니라 **계정 상위 정책** 문제로 보입니다.

### 확인한 사실

| 항목 | 결과 |
|---|---|
| AWS 계정 | `973430106707` (Daiso) |
| 조직 마스터 계정 | `353687112689` |
| 리전 | `ap-northeast-2` |
| Lambda Function URL AuthType | `NONE` (정상) |
| Lambda 리소스 정책 | `Principal: "*"`, 공개 허용 (정상) |
| `aws lambda invoke` 직접 호출 | **200 성공** — 코드 자체는 정상 |
| Function URL 경유 호출 (3개 함수 전부) | **403 Forbidden** |
| CloudWatch 로그 | URL 경유 요청은 **로그가 아예 안 남음** |

로그가 안 남는다는 게 핵심입니다 — 요청이 Lambda 실행 환경까지 도달하지도 못하고
그 앞단(Function URL 게이트웨이 계층)에서 막히고 있습니다. 계정 자체 설정(AuthType,
리소스 정책)은 전부 정상이라 원인은 **조직 단위 정책(SCP/RCP)**으로 추정됩니다.

멤버 계정(`973430106707`)에서는 조직 정책을 조회할 권한이 없어(`ListPolicies` →
`AccessDeniedException`) 직접 확인이 불가능한 상태입니다.

### 대상 리소스

```
daiso-safety-v1-ai      https://fvgkkbvansbuixc5y2plcax5ta0dogfk.lambda-url.ap-northeast-2.on.aws/
daiso-safety-v1-notify
daiso-safety-v1-alerts
```

### 확인 요청

1. 조직(`353687112689`)에 `lambda:InvokeFunctionUrl` 을 막는 SCP 또는 리소스 제어
   정책(RCP)이 있는지
2. 있다면 위 3개 함수(또는 계정 `973430106707` 전체)에 예외 적용이 가능한지

이게 풀려야 안전 도우미가 다시 작동합니다.

---

## 2. 향후 방향 — Bedrock 지식베이스(RAG) 도입

403과는 별개로, 안전 도우미의 답변 품질을 높이기 위한 다음 단계를 검토 중입니다.
회사가 이미 AWS를 사용 중이라 **Bedrock Knowledge Bases**로 확장하는 방향을 잡고 있습니다.

### 지금 구조

```
프론트엔드 → ai Lambda → Bedrock Claude (us.anthropic.claude-sonnet-4-6, us-east-1)
```

현재는 안전 매뉴얼(현장 대응 가이드) 전문을 매 요청마다 프롬프트에 통째로 넣고 있습니다.
문서 1개(약 100줄) 수준에서는 작동하지만, 안전보건관리규정·위험성평가 매뉴얼·KOSHA
가이드 등이 추가되면 프롬프트 한도를 넘습니다.

### 요청하고 싶은 것

1. **Bedrock Knowledge Bases 사용 가능 여부 확인** — 리전(`us-east-1` 또는 `ap-northeast-2`),
   비용 정책, 조직 정책상 제약이 있는지
2. **문서 저장소 결정** — S3 버킷 신규 생성 가능 여부 (매뉴얼 원본을 넣을 곳)
3. **임베딩/벡터스토어 옵션 검토** — OpenSearch Serverless가 일반적인 조합인데, 계정 정책상
   가능한지 아니면 다른 대안이 필요한지

### 왜 이 방향인지 (참고)

파인튜닝이 아니라 RAG(검색 후 답변)를 선택한 이유는 **출처 인용**이 가능하기 때문입니다.
안전·법정 판단이 걸린 답변이라 "안전보건관리규정 §12에 따르면"처럼 근거를 댈 수 있어야
사람이 검증할 수 있고, 매뉴얼이 개정돼도 문서만 교체하면 됩니다(재학습 불필요).

---

## 참고 — 재현 가능한 진단 명령

```bash
# Function URL 경유 (403 재현)
curl -X POST https://fvgkkbvansbuixc5y2plcax5ta0dogfk.lambda-url.ap-northeast-2.on.aws/ \
  -H 'Content-Type: application/json' -d '{"prompt":"ping"}'

# 직접 invoke (200 정상 — 대조군)
aws lambda invoke --function-name daiso-safety-v1-ai \
  --payload '{"prompt":"ping"}' --cli-binary-format raw-in-base64-out /tmp/out.json
```

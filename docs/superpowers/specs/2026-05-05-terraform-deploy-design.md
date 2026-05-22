# Daiso Safety AI — Terraform & 배포 설계 문서

## 개요

AWS 인프라를 Terraform으로 완성하고, `proj/dist/` 빌드 결과물을 S3 정적 웹호스팅으로 배포하는 구조를 정의한다.

---

## 아키텍처

```
[사용자 브라우저]
      │
      ▼
[S3 정적 웹호스팅]  ←── proj/dist/ (index.html, assets/, stores.json, alerts/)
      │
      │ (API 호출)
      ▼
[API Gateway HTTP API v2]
      │
      ├── POST /api/simulate ──▶ [Lambda: simulate]
      │                               ├── S3 (models) 읽기
      │                               ├── Bedrock 호출
      │                               └── S3 (daily) 쓰기
      │
[EventBridge cron 21:00 UTC = 06:00 KST]
      │
      ▼
[Lambda: batch-orchestrator]
      ├── Lambda: simulate 호출
      ├── S3 (daily) 쓰기
      └── SES 이메일 발송
```

---

## 컴포넌트

### 1. Terraform (`infra/main.tf`)

기존 코드에서 수정/추가할 사항:

| 항목 | 현재 | 변경 |
|------|------|------|
| `aws_region` 기본값 | `us-east-1` | `ap-northeast-2` (서울) |
| `frontend_bucket_name` output | 없음 | 추가 (deploy.sh 참조용) |

나머지 리소스(Lambda, API Gateway, EventBridge, SES, IAM)는 현재 코드 유지.

### 2. 배포 스크립트 (`deploy.sh`)

관심사 분리 원칙에 따라 Terraform은 인프라만, 파일 업로드는 스크립트가 담당.

```
실행 순서:
1. terraform -chdir=infra init (필요시)
2. terraform -chdir=infra apply -auto-approve
3. BUCKET=$(terraform -chdir=infra output -raw frontend_bucket_name)
4. API_URL=$(terraform -chdir=infra output -raw api_url)
5. proj/.env.production에 VITE_API_BASE=$API_URL 주입
6. npm --prefix proj run build  (dist/ 재빌드)
7. aws s3 sync proj/dist/ s3://$BUCKET/ --delete
   - index.html, stores.json: Cache-Control: no-cache
   - assets/*: Cache-Control: max-age=31536000,immutable
```

### 3. `proj/.env.production`

배포 시 `deploy.sh`가 API Gateway URL을 자동 주입한다.

```
VITE_API_BASE=<terraform output api_url로 자동 설정>
```

---

## 결정 사항

- **호스팅 방식:** S3 정적 웹호스팅 (HTTP, CloudFront 없음)
- **파일 업로드 방식:** Terraform과 분리된 `deploy.sh` 스크립트
- **리전:** `ap-northeast-2` (서울)
- **캐시 전략:** `index.html`은 no-cache, `assets/`는 장기 캐시 (Vite 해시 파일명 활용)

---

## 배포 흐름

```
개발자
  │
  ├── 1. terraform 변수 설정 (ses_sender_email 등)
  ├── 2. ./deploy.sh 실행
  │       ├── infra 프로비저닝
  │       ├── .env.production 업데이트
  │       ├── npm run build
  │       └── s3 sync
  └── 3. output으로 출력된 frontend_url 접속 확인
```

---

## 제약 사항

- AWS CLI 설치 및 자격증명 설정 필요 (`aws configure`)
- SES 발신 이메일 사전 인증 필요
- Bedrock 모델 접근 권한 사전 활성화 필요 (AWS 콘솔에서 모델 활성화)

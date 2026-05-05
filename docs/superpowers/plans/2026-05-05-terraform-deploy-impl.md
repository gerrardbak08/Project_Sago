# Terraform & 배포 자동화 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `infra/main.tf` 리전 수정 및 output 추가, `deploy.sh` 배포 스크립트 생성으로 `proj/dist/`를 S3 정적 웹호스팅에 자동 배포한다.

**Architecture:** Terraform은 인프라(S3, Lambda, API Gateway, EventBridge, SES, IAM)만 관리하고, `deploy.sh`가 Terraform apply → .env.production 업데이트 → npm build → s3 sync 순서로 배포를 처리한다.

**Tech Stack:** Terraform >= 1.3, AWS CLI v2, AWS Provider ~> 5.0, Node.js/npm (Vite build), bash

---

### Task 1: Terraform 리전 수정 및 output 추가

**Files:**
- Modify: `infra/main.tf`

- [ ] **Step 1: `aws_region` 기본값을 서울 리전으로 변경**

`infra/main.tf`의 variable 블록을 수정:

```hcl
variable "aws_region" {
  description = "AWS 리전"
  default     = "ap-northeast-2"
}
```

- [ ] **Step 2: `frontend_bucket_name` output 추가**

`infra/main.tf` 하단 Outputs 섹션에 추가:

```hcl
output "frontend_bucket_name" {
  description = "프론트엔드 S3 버킷 이름 (deploy.sh 참조용)"
  value       = aws_s3_bucket.frontend.id
}
```

기존 `frontend_url` output도 리전 변수를 참조하도록 확인 (이미 `var.aws_region` 사용 중이므로 자동 반영됨).

- [ ] **Step 3: Terraform 문법 검증**

```bash
terraform -chdir=infra validate
```

Expected output:
```
Success! The configuration is valid.
```

- [ ] **Step 4: Terraform 포맷 정리**

```bash
terraform -chdir=infra fmt
```

- [ ] **Step 5: 커밋**

```bash
git add infra/main.tf
git commit -m "feat(infra): 리전 ap-northeast-2 변경 및 frontend_bucket_name output 추가"
```

---

### Task 2: 배포 스크립트 생성

**Files:**
- Create: `deploy.sh`

- [ ] **Step 1: `deploy.sh` 파일 생성**

```bash
#!/usr/bin/env bash
# deploy.sh — Daiso Safety AI 전체 배포 스크립트
# 사전 조건: AWS CLI 설치 및 자격증명 설정, Node.js/npm 설치
set -euo pipefail

INFRA_DIR="infra"
PROJ_DIR="proj"
ENV_PROD="$PROJ_DIR/.env.production"

echo "=== [1/5] Terraform init (필요시) ==="
terraform -chdir="$INFRA_DIR" init -input=false

echo "=== [2/5] Terraform apply ==="
terraform -chdir="$INFRA_DIR" apply -input=false -auto-approve \
  -var="ses_sender_email=${SES_SENDER_EMAIL:?'SES_SENDER_EMAIL 환경변수를 설정하세요'}"

echo "=== [3/5] Terraform output 읽기 ==="
BUCKET=$(terraform -chdir="$INFRA_DIR" output -raw frontend_bucket_name)
API_URL=$(terraform -chdir="$INFRA_DIR" output -raw api_url)

echo "  S3 버킷: $BUCKET"
echo "  API URL: $API_URL"

echo "=== [4/5] .env.production 업데이트 ==="
# VITE_API_BASE 라인을 API_URL로 교체 (없으면 추가)
if grep -q "^VITE_API_BASE=" "$ENV_PROD"; then
  sed -i.bak "s|^VITE_API_BASE=.*|VITE_API_BASE=$API_URL|" "$ENV_PROD"
  rm -f "$ENV_PROD.bak"
else
  echo "VITE_API_BASE=$API_URL" >> "$ENV_PROD"
fi
echo "  VITE_API_BASE=$API_URL 설정 완료"

echo "=== [5/5] 프론트엔드 빌드 및 S3 업로드 ==="
npm --prefix "$PROJ_DIR" run build

# index.html, stores.json — no-cache (항상 최신 버전 제공)
aws s3 sync "$PROJ_DIR/dist/" "s3://$BUCKET/" \
  --delete \
  --exclude "assets/*" \
  --cache-control "no-cache, no-store, must-revalidate"

# assets/ — 장기 캐시 (Vite 해시 파일명으로 캐시 무효화 보장)
aws s3 sync "$PROJ_DIR/dist/assets/" "s3://$BUCKET/assets/" \
  --cache-control "max-age=31536000,immutable"

echo ""
echo "✅ 배포 완료!"
echo "   프론트엔드 URL: $(terraform -chdir="$INFRA_DIR" output -raw frontend_url)"
echo "   API URL:        $API_URL"
```

- [ ] **Step 2: 실행 권한 부여**

```bash
chmod +x deploy.sh
```

- [ ] **Step 3: 스크립트 문법 검증 (dry-run)**

```bash
bash -n deploy.sh
```

Expected output: (아무 출력 없음 = 문법 오류 없음)

- [ ] **Step 4: 커밋**

```bash
git add deploy.sh
git commit -m "feat: S3 정적 웹호스팅 배포 자동화 스크립트 추가"
```

---

### Task 3: 설계 문서 커밋

**Files:**
- Commit: `docs/superpowers/specs/2026-05-05-terraform-deploy-design.md`
- Commit: `docs/superpowers/plans/2026-05-05-terraform-deploy-impl.md`

- [ ] **Step 1: 문서 커밋**

```bash
git add docs/superpowers/specs/2026-05-05-terraform-deploy-design.md
git add docs/superpowers/plans/2026-05-05-terraform-deploy-impl.md
git commit -m "docs: terraform 배포 설계 문서 및 구현 계획 추가"
```

---

## 배포 실행 방법 (참고)

```bash
# 1. SES 발신 이메일 설정
export SES_SENDER_EMAIL="your-email@example.com"

# 2. 배포 실행
./deploy.sh
```

## 주의 사항

- `terraform apply`는 실제 AWS 리소스를 생성/변경하므로 비용이 발생할 수 있음
- SES는 샌드박스 모드에서는 인증된 이메일로만 발송 가능 — AWS 콘솔에서 프로덕션 전환 필요
- Bedrock 모델(`claude-sonnet-4`)은 AWS 콘솔 > Bedrock > Model access에서 사전 활성화 필요
- `--auto-approve` 플래그 사용 중 — 프로덕션 환경에서는 제거하고 수동 확인 권장

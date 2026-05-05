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

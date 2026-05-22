#!/usr/bin/env bash
# deploy.sh — Daiso Safety AI 전체 배포 스크립트
# 사전 조건: AWS CLI 설치 및 자격증명 설정, Node.js/npm 설치
set -euo pipefail

INFRA_DIR="infra"
PROJ_DIR="proj"
ENV_PROD="$PROJ_DIR/.env.production"
DIST_DIR="dist"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
PROJECT_NAME="${TF_VAR_project:-daiso-safety}"
DEPLOY_VERSION="${DEPLOY_VERSION:-${TF_VAR_deploy_version:-v1}}"

if [[ ! "$DEPLOY_VERSION" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "DEPLOY_VERSION은 소문자/숫자/하이픈만 사용하고 소문자 또는 숫자로 시작/종료해야 합니다: $DEPLOY_VERSION" >&2
  exit 1
fi

if [ "$DEPLOY_VERSION" = "legacy" ]; then
  RESOURCE_PREFIX="$PROJECT_NAME"
  TF_WORKSPACE_NAME="default"
  TF_DEPLOY_VERSION=""
else
  RESOURCE_PREFIX="${PROJECT_NAME}-${DEPLOY_VERSION}"
  TF_WORKSPACE_NAME="$RESOURCE_PREFIX"
  TF_DEPLOY_VERSION="$DEPLOY_VERSION"
fi

if [ "${#RESOURCE_PREFIX}" -gt 49 ]; then
  echo "S3 버킷명 길이 제한을 위해 PROJECT+DEPLOY_VERSION 접두사는 49자 이하여야 합니다: $RESOURCE_PREFIX" >&2
  exit 1
fi

export TF_VAR_deploy_version="$TF_DEPLOY_VERSION"

# ---------------------------------------------------------------------------
# AWS 자격증명 갱신
# ---------------------------------------------------------------------------
echo "=== [0/7] AWS 자격증명 갱신 ==="
eval "$(aws configure export-credentials --format env)"
echo "  ✓ 자격증명 갱신 완료"
echo "  배포 버전: $DEPLOY_VERSION"
echo "  리소스 접두사: $RESOURCE_PREFIX"
echo "  Terraform workspace: $TF_WORKSPACE_NAME"

# ---------------------------------------------------------------------------
# Lambda zip 패키징
# ---------------------------------------------------------------------------
echo "=== [1/6] Lambda zip 패키징 ==="
mkdir -p "$DIST_DIR"

# core-layer.zip — Lambda Layer용 (core/ 모듈 + requests 패키지 포함)
echo "  core-layer.zip 생성 중..."
rm -rf /tmp/core-layer-build
SITE_PKG="/tmp/core-layer-build/python/lib/python3.12/site-packages"
mkdir -p "$SITE_PKG/core"

# core 모듈 복사
cp core/__init__.py core/llm.py core/rule_matcher.py core/rule_enrichment.py core/weather.py core/notifier.py \
  "$SITE_PKG/core/"

# 외부 패키지 설치 (requests, python-dotenv)
# pip 명령이 환경에 따라 pip / pip3 / python3 -m pip 로 다름 → 가용한 것 자동 선택
if command -v pip >/dev/null 2>&1; then
  PIP_CMD="pip"
elif command -v pip3 >/dev/null 2>&1; then
  PIP_CMD="pip3"
else
  PIP_CMD="python3 -m pip"
fi
$PIP_CMD install requests python-dotenv \
  --target "$SITE_PKG" \
  --quiet \
  --no-cache-dir

(cd /tmp/core-layer-build && zip -r9 - python) > "$DIST_DIR/core-layer.zip"
echo "  ✓ core-layer.zip ($(du -sh "$DIST_DIR/core-layer.zip" | cut -f1))"

# batch.zip — lambdas/batch/handler.py
echo "  batch.zip 생성 중..."
rm -rf /tmp/batch-build
mkdir -p /tmp/batch-build
cp lambdas/batch/handler.py /tmp/batch-build/
(cd /tmp/batch-build && zip -r9 - handler.py) > "$DIST_DIR/batch.zip"
echo "  ✓ batch.zip ($(du -sh "$DIST_DIR/batch.zip" | cut -f1))"

# notify.zip — lambdas/notify/handler.py
echo "  notify.zip 생성 중..."
rm -rf /tmp/notify-build
mkdir -p /tmp/notify-build
cp lambdas/notify/handler.py /tmp/notify-build/
(cd /tmp/notify-build && zip -r9 - handler.py) > "$DIST_DIR/notify.zip"
echo "  ✓ notify.zip ($(du -sh "$DIST_DIR/notify.zip" | cut -f1))"

# alerts.zip — lambdas/alerts/handler.py
echo "  alerts.zip 생성 중..."
rm -rf /tmp/alerts-build
mkdir -p /tmp/alerts-build
cp lambdas/alerts/handler.py /tmp/alerts-build/
(cd /tmp/alerts-build && zip -r9 - handler.py) > "$DIST_DIR/alerts.zip"
echo "  ✓ alerts.zip ($(du -sh "$DIST_DIR/alerts.zip" | cut -f1))"

# ai.zip — lambdas/ai/handler.py
echo "  ai.zip 생성 중..."
rm -rf /tmp/ai-build
mkdir -p /tmp/ai-build
cp lambdas/ai/handler.py /tmp/ai-build/
(cd /tmp/ai-build && zip -r9 - handler.py) > "$DIST_DIR/ai.zip"
echo "  ✓ ai.zip ($(du -sh "$DIST_DIR/ai.zip" | cut -f1))"

echo "=== [2/6] Terraform init (필요시) ==="
terraform -chdir="$INFRA_DIR" init -input=false
terraform -chdir="$INFRA_DIR" workspace select "$TF_WORKSPACE_NAME" >/dev/null 2>&1 \
  || terraform -chdir="$INFRA_DIR" workspace new "$TF_WORKSPACE_NAME" >/dev/null

if [ -f ".env" ] && [ -z "${KAKAO_ACCESS_TOKEN:-}" ]; then
  KAKAO_ACCESS_TOKEN=$(awk -F= '/^KAKAO_ACCESS_TOKEN=/ { value=substr($0, index($0, "=") + 1) } END { gsub(/^["'\''"]|["'\''"]$/, "", value); print value }' .env)
  export KAKAO_ACCESS_TOKEN
fi
export TF_VAR_kakao_access_token="${TF_VAR_kakao_access_token:-${KAKAO_ACCESS_TOKEN:-}}"

echo "=== [3/6] Terraform apply ==="
terraform -chdir="$INFRA_DIR" apply -input=false -auto-approve

echo "=== [4/7] Terraform output 읽기 ==="
BUCKET=$(terraform -chdir="$INFRA_DIR" output -raw frontend_bucket_name)
NOTIFY_URL=$(terraform -chdir="$INFRA_DIR" output -raw notify_url)
ALERTS_URL=$(terraform -chdir="$INFRA_DIR" output -raw alerts_url)
AI_URL=$(terraform -chdir="$INFRA_DIR" output -raw ai_url)

echo "  S3 버킷:      $BUCKET"
echo "  notify URL:   $NOTIFY_URL"
echo "  alerts URL:   $ALERTS_URL"
echo "  ai URL:       $AI_URL"

echo "=== [5/7] .env.production 업데이트 ==="

_upsert_env() {
  local key="$1" val="$2" file="$3"
  if grep -q "^${key}=" "$file"; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" "$file"
    rm -f "${file}.bak"
  else
    echo "${key}=${val}" >> "$file"
  fi
}

_upsert_env "VITE_NOTIFY_URL"   "$NOTIFY_URL"   "$ENV_PROD"
_upsert_env "VITE_ALERTS_URL"   "$ALERTS_URL"   "$ENV_PROD"
_upsert_env "VITE_AI_URL"       "$AI_URL"       "$ENV_PROD"
_upsert_env "VITE_ENABLE_KAKAO_SEND" "${TF_VAR_enable_kakao_manual_send:-false}" "$ENV_PROD"

# 프론트엔드 URL (이미지 경로 해석용)
FRONTEND_URL=$(terraform -chdir="$INFRA_DIR" output -raw frontend_url)
_upsert_env "VITE_FRONTEND_URL" "http://$FRONTEND_URL" "$ENV_PROD"

echo "  VITE_NOTIFY_URL=$NOTIFY_URL"
echo "  VITE_ALERTS_URL=$ALERTS_URL"
echo "  VITE_AI_URL=$AI_URL"

echo "=== [6/7] 모델 파일 → S3 업로드 ==="
MODELS_BUCKET=$(terraform -chdir="$INFRA_DIR" output -raw models_bucket)
echo "  모델 버킷: $MODELS_BUCKET"

# models/cust/ — 배포용 JSON 규칙/리프 인덱스
aws s3 sync models/cust/ "s3://$MODELS_BUCKET/models/cust/" \
  --region "$AWS_REGION" \
  --delete \
  --exclude ".gitkeep"
echo "  ✓ models/cust/ 업로드"

# models/emp/ — 배포용 JSON 규칙/리프 인덱스
aws s3 sync models/emp/ "s3://$MODELS_BUCKET/models/emp/" \
  --region "$AWS_REGION" \
  --delete \
  --exclude ".gitkeep"
echo "  ✓ models/emp/ 업로드"

echo "=== [7/7] 프론트엔드 빌드 및 S3 업로드 ==="
# DB/*.xlsx → workerData.js + snapshots.js 재생성 (DB 변경 사항 자동 반영)
if [[ "${SKIP_DATA:-0}" == "1" ]]; then
  echo "  SKIP_DATA=1 — 데이터 재생성 건너뜀"
elif [[ ! -d "DB" ]]; then
  echo "  WARN: DB/ 폴더 없음 — 데이터 재생성 skip (기존 정적 JS 사용)"
else
  echo "  데이터 재생성 (npm run data)..."
  npm --prefix "$PROJ_DIR" run data
fi
npm --prefix "$PROJ_DIR" run build

# index.html 등 — no-cache (항상 최신 버전 제공)
# og-image/favicon 은 제외: no-store 면 카카오 OG 크롤러가 이미지를 저장·표시하지 못함
aws s3 sync "$PROJ_DIR/dist/" "s3://$BUCKET/" \
  --delete \
  --exclude "assets/*" \
  --exclude "stores.json" \
  --exclude "images/*" \
  --exclude "og-image.png" \
  --exclude "favicon.png" \
  --exclude "favicon-32.png" \
  --cache-control "no-cache, no-store, must-revalidate"

# og-image / favicon — 크롤러가 캐시·표시할 수 있도록 일반 캐시 헤더
for _img in og-image.png favicon.png favicon-32.png; do
  [ -f "$PROJ_DIR/dist/$_img" ] && aws s3 cp "$PROJ_DIR/dist/$_img" "s3://$BUCKET/$_img" \
    --cache-control "public, max-age=86400" --content-type "image/png"
done

# assets/ — 장기 캐시 (Vite 해시 파일명으로 캐시 무효화 보장)
aws s3 sync "$PROJ_DIR/dist/assets/" "s3://$BUCKET/assets/" \
  --cache-control "max-age=31536000,immutable"

# images/ — 사고 사례 이미지 (1일 캐시)
aws s3 sync images/ "s3://$BUCKET/images/" \
  --cache-control "max-age=86400" \
  --region "$AWS_REGION"
echo "  ✓ images/ 업로드"

# stores.json — Lambda가 매장 정보를 로드하는 모델 버킷 산출물
aws s3 cp stores.json "s3://$MODELS_BUCKET/stores.json" \
  --region "$AWS_REGION"
echo "  ✓ stores.json 업로드"

echo ""
echo "✅ 배포 완료!"
echo "   프론트엔드 URL: $(terraform -chdir="$INFRA_DIR" output -raw frontend_url)"
echo "   notify URL:     $NOTIFY_URL"
echo "   alerts URL:     $ALERTS_URL"

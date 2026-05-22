#!/usr/bin/env bash
# destroy.sh — S3 버킷을 비운 뒤 Terraform 리소스를 일괄 삭제
# 사전 조건: AWS CLI, Terraform 설치 및 AWS 자격증명 설정
set -euo pipefail

INFRA_DIR="infra"
AWS_REGION="${AWS_REGION:-ap-northeast-2}"
PROJECT_NAME="${TF_VAR_project:-daiso-safety}"
DEPLOY_VERSION="${DEPLOY_VERSION:-${TF_VAR_deploy_version:-v1}}"

if [[ ! "$DEPLOY_VERSION" =~ ^[a-z0-9][a-z0-9-]*[a-z0-9]$ ]]; then
  echo "DEPLOY_VERSION은 소문자/숫자/하이픈만 사용하고 소문자 또는 숫자로 시작/종료해야 합니다: $DEPLOY_VERSION" >&2
  exit 1
fi

if [ "$DEPLOY_VERSION" = "legacy" ]; then
  TF_WORKSPACE_NAME="default"
  TF_DEPLOY_VERSION=""
else
  TF_WORKSPACE_NAME="${PROJECT_NAME}-${DEPLOY_VERSION}"
  TF_DEPLOY_VERSION="$DEPLOY_VERSION"
fi

export TF_VAR_deploy_version="$TF_DEPLOY_VERSION"

echo "=== [0/4] AWS 자격증명 갱신 ==="
eval "$(aws configure export-credentials --format env)"
echo "  ✓ 자격증명 갱신 완료"
echo "  배포 버전: $DEPLOY_VERSION"
echo "  Terraform workspace: $TF_WORKSPACE_NAME"

echo "=== [1/4] Terraform init ==="
terraform -chdir="$INFRA_DIR" init -input=false
if ! terraform -chdir="$INFRA_DIR" workspace select "$TF_WORKSPACE_NAME" >/dev/null 2>&1; then
  echo "Terraform workspace가 없습니다: $TF_WORKSPACE_NAME" >&2
  echo "삭제할 배포 버전을 DEPLOY_VERSION으로 지정했는지 확인하세요." >&2
  exit 1
fi

_tf_output() {
  local name="$1"
  terraform -chdir="$INFRA_DIR" output -raw "$name" 2>/dev/null || true
}

FRONTEND_BUCKET="$(_tf_output frontend_bucket_name)"
MODELS_BUCKET="$(_tf_output models_bucket)"
DAILY_BUCKET="$(_tf_output daily_bucket)"

BUCKETS=(
  "$FRONTEND_BUCKET"
  "$MODELS_BUCKET"
  "$DAILY_BUCKET"
)

_bucket_exists() {
  local bucket="$1"
  aws s3api head-bucket --bucket "$bucket" --region "$AWS_REGION" >/dev/null 2>&1
}

_delete_version_batch() {
  local bucket="$1"
  local query="$2"
  local tmp_file
  tmp_file="$(mktemp)"

  aws s3api list-object-versions \
    --bucket "$bucket" \
    --region "$AWS_REGION" \
    --query "$query" \
    --output json > "$tmp_file"

  if grep -q '"VersionId"' "$tmp_file"; then
    aws s3api delete-objects \
      --bucket "$bucket" \
      --region "$AWS_REGION" \
      --delete "file://$tmp_file" >/dev/null
  fi

  rm -f "$tmp_file"
}

_empty_bucket() {
  local bucket="$1"
  if [ -z "$bucket" ]; then
    return
  fi

  if ! _bucket_exists "$bucket"; then
    echo "  - $bucket 없음 또는 접근 불가 → 스킵"
    return
  fi

  echo "  - $bucket 비우는 중..."
  aws s3 rm "s3://$bucket" --recursive --region "$AWS_REGION" >/dev/null || true
  _delete_version_batch "$bucket" "{Objects: Versions[].{Key:Key,VersionId:VersionId}}"
  _delete_version_batch "$bucket" "{Objects: DeleteMarkers[].{Key:Key,VersionId:VersionId}}"
  echo "    ✓ $bucket 비움"
}

echo "=== [2/4] S3 버킷 비우기 ==="
for bucket in "${BUCKETS[@]}"; do
  _empty_bucket "$bucket"
done

echo "=== [3/4] Terraform destroy ==="
terraform -chdir="$INFRA_DIR" destroy -input=false -auto-approve

echo "=== [4/4] 완료 ==="
echo "  ✓ Terraform 리소스 삭제 완료"

###############################################################################
# Daiso Safety AI — Terraform Infrastructure
# AWS 리소스: S3, Lambda, Lambda Layer, Lambda Function URL, EventBridge, IAM
###############################################################################

terraform {
  required_version = ">= 1.3"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

# ---------------------------------------------------------------------------
# Variables
# ---------------------------------------------------------------------------

variable "aws_region" {
  description = "AWS 리전"
  default     = "ap-northeast-2"
}

variable "project" {
  description = "프로젝트 이름 (리소스 접두사)"
  default     = "daiso-safety"
}

variable "deploy_version" {
  description = "리소스 이름 충돌 방지를 위한 배포 버전 접미사"
  type        = string
  default     = ""

  validation {
    condition     = var.deploy_version == "" || can(regex("^[a-z0-9][a-z0-9-]*[a-z0-9]$", var.deploy_version))
    error_message = "deploy_version은 비어 있거나, 소문자/숫자/하이픈만 사용하고 소문자 또는 숫자로 시작/종료해야 합니다."
  }
}

variable "kakao_access_token" {
  description = "Kakao Talk Message API access token for test sends"
  type        = string
  default     = ""
  sensitive   = true
}

locals {
  resource_prefix = var.deploy_version == "" ? var.project : "${var.project}-${var.deploy_version}"
}

provider "aws" {
  region = var.aws_region

  default_tags {
    tags = {
      Service = "daiso"
    }
  }
}

# ---------------------------------------------------------------------------
# S3 Buckets
# ---------------------------------------------------------------------------

# 1) 정적 웹 호스팅 — Frontend
resource "aws_s3_bucket" "frontend" {
  bucket = "${local.resource_prefix}-frontend"

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
    Purpose       = "static-web-hosting"
  }
}

resource "aws_s3_bucket_website_configuration" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  index_document {
    suffix = "index.html"
  }

  error_document {
    key = "index.html"
  }
}

resource "aws_s3_bucket_public_access_block" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  block_public_acls       = false
  block_public_policy     = false
  ignore_public_acls      = false
  restrict_public_buckets = false
}

resource "aws_s3_bucket_policy" "frontend" {
  bucket = aws_s3_bucket.frontend.id

  depends_on = [aws_s3_bucket_public_access_block.frontend]

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid       = "PublicReadGetObject"
        Effect    = "Allow"
        Principal = "*"
        Action    = "s3:GetObject"
        Resource  = "${aws_s3_bucket.frontend.arn}/*"
      }
    ]
  })
}

# 2) 모델 산출물 + stores.json
resource "aws_s3_bucket" "models" {
  bucket = "${local.resource_prefix}-models"

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
    Purpose       = "model-artifacts"
  }
}

# 3) 배치 결과 저장 (내부용, 퍼블릭 불필요)
resource "aws_s3_bucket" "daily" {
  bucket = "${local.resource_prefix}-daily"

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
    Purpose       = "batch-results"
  }
}

# ---------------------------------------------------------------------------
# IAM — Lambda 실행 역할
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "lambda_exec" {
  name               = "${local.resource_prefix}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

data "aws_iam_policy_document" "lambda_permissions" {
  # S3 읽기/쓰기 (models + daily)
  statement {
    actions = [
      "s3:GetObject",
      "s3:PutObject",
      "s3:ListBucket",
    ]
    resources = [
      aws_s3_bucket.models.arn,
      "${aws_s3_bucket.models.arn}/*",
      aws_s3_bucket.daily.arn,
      "${aws_s3_bucket.daily.arn}/*",
    ]
  }

  # Bedrock (LLM 호출)
  statement {
    actions = [
      "bedrock:InvokeModel",
      "bedrock:InvokeModelWithResponseStream",
    ]
    resources = ["*"]
  }

  # AWS Marketplace — Bedrock(Marketplace 제공) 모델 최초 계정 구독.
  # 첫 호출 시 계정 전체에 모델 구독이 활성화된다.
  statement {
    actions = [
      "aws-marketplace:Subscribe",
      "aws-marketplace:ViewSubscriptions",
    ]
    resources = ["*"]
  }

  # CloudWatch Logs
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role_policy" "lambda_permissions" {
  name   = "${local.resource_prefix}-lambda-permissions"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}

# ---------------------------------------------------------------------------
# IAM — alerts Lambda 전용 역할 (daily 버킷 읽기 전용)
# ---------------------------------------------------------------------------

data "aws_iam_policy_document" "alerts_permissions" {
  # daily 버킷 alerts/ 경로 읽기 + ListBucket
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.daily.arn}/alerts/*"]
  }

  statement {
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.daily.arn]
  }

  # CloudWatch Logs
  statement {
    actions = [
      "logs:CreateLogGroup",
      "logs:CreateLogStream",
      "logs:PutLogEvents",
    ]
    resources = ["arn:aws:logs:*:*:*"]
  }
}

resource "aws_iam_role" "alerts_exec" {
  name               = "${local.resource_prefix}-alerts-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

resource "aws_iam_role_policy" "alerts_permissions" {
  name   = "${local.resource_prefix}-alerts-permissions"
  role   = aws_iam_role.alerts_exec.id
  policy = data.aws_iam_policy_document.alerts_permissions.json
}

# ---------------------------------------------------------------------------
# Lambda Layer — core/ 모듈 공유
# ---------------------------------------------------------------------------

resource "aws_lambda_layer_version" "core" {
  layer_name          = "${local.resource_prefix}-core"
  filename            = "${path.module}/../dist/core-layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/../dist/core-layer.zip")
  compatible_runtimes = ["python3.11", "python3.12"]

  description = "core/ 공유 모듈 (llm, rule_matcher, weather, notifier)"
}

# ---------------------------------------------------------------------------
# Lambda — notify
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "notify" {
  function_name    = "${local.resource_prefix}-notify"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = "${path.module}/../dist/notify.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/notify.zip")

  memory_size = 256
  timeout     = 300

  layers = [aws_lambda_layer_version.core.arn]

  environment {
    variables = {
      MODELS_BUCKET      = aws_s3_bucket.models.id
      DAILY_BUCKET       = aws_s3_bucket.daily.id
      FRONTEND_URL       = "http://${aws_s3_bucket_website_configuration.frontend.website_endpoint}"
      NOTIFY_CHANNEL     = "mock"
      KAKAO_ACCESS_TOKEN = var.kakao_access_token
      BEDROCK_REGION     = "us-east-1"
    }
  }

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

resource "aws_lambda_function_url" "notify" {
  function_name      = aws_lambda_function.notify.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["Content-Type"]
    max_age           = 3600
  }
}

resource "aws_lambda_permission" "notify_url_public" {
  statement_id           = "AllowPublicFunctionURL"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.notify.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "notify_invoke_public" {
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.notify.function_name
  principal     = "*"
}

# ---------------------------------------------------------------------------
# Lambda — alerts (알림 현황 조회)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "alerts" {
  function_name    = "${local.resource_prefix}-alerts"
  role             = aws_iam_role.alerts_exec.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = "${path.module}/../dist/alerts.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/alerts.zip")

  memory_size = 128
  timeout     = 180

  environment {
    variables = {
      DAILY_BUCKET = aws_s3_bucket.daily.id
    }
  }

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

resource "aws_lambda_function_url" "alerts" {
  function_name      = aws_lambda_function.alerts.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["Content-Type"]
    max_age           = 3600
  }
}

resource "aws_lambda_permission" "alerts_url_public" {
  statement_id           = "AllowPublicFunctionURL"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.alerts.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "alerts_invoke_public" {
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.alerts.function_name
  principal     = "*"
}

# ---------------------------------------------------------------------------
# Lambda — ai (대시보드 AI 요약·안전가이드, Bedrock Claude)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "ai" {
  function_name    = "${local.resource_prefix}-ai"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = "${path.module}/../dist/ai.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/ai.zip")

  memory_size = 256
  timeout     = 60

  environment {
    variables = {
      BEDROCK_REGION   = "us-east-1"
      BEDROCK_MODEL_ID = "us.anthropic.claude-sonnet-4-6"
    }
  }

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

resource "aws_lambda_function_url" "ai" {
  function_name      = aws_lambda_function.ai.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = false
    allow_origins     = ["*"]
    allow_methods     = ["*"]
    allow_headers     = ["Content-Type"]
    max_age           = 3600
  }
}

resource "aws_lambda_permission" "ai_url_public" {
  statement_id           = "AllowPublicFunctionURL"
  action                 = "lambda:InvokeFunctionUrl"
  function_name          = aws_lambda_function.ai.function_name
  principal              = "*"
  function_url_auth_type = "NONE"
}

resource "aws_lambda_permission" "ai_invoke_public" {
  statement_id  = "AllowPublicInvokeFunction"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ai.function_name
  principal     = "*"
}

# ---------------------------------------------------------------------------
# Lambda — batch-orchestrator (EventBridge 배치)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "batch_orchestrator" {
  function_name    = "${local.resource_prefix}-batch-orchestrator"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = "${path.module}/../dist/batch.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/batch.zip")

  memory_size = 256
  timeout     = 900

  layers = [aws_lambda_layer_version.core.arn]

  environment {
    variables = {
      MODELS_BUCKET     = aws_s3_bucket.models.id
      DAILY_BUCKET      = aws_s3_bucket.daily.id
      NOTIFY_CHANNEL    = "mock"
      BEDROCK_REGION    = "us-east-1"
      BATCH_STORE_CODES = "10130,10481,10931,11071,11224"
    }
  }

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

# ---------------------------------------------------------------------------
# EventBridge — 매일 06:00 KST (21:00 UTC)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "daily_batch" {
  name                = "${local.resource_prefix}-daily-batch"
  description         = "매일 06:00 KST batch-orchestrator 트리거"
  schedule_expression = "cron(0 21 * * ? *)"

  tags = {
    Project       = var.project
    DeployVersion = var.deploy_version
  }
}

resource "aws_cloudwatch_event_target" "batch_target" {
  rule = aws_cloudwatch_event_rule.daily_batch.name
  arn  = aws_lambda_function.batch_orchestrator.arn
}

resource "aws_lambda_permission" "eventbridge_batch" {
  statement_id  = "AllowEventBridgeInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.batch_orchestrator.function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.daily_batch.arn
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "notify_url" {
  description = "notify Lambda Function URL"
  value       = aws_lambda_function_url.notify.function_url
}

output "alerts_url" {
  description = "alerts Lambda Function URL"
  value       = aws_lambda_function_url.alerts.function_url
}

output "ai_url" {
  description = "ai Lambda Function URL (대시보드 AI 요약·안전가이드)"
  value       = aws_lambda_function_url.ai.function_url
}

output "frontend_url" {
  description = "프론트엔드 정적 웹사이트 URL"
  value       = aws_s3_bucket_website_configuration.frontend.website_endpoint
}

output "models_bucket" {
  description = "모델 산출물 S3 버킷"
  value       = aws_s3_bucket.models.id
}

output "daily_bucket" {
  description = "배치 결과 S3 버킷"
  value       = aws_s3_bucket.daily.id
}

output "frontend_bucket_name" {
  description = "프론트엔드 S3 버킷 이름 (deploy.sh 참조용)"
  value       = aws_s3_bucket.frontend.id
}

output "deploy_version" {
  description = "배포 버전"
  value       = var.deploy_version
}

output "resource_prefix" {
  description = "리소스 이름 접두사"
  value       = local.resource_prefix
}

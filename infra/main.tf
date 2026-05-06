###############################################################################
# Daiso Safety AI — Terraform Infrastructure
# AWS 리소스: S3, Lambda, Lambda Layer, API Gateway (HTTP), EventBridge, SES, IAM
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

variable "ses_sender_email" {
  description = "SES 발신 이메일"
  type        = string
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
  bucket = "${var.project}-frontend"

  tags = {
    Project = var.project
    Purpose = "static-web-hosting"
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
  bucket = "${var.project}-models"

  tags = {
    Project = var.project
    Purpose = "model-artifacts"
  }
}

# 3) 배치 결과 저장
resource "aws_s3_bucket" "daily" {
  bucket = "${var.project}-daily"

  tags = {
    Project = var.project
    Purpose = "batch-results"
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
  name               = "${var.project}-lambda-exec"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json

  tags = {
    Project = var.project
  }
}

data "aws_iam_policy_document" "lambda_permissions" {
  # S3 읽기/쓰기
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

  # SES 이메일 발송
  statement {
    actions = [
      "ses:SendEmail",
      "ses:SendRawEmail",
    ]
    resources = ["*"]
  }

  # Lambda invoke (batch → simulate 호출 등)
  statement {
    actions   = ["lambda:InvokeFunction"]
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
  name   = "${var.project}-lambda-permissions"
  role   = aws_iam_role.lambda_exec.id
  policy = data.aws_iam_policy_document.lambda_permissions.json
}

# ---------------------------------------------------------------------------
# Lambda Layer — core/ 모듈 공유
# ---------------------------------------------------------------------------

resource "aws_lambda_layer_version" "core" {
  layer_name          = "${var.project}-core"
  filename            = "${path.module}/../dist/core-layer.zip"
  source_code_hash    = filebase64sha256("${path.module}/../dist/core-layer.zip")
  compatible_runtimes = ["python3.11", "python3.12"]

  description = "core/ 공유 모듈 (risk, llm, rule_matcher, weather)"
}

# ---------------------------------------------------------------------------
# Lambda — simulate (POST /api/simulate)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "simulate" {
  function_name    = "${var.project}-simulate"
  role             = aws_iam_role.lambda_exec.arn
  handler          = "handler.lambda_handler"
  runtime          = "python3.12"
  filename         = "${path.module}/../dist/simulate.zip"
  source_code_hash = filebase64sha256("${path.module}/../dist/simulate.zip")

  memory_size = 512
  timeout     = 60

  layers = [aws_lambda_layer_version.core.arn]

  environment {
    variables = {
      MODELS_BUCKET    = aws_s3_bucket.models.id
      DAILY_BUCKET     = aws_s3_bucket.daily.id
      SES_SENDER_EMAIL = var.ses_sender_email
    }
  }

  tags = {
    Project = var.project
  }
}

# ---------------------------------------------------------------------------
# Lambda — batch-orchestrator (EventBridge 배치 + SES 발송)
# ---------------------------------------------------------------------------

resource "aws_lambda_function" "batch_orchestrator" {
  function_name    = "${var.project}-batch-orchestrator"
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
      MODELS_BUCKET    = aws_s3_bucket.models.id
      DAILY_BUCKET     = aws_s3_bucket.daily.id
      SES_SENDER_EMAIL = var.ses_sender_email
      SIMULATE_FN_NAME = aws_lambda_function.simulate.function_name
    }
  }

  tags = {
    Project = var.project
  }
}

# ---------------------------------------------------------------------------
# API Gateway — HTTP API (v2)
# ---------------------------------------------------------------------------

resource "aws_apigatewayv2_api" "api" {
  name          = "${var.project}-api"
  protocol_type = "HTTP"

  cors_configuration {
    allow_origins = ["*"]
    allow_methods = ["POST", "GET", "OPTIONS"]
    allow_headers = ["Content-Type", "Authorization"]
    max_age       = 3600
  }

  tags = {
    Project = var.project
  }
}

resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.api.id
  name        = "$default"
  auto_deploy = true
}

resource "aws_apigatewayv2_integration" "simulate" {
  api_id                 = aws_apigatewayv2_api.api.id
  integration_type       = "AWS_PROXY"
  integration_uri        = aws_lambda_function.simulate.invoke_arn
  integration_method     = "POST"
  payload_format_version = "2.0"
}

resource "aws_apigatewayv2_route" "simulate" {
  api_id    = aws_apigatewayv2_api.api.id
  route_key = "POST /api/simulate"
  target    = "integrations/${aws_apigatewayv2_integration.simulate.id}"
}

resource "aws_lambda_permission" "apigw_simulate" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.simulate.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.api.execution_arn}/*/*"
}

# ---------------------------------------------------------------------------
# EventBridge — 매일 06:00 KST (21:00 UTC)
# ---------------------------------------------------------------------------

resource "aws_cloudwatch_event_rule" "daily_batch" {
  name                = "${var.project}-daily-batch"
  description         = "매일 06:00 KST batch-orchestrator 트리거"
  schedule_expression = "cron(0 21 * * ? *)"

  tags = {
    Project = var.project
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
# SES — 이메일 인증
# ---------------------------------------------------------------------------

resource "aws_ses_email_identity" "sender" {
  email = var.ses_sender_email
}

# ---------------------------------------------------------------------------
# Outputs
# ---------------------------------------------------------------------------

output "api_url" {
  description = "API Gateway 엔드포인트 URL"
  value       = aws_apigatewayv2_api.api.api_endpoint
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

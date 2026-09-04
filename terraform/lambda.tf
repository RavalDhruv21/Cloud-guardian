locals {
  functions = {
    api = {
      role_arn = aws_iam_role.api.arn
      memory   = 256
      timeout  = 15
      env = {
        DYNAMODB_USERS_TABLE     = aws_dynamodb_table.users.name
        DYNAMODB_METRICS_TABLE   = aws_dynamodb_table.metrics.name
        DYNAMODB_ANOMALIES_TABLE = aws_dynamodb_table.anomalies.name
        DYNAMODB_COST_TABLE      = aws_dynamodb_table.cost_suggestions.name
        S3_BUCKET_NAME           = aws_s3_bucket.reports.bucket
        REMEDIATION_QUEUE_URL    = aws_sqs_queue.queue["remediation"].url
        ALLOWED_ORIGIN           = var.allowed_origin
        GEMINI_API_KEY           = var.gemini_api_key
      }
    }
    collector = {
      role_arn = aws_iam_role.collector.arn
      memory   = 256
      timeout  = 60
      env = {
        DYNAMODB_METRICS_TABLE = aws_dynamodb_table.metrics.name
        COLLECTOR_QUEUE_URL    = aws_sqs_queue.queue["collector"].url
      }
    }
    cost_optimizer = {
      role_arn = aws_iam_role.cost_optimizer.arn
      memory   = 256
      timeout  = 60
      env = {
        DYNAMODB_COST_TABLE      = aws_dynamodb_table.cost_suggestions.name
        COST_OPTIMIZER_QUEUE_URL = aws_sqs_queue.queue["cost-optimizer"].url
      }
    }
    remediation = {
      role_arn = aws_iam_role.remediation.arn
      memory   = 256
      timeout  = 30
      env = {
        DYNAMODB_ANOMALIES_TABLE = aws_dynamodb_table.anomalies.name
        SNS_TOPIC_ARN            = aws_sns_topic.alerts.arn
        REMEDIATION_QUEUE_URL    = aws_sqs_queue.queue["remediation"].url
      }
    }
    report_generator = {
      role_arn = aws_iam_role.report_generator.arn
      memory   = 512
      timeout  = 60
      env = {
        DYNAMODB_ANOMALIES_TABLE   = aws_dynamodb_table.anomalies.name
        DYNAMODB_COST_TABLE        = aws_dynamodb_table.cost_suggestions.name
        S3_BUCKET_NAME             = aws_s3_bucket.reports.bucket
        SNS_TOPIC_ARN              = aws_sns_topic.alerts.arn
        REPORT_GENERATOR_QUEUE_URL = aws_sqs_queue.queue["report-generator"].url
        GEMINI_API_KEY             = var.gemini_api_key
      }
    }
    ai_analyzer = {
      role_arn = aws_iam_role.ai_analyzer.arn
      memory   = 256
      timeout  = 30
      env = {
        DYNAMODB_ANOMALIES_TABLE = aws_dynamodb_table.anomalies.name
        SNS_TOPIC_ARN            = aws_sns_topic.alerts.arn
        GEMINI_API_KEY           = var.gemini_api_key
      }
    }
    analytics_export = {
      role_arn = aws_iam_role.analytics_export.arn
      memory   = 256
      timeout  = 60
      env = {
        DYNAMODB_COST_TABLE      = aws_dynamodb_table.cost_suggestions.name
        DYNAMODB_ANOMALIES_TABLE = aws_dynamodb_table.anomalies.name
        S3_BUCKET_NAME           = aws_s3_bucket.reports.bucket
      }
    }
  }
}

data "archive_file" "function" {
  for_each    = local.functions
  type        = "zip"
  source_dir  = "${path.module}/src/${each.key}"
  output_path = "${path.module}/build/${each.key}.zip"
}

resource "aws_cloudwatch_log_group" "function" {
  for_each          = local.functions
  name              = "/aws/lambda/${local.name_prefix}-${replace(each.key, "_", "-")}"
  retention_in_days = var.log_retention_days
}

resource "aws_lambda_function" "function" {
  for_each         = local.functions
  function_name    = "${local.name_prefix}-${replace(each.key, "_", "-")}"
  role             = each.value.role_arn
  handler          = "handler.handler"
  runtime          = var.lambda_runtime
  memory_size      = each.value.memory
  timeout          = each.value.timeout
  filename         = data.archive_file.function[each.key].output_path
  source_code_hash = data.archive_file.function[each.key].output_base64sha256

  environment {
    variables = each.value.env
  }

  depends_on = [aws_cloudwatch_log_group.function]
}

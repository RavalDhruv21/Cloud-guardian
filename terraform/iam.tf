# One execution role per Lambda, each scoped to only the resources that
# function actually touches (per the DYNAMODB_*_TABLE / *_QUEUE_URL /
# SNS_TOPIC_ARN / S3_BUCKET_NAME references in the real lambdas/*/handler.py).

data "aws_iam_policy_document" "lambda_assume" {
  statement {
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

# ---------- api ----------

resource "aws_iam_role" "api" {
  name               = "${local.name_prefix}-api"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "api_basic" {
  role       = aws_iam_role.api.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "api" {
  statement {
    sid     = "ReadWriteAppTables"
    actions = ["dynamodb:GetItem", "dynamodb:PutItem", "dynamodb:UpdateItem", "dynamodb:Query", "dynamodb:Scan"]
    resources = [
      aws_dynamodb_table.users.arn,
      aws_dynamodb_table.metrics.arn,
      aws_dynamodb_table.anomalies.arn,
      aws_dynamodb_table.cost_suggestions.arn,
    ]
  }
  statement {
    sid       = "ReadWriteReportsBucket"
    actions   = ["s3:GetObject", "s3:PutObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }
  statement {
    sid       = "TriggerRemediation"
    actions   = ["sqs:SendMessage"]
    resources = [aws_sqs_queue.queue["remediation"].arn]
  }
  statement {
    sid       = "InvokeSyncLambdas"
    actions   = ["lambda:InvokeFunction"]
    resources = [aws_lambda_function.function["ai_analyzer"].arn, aws_lambda_function.function["analytics_export"].arn]
  }
}

resource "aws_iam_role_policy" "api" {
  name   = "${local.name_prefix}-api"
  role   = aws_iam_role.api.id
  policy = data.aws_iam_policy_document.api.json
}

# ---------- collector ----------

resource "aws_iam_role" "collector" {
  name               = "${local.name_prefix}-collector"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "collector_basic" {
  role       = aws_iam_role.collector.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "collector" {
  statement {
    sid       = "WriteMetrics"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.metrics.arn]
  }
  statement {
    sid       = "FanOutViaOwnQueue"
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.queue["collector"].arn]
  }
}

resource "aws_iam_role_policy" "collector" {
  name   = "${local.name_prefix}-collector"
  role   = aws_iam_role.collector.id
  policy = data.aws_iam_policy_document.collector.json
}

# ---------- cost_optimizer ----------

resource "aws_iam_role" "cost_optimizer" {
  name               = "${local.name_prefix}-cost-optimizer"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "cost_optimizer_basic" {
  role       = aws_iam_role.cost_optimizer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "cost_optimizer" {
  statement {
    sid       = "WriteCostSuggestions"
    actions   = ["dynamodb:PutItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.cost_suggestions.arn]
  }
  statement {
    sid       = "FanOutViaOwnQueue"
    actions   = ["sqs:SendMessage", "sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.queue["cost-optimizer"].arn]
  }
}

resource "aws_iam_role_policy" "cost_optimizer" {
  name   = "${local.name_prefix}-cost-optimizer"
  role   = aws_iam_role.cost_optimizer.id
  policy = data.aws_iam_policy_document.cost_optimizer.json
}

# ---------- remediation ----------

resource "aws_iam_role" "remediation" {
  name               = "${local.name_prefix}-remediation"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "remediation_basic" {
  role       = aws_iam_role.remediation.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "remediation" {
  statement {
    sid       = "ReadWriteAnomalies"
    actions   = ["dynamodb:GetItem", "dynamodb:UpdateItem"]
    resources = [aws_dynamodb_table.anomalies.arn]
  }
  statement {
    sid       = "PublishAlerts"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
  statement {
    sid       = "ConsumeOwnQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.queue["remediation"].arn]
  }
}

resource "aws_iam_role_policy" "remediation" {
  name   = "${local.name_prefix}-remediation"
  role   = aws_iam_role.remediation.id
  policy = data.aws_iam_policy_document.remediation.json
}

# ---------- report_generator ----------

resource "aws_iam_role" "report_generator" {
  name               = "${local.name_prefix}-report-generator"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "report_generator_basic" {
  role       = aws_iam_role.report_generator.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "report_generator" {
  statement {
    sid       = "ReadFindings"
    actions   = ["dynamodb:Query", "dynamodb:Scan"]
    resources = [aws_dynamodb_table.anomalies.arn, aws_dynamodb_table.cost_suggestions.arn]
  }
  statement {
    sid       = "WriteReports"
    actions   = ["s3:PutObject", "s3:GetObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }
  statement {
    sid       = "PublishAlerts"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
  statement {
    sid       = "ConsumeOwnQueue"
    actions   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:GetQueueAttributes"]
    resources = [aws_sqs_queue.queue["report-generator"].arn]
  }
}

resource "aws_iam_role_policy" "report_generator" {
  name   = "${local.name_prefix}-report-generator"
  role   = aws_iam_role.report_generator.id
  policy = data.aws_iam_policy_document.report_generator.json
}

# ---------- ai_analyzer ----------

resource "aws_iam_role" "ai_analyzer" {
  name               = "${local.name_prefix}-ai-analyzer"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "ai_analyzer_basic" {
  role       = aws_iam_role.ai_analyzer.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "ai_analyzer" {
  statement {
    sid       = "ReadAnomalies"
    actions   = ["dynamodb:Query", "dynamodb:Scan"]
    resources = [aws_dynamodb_table.anomalies.arn]
  }
  statement {
    sid       = "PublishAlerts"
    actions   = ["sns:Publish"]
    resources = [aws_sns_topic.alerts.arn]
  }
}

resource "aws_iam_role_policy" "ai_analyzer" {
  name   = "${local.name_prefix}-ai-analyzer"
  role   = aws_iam_role.ai_analyzer.id
  policy = data.aws_iam_policy_document.ai_analyzer.json
}

# ---------- analytics_export ----------

resource "aws_iam_role" "analytics_export" {
  name               = "${local.name_prefix}-analytics-export"
  assume_role_policy = data.aws_iam_policy_document.lambda_assume.json
}

resource "aws_iam_role_policy_attachment" "analytics_export_basic" {
  role       = aws_iam_role.analytics_export.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_iam_policy_document" "analytics_export" {
  statement {
    sid       = "ReadExportSources"
    actions   = ["dynamodb:Query", "dynamodb:Scan"]
    resources = [aws_dynamodb_table.cost_suggestions.arn, aws_dynamodb_table.anomalies.arn]
  }
  statement {
    sid       = "WriteExports"
    actions   = ["s3:PutObject"]
    resources = ["${aws_s3_bucket.reports.arn}/*"]
  }
}

resource "aws_iam_role_policy" "analytics_export" {
  name   = "${local.name_prefix}-analytics-export"
  role   = aws_iam_role.analytics_export.id
  policy = data.aws_iam_policy_document.analytics_export.json
}

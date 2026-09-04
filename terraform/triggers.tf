# --- SQS -> Lambda (each function consumes its own queue) ---

resource "aws_lambda_event_source_mapping" "collector" {
  event_source_arn = aws_sqs_queue.queue["collector"].arn
  function_name    = aws_lambda_function.function["collector"].arn
  batch_size       = 1
}

resource "aws_lambda_event_source_mapping" "cost_optimizer" {
  event_source_arn = aws_sqs_queue.queue["cost-optimizer"].arn
  function_name    = aws_lambda_function.function["cost_optimizer"].arn
  batch_size       = 1
}

resource "aws_lambda_event_source_mapping" "report_generator" {
  event_source_arn = aws_sqs_queue.queue["report-generator"].arn
  function_name    = aws_lambda_function.function["report_generator"].arn
  batch_size       = 1
}

resource "aws_lambda_event_source_mapping" "remediation" {
  event_source_arn = aws_sqs_queue.queue["remediation"].arn
  function_name    = aws_lambda_function.function["remediation"].arn
  batch_size       = 1
}

# --- EventBridge schedule -> kicks off a scan every hour by invoking
# collector and cost_optimizer directly, which then fan work out via SQS ---

resource "aws_cloudwatch_event_rule" "scan_schedule" {
  name                = "${local.name_prefix}-scan-schedule"
  schedule_expression = "rate(1 hour)"
}

resource "aws_cloudwatch_event_target" "collector" {
  rule      = aws_cloudwatch_event_rule.scan_schedule.name
  target_id = "collector"
  arn       = aws_lambda_function.function["collector"].arn
}

resource "aws_cloudwatch_event_target" "cost_optimizer" {
  rule      = aws_cloudwatch_event_rule.scan_schedule.name
  target_id = "cost_optimizer"
  arn       = aws_lambda_function.function["cost_optimizer"].arn
}

resource "aws_lambda_permission" "eventbridge_collector" {
  statement_id  = "AllowEventBridgeInvokeCollector"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function["collector"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scan_schedule.arn
}

resource "aws_lambda_permission" "eventbridge_cost_optimizer" {
  statement_id  = "AllowEventBridgeInvokeCostOptimizer"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.function["cost_optimizer"].function_name
  principal     = "events.amazonaws.com"
  source_arn    = aws_cloudwatch_event_rule.scan_schedule.arn
}

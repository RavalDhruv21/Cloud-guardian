# One queue per async worker (collector, cost_optimizer, report_generator,
# remediation), each with a dead-letter queue after 3 failed receives.
# ai_analyzer and analytics_export are invoked directly by the api Lambda
# instead, so they don't get a queue.

locals {
  queue_names = ["collector", "cost-optimizer", "report-generator", "remediation"]
}

resource "aws_sqs_queue" "dlq" {
  for_each                  = toset(local.queue_names)
  name                      = "${local.name_prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 days
}

resource "aws_sqs_queue" "queue" {
  for_each                   = toset(local.queue_names)
  name                       = "${local.name_prefix}-${each.key}"
  visibility_timeout_seconds = 60
  message_retention_seconds  = 86400

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 3
  })
}

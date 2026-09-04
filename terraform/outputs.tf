output "api_endpoint" {
  description = "Invoke URL for the lab API."
  value       = aws_apigatewayv2_stage.prod.invoke_url
}

output "reports_bucket" {
  value = aws_s3_bucket.reports.bucket
}

output "dynamodb_tables" {
  value = {
    users            = aws_dynamodb_table.users.name
    metrics          = aws_dynamodb_table.metrics.name
    anomalies        = aws_dynamodb_table.anomalies.name
    cost_suggestions = aws_dynamodb_table.cost_suggestions.name
  }
}

output "sqs_queue_urls" {
  value = { for k, q in aws_sqs_queue.queue : k => q.url }
}

output "sns_alerts_topic_arn" {
  value = aws_sns_topic.alerts.arn
}

output "lambda_function_names" {
  value = { for k, f in aws_lambda_function.function : k => f.function_name }
}

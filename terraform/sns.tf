# Alert topic used by remediation, report_generator, and ai_analyzer.
resource "aws_sns_topic" "alerts" {
  name = "${local.name_prefix}-alerts"
}

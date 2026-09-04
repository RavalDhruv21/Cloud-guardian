locals {
  name_prefix = "${var.project_name}-${var.environment}"
}

data "aws_caller_identity" "current" {}

resource "random_string" "bucket_suffix" {
  length  = 6
  special = false
  upper   = false
}

# Mirrors the 4 tables the real Lambdas reference (cloud-guardian-users/metrics/
# anomalies/cost-suggestions), just under lab-scoped names. On-demand billing so
# an idle lab stack costs ~$0.

resource "aws_dynamodb_table" "users" {
  name         = "${local.name_prefix}-users"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "user_id"

  attribute {
    name = "user_id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "metrics" {
  name         = "${local.name_prefix}-metrics"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "account_id"
  range_key    = "timestamp"

  attribute {
    name = "account_id"
    type = "S"
  }

  attribute {
    name = "timestamp"
    type = "S"
  }
}

resource "aws_dynamodb_table" "anomalies" {
  name         = "${local.name_prefix}-anomalies"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

resource "aws_dynamodb_table" "cost_suggestions" {
  name         = "${local.name_prefix}-cost-suggestions"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "id"

  attribute {
    name = "id"
    type = "S"
  }
}

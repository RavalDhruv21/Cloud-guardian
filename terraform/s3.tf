# Private bucket for generated reports and analytics exports (report_generator,
# analytics_export). Distinct from the frontend's public static-hosting bucket,
# which is out of scope for this lab stack.
resource "aws_s3_bucket" "reports" {
  bucket = "${local.name_prefix}-reports-${random_string.bucket_suffix.result}"
}

resource "aws_s3_bucket_public_access_block" "reports" {
  bucket                  = aws_s3_bucket.reports.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "reports" {
  bucket = aws_s3_bucket.reports.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

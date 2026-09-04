variable "project_name" {
  description = "Prefix used for every resource name. Kept distinct from the real 'cloud-guardian' prod resources on purpose."
  type        = string
  default     = "cloudguardian-lab"
}

variable "environment" {
  description = "Deployment environment label."
  type        = string
  default     = "dev"
}

variable "aws_region" {
  description = "AWS region to deploy the lab stack into."
  type        = string
  default     = "us-east-1"
}

variable "lambda_runtime" {
  description = "Python runtime shared by all Lambda functions."
  type        = string
  default     = "python3.11"
}

variable "log_retention_days" {
  description = "CloudWatch Logs retention for every Lambda's log group."
  type        = number
  default     = 14
}

variable "gemini_api_key" {
  description = "API key for the Gemini API, used by ai_analyzer and report_generator. Leave blank for the lab."
  type        = string
  default     = ""
  sensitive   = true
}

variable "allowed_origin" {
  description = "CORS origin the api Lambda echoes back. Points at nothing real by default."
  type        = string
  default     = "http://localhost:3000"
}

# Resumes Cloud Guardian's background EventBridge schedules.
# Run this before an interview/demo to restore normal operation.

$region = "us-east-1"
$rules = @(
    "cloud-guardian-remediation-schedule",
    "cloud-guardian-collector-schedule",
    "cloud-guardian-analytics-export-schedule",
    "CloudGuardian-Report-Schedule",
    "cloud-guardian-cost-schedule"
)

foreach ($rule in $rules) {
    Write-Host "Enabling $rule..."
    aws events enable-rule --name $rule --region $region
}

Write-Host "`nDone. All scheduled scans are running again."

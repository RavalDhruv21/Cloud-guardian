# Pauses Cloud Guardian's background EventBridge schedules to save free-tier credits.
# Safe & reversible: rules are disabled, not deleted. Run start-guardian.ps1 to resume.

$region = "us-east-1"
$rules = @(
    "cloud-guardian-remediation-schedule",
    "cloud-guardian-collector-schedule",
    "cloud-guardian-analytics-export-schedule",
    "CloudGuardian-Report-Schedule",
    "cloud-guardian-cost-schedule"
)

foreach ($rule in $rules) {
    Write-Host "Disabling $rule..."
    aws events disable-rule --name $rule --region $region
}

Write-Host "`nDone. All scheduled scans are paused. Event-driven rules (CloudTrail-based) are left untouched."
Write-Host "Run .\scripts\start-guardian.ps1 for restart"

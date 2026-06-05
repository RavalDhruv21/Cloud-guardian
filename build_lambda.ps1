# build_lambda.ps1
param(
    [string]$LambdaName
)

Write-Host "Building Lambda package for: $LambdaName" -ForegroundColor Green

$lambdaPath = "lambdas\$LambdaName"
$buildPath = "build\$LambdaName"
$zipPath = "build\$LambdaName.zip"

# Clean previous build
if (Test-Path $buildPath) { Remove-Item $buildPath -Recurse -Force }
if (Test-Path $zipPath) { Remove-Item $zipPath -Force }

# Create build folder
New-Item -ItemType Directory -Path $buildPath -Force | Out-Null

# Copy lambda code
Copy-Item "$lambdaPath\*" $buildPath -Recurse

# Install dependencies into build folder
pip install boto3 requests python-dotenv -t $buildPath --quiet

# Create zip
Compress-Archive -Path "$buildPath\*" -DestinationPath $zipPath -Force

Write-Host "Built: $zipPath" -ForegroundColor Green
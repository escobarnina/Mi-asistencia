<#
.SYNOPSIS
    Empaqueta y despliega la infraestructura modular de CloudFormation en AWS sin pasos manuales.
.DESCRIPTION
    1. Detecta dinamicamente la cuenta de AWS y region activa.
    2. Crea automaticamente el bucket S3 de plantillas si no existe (asistencia-cfn-plantillas-<account>-<region>).
    3. Detecta la VPC y Subred por defecto.
    4. Ejecuta 'aws cloudformation package' convirtiendo los paths locales ./modules/*.yaml en URLs de S3.
    5. Ejecuta 'aws cloudformation deploy' desplegando el stack completo.
#>

[CmdletBinding()]
param(
    [string]$Region = "us-east-1",
    [string]$Branch = "feat/cloudinit",
    [string]$AdminPassword = "Admin1234",
    [string]$StackName = "miasistencia-modular-stack",
    [switch]$NoVerifySsl
)

$ErrorActionPreference = "Stop"

$sslFlag = @()
if ($NoVerifySsl) {
    $sslFlag = @("--no-verify-ssl")
}

Write-Host "==> [1/5] Verificando identidad de AWS..." -ForegroundColor Cyan
$callerJson = & aws @sslFlag sts get-caller-identity --output json | ConvertFrom-Json
$accountId = $callerJson.Account
Write-Host "    Cuenta AWS activa: $accountId ($($callerJson.Arn))" -ForegroundColor Green

# 2. Bucket S3 por cuenta
$bucketName = "asistencia-cfn-plantillas-$accountId-$Region"
Write-Host "==> [2/5] Asegurando bucket S3: $bucketName..." -ForegroundColor Cyan

$bucketCheck = & aws @sslFlag s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    El bucket no existe. Creando automaticamente $bucketName..." -ForegroundColor Yellow
    if ($Region -eq "us-east-1") {
        & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region
    } else {
        & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region --create-bucket-configuration LocationConstraint=$Region
    }
    & aws @sslFlag s3api put-bucket-encryption --bucket $bucketName --server-side-encryption-configuration '{\"Rules\": [{\"ApplyServerSideEncryptionByDefault\": {\"SSEAlgorithm\": \"AES256\"}}]}'
    Write-Host "    Bucket S3 creado con exito." -ForegroundColor Green
} else {
    Write-Host "    Bucket S3 existente y listo." -ForegroundColor Green
}

# 3. Detectar VPC y Subred default
Write-Host "==> [3/5] Detectando VPC y Subred por defecto..." -ForegroundColor Cyan
$vpcId = & aws @sslFlag ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
$subnetId = & aws @sslFlag ec2 describe-subnets --filters "Name=vpc-id,Values=$vpcId" "Name=default-for-az,Values=true" --query "Subnets[0].SubnetId" --output text
Write-Host "    VpcId: $vpcId | SubnetId: $subnetId" -ForegroundColor Green

# 4. Empaquetar modulos a S3
$rootDir = (Get-Item $PSScriptRoot).FullName
$mainTemplate = Join-Path $rootDir "main.yaml"
$packagedTemplate = Join-Path $rootDir "packaged.yaml"

Write-Host "==> [4/5] Empaquetando modulos (package)..." -ForegroundColor Cyan
& aws @sslFlag cloudformation package `
    --template-file $mainTemplate `
    --s3-bucket $bucketName `
    --s3-prefix "cloudformation" `
    --output-template-file $packagedTemplate

if ($LASTEXITCODE -ne 0) {
    Write-Error "Fallo el empaquetado de CloudFormation."
}

# 5. Desplegar
Write-Host "==> [5/5] Desplegando stack $StackName..." -ForegroundColor Cyan
& aws @sslFlag cloudformation deploy `
    --template-file $packagedTemplate `
    --stack-name $StackName `
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND `
    --no-fail-on-empty-changeset `
    --parameter-overrides `
        VpcId=$vpcId `
        SubnetId=$subnetId `
        RepoRama=$Branch `
        AdminPassword=$AdminPassword

Write-Host "`n==> Despliegue completado! Consultando outputs..." -ForegroundColor Cyan
& aws @sslFlag cloudformation describe-stacks `
    --stack-name $StackName `
    --query "Stacks[0].Outputs" `
    --output table

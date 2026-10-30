<#
.SYNOPSIS
    Empaqueta y despliega la infraestructura modular de CloudFormation en AWS sin pasos manuales.
.DESCRIPTION
    1. Verifica que AWS CLI este instalado y que haya credenciales activas.
    2. Detecta dinamicamente la cuenta de AWS y region activa.
    3. Crea automaticamente el bucket S3 de plantillas si no existe (asistencia-cfn-plantillas-<account>-<region>).
    4. Detecta la VPC y Subred por defecto.
    5. Ejecuta 'aws cloudformation package' convirtiendo los paths locales ./modules/*.yaml en URLs de S3.
    6. Ejecuta 'aws cloudformation deploy' desplegando el stack completo con parametros validados.
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

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [CloudFormation] Despliegue Automatizado de Infraestructura" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Validar AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: AWS CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Descarga e instala AWS CLI v2 desde:" -ForegroundColor Yellow
    Write-Host "   https://aws.amazon.com/cli/ y reinicia tu terminal PowerShell.`n" -ForegroundColor Yellow
    exit 1
}

# 2. Validar credenciales activas
Write-Host "==> [1/5] Verificando credenciales e identidad de AWS..." -ForegroundColor Cyan
try {
    $callerJson = & aws @sslFlag sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId = $callerJson.Account
    Write-Host "    Cuenta AWS activa: $accountId ($($callerJson.Arn))" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR]: No se detectaron credenciales válidas de AWS o expiraron." -ForegroundColor Red
    Write-Host "👉 Solución: Configura tus credenciales con:" -ForegroundColor Yellow
    Write-Host "   aws configure" -ForegroundColor Yellow
    Write-Host "   O si usas credenciales temporales (ej. AWS Academy), exporta:" -ForegroundColor Yellow
    Write-Host "   `$env:AWS_ACCESS_KEY_ID = '...'" -ForegroundColor Yellow
    Write-Host "   `$env:AWS_SECRET_ACCESS_KEY = '...'`n" -ForegroundColor Yellow
    exit 1
}

# 3. Bucket S3 por cuenta (creacion automatica sin aws s3 mb manual)
$bucketName = "asistencia-cfn-plantillas-$accountId-$Region"
Write-Host "==> [2/5] Asegurando bucket S3 de plantillas: $bucketName..." -ForegroundColor Cyan

$bucketCheck = & aws @sslFlag s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    El bucket no existe. Creando automáticamente $bucketName..." -ForegroundColor Yellow
    try {
        if ($Region -eq "us-east-1") {
            & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region | Out-Null
        } else {
            & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region --create-bucket-configuration LocationConstraint=$Region | Out-Null
        }
        & aws @sslFlag s3api put-bucket-encryption --bucket $bucketName --server-side-encryption-configuration '{\"Rules\": [{\"ApplyServerSideEncryptionByDefault\": {\"SSEAlgorithm\": \"AES256\"}}]}' | Out-Null
        Write-Host "    Bucket S3 creado con éxito." -ForegroundColor Green
    } catch {
        Write-Host "`n[ERROR]: No se pudo crear el bucket S3 en tu cuenta de AWS." -ForegroundColor Red
        Write-Host "👉 Revisa que tu usuario IAM tenga permisos s3:CreateBucket y s3:PutEncryptionConfiguration.`n" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "    Bucket S3 existente y listo." -ForegroundColor Green
}

# 4. Detectar VPC y Subred default
Write-Host "==> [3/5] Detectando VPC y Subred por defecto..." -ForegroundColor Cyan
try {
    $vpcId = & aws @sslFlag ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
    if (-not $vpcId -or $vpcId -eq "None") {
        throw "No se encontró VPC por defecto en la región $Region."
    }
    $subnetId = & aws @sslFlag ec2 describe-subnets --filters "Name=vpc-id,Values=$vpcId" "Name=default-for-az,Values=true" --query "Subnets[0].SubnetId" --output text
    if (-not $subnetId -or $subnetId -eq "None") {
        throw "No se encontró Subred por defecto en la VPC $vpcId."
    }
    Write-Host "    VpcId: $vpcId | SubnetId: $subnetId" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR]: Error obteniendo VPC o Subred por defecto: $_" -ForegroundColor Red
    Write-Host "👉 Solución: Asegúrate de tener una VPC por defecto en la región '$Region' en la consola de AWS EC2.`n" -ForegroundColor Yellow
    exit 1
}

# 5. Empaquetar modulos a S3
$rootDir = (Get-Item $PSScriptRoot).FullName
$mainTemplate = Join-Path $rootDir "main.yaml"
$packagedTemplate = Join-Path $rootDir "packaged.yaml"

Write-Host "==> [4/5] Empaquetando módulos locales a S3 (package)..." -ForegroundColor Cyan
& aws @sslFlag cloudformation package `
    --template-file $mainTemplate `
    --s3-bucket $bucketName `
    --s3-prefix "cloudformation" `
    --output-template-file $packagedTemplate

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR]: Falló 'aws cloudformation package'." -ForegroundColor Red
    Write-Host "👉 Revisa que existan los archivos main.yaml y la carpeta modules/*.yaml.`n" -ForegroundColor Yellow
    exit 1
}

# 6. Desplegar Stack
Write-Host "==> [5/5] Desplegando stack '$StackName' en AWS... (Esto puede tomar 3-5 minutos)" -ForegroundColor Cyan
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

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR]: Falló el despliegue de CloudFormation." -ForegroundColor Red
    Write-Host "👉 Para ver el detalle del fallo ejecuta:" -ForegroundColor Yellow
    Write-Host "   aws cloudformation describe-stack-events --stack-name $StackName --max-items 20`n" -ForegroundColor Yellow
    exit 1
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " ✔ Despliegue completado con éxito! URLs y salidas:" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

& aws @sslFlag cloudformation describe-stacks `
    --stack-name $StackName `
    --query "Stacks[0].Outputs" `
    --output table

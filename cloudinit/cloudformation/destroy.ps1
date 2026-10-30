<#
.SYNOPSIS
    Elimina por completo el stack de CloudFormation en AWS de forma automatica.
.DESCRIPTION
    1. Verifica las credenciales de AWS.
    2. Comprueba si el stack existe.
    3. Solicita confirmacion interactiva (o por parametro -Force).
    4. Ejecuta 'aws cloudformation delete-stack' y espera hasta que se complete.
    5. Opcionalmente vacia y borra el bucket S3 temporal de plantillas si se solicita (-DeleteBucket).
#>

[CmdletBinding()]
param(
    [string]$StackName = "miasistencia-modular-stack",
    [string]$Region = "us-east-1",
    [switch]$Force,
    [switch]$DeleteBucket,
    [switch]$NoVerifySsl
)

$ErrorActionPreference = "Stop"

$sslFlag = @()
if ($NoVerifySsl) {
    $sslFlag = @("--no-verify-ssl")
}

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " [CloudFormation] Destrucción de Infraestructura" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Validar AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: AWS CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Descarga e instala AWS CLI v2 desde:" -ForegroundColor Yellow
    Write-Host "   https://aws.amazon.com/cli/ y reinicia tu terminal PowerShell.`n" -ForegroundColor Yellow
    exit 1
}

# 2. Validar credenciales activas
Write-Host "==> [1/3] Verificando credenciales de AWS..." -ForegroundColor Cyan
try {
    $callerJson = & aws @sslFlag sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId = $callerJson.Account
    Write-Host "    Cuenta AWS detectada: $accountId ($($callerJson.Arn))" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR]: No se detectaron credenciales válidas de AWS o expiraron." -ForegroundColor Red
    Write-Host "👉 Solución: Ejecuta 'aws configure' o exporta tus credenciales temporales:" -ForegroundColor Yellow
    Write-Host "   `$env:AWS_ACCESS_KEY_ID = '...'" -ForegroundColor Yellow
    Write-Host "   `$env:AWS_SECRET_ACCESS_KEY = '...'`n" -ForegroundColor Yellow
    exit 1
}

# 3. Comprobar si el stack existe
Write-Host "==> [2/3] Comprobando existencia del stack '$StackName'..." -ForegroundColor Cyan
$stackStatus = & aws @sslFlag cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].StackStatus" --output text 2>&1

if ($LASTEXITCODE -ne 0 -or $stackStatus -like "*does not exist*") {
    Write-Host "    El stack '$StackName' no existe en la región '$Region'. Nada que destruir." -ForegroundColor Yellow
    exit 0
}

Write-Host "    Estado actual del stack: $stackStatus" -ForegroundColor Yellow

if (-not $Force) {
    $confirm = Read-Host "¿Estás SEGURO de que deseas eliminar todas las VMs y recursos del stack '$StackName'? (s/N)"
    if ($confirm -ne 's' -and $confirm -ne 'S') {
        Write-Host "Operación cancelada por el usuario." -ForegroundColor Yellow
        exit 0
    }
}

# 4. Eliminar el stack
Write-Host "==> [3/3] Eliminando stack '$StackName' en AWS... Esto puede tomar 2-3 minutos..." -ForegroundColor Cyan
& aws @sslFlag cloudformation delete-stack --stack-name $StackName --region $Region

Write-Host "    Esperando a que AWS finalice la eliminación..." -ForegroundColor Cyan
& aws @sslFlag cloudformation wait stack-delete-complete --stack-name $StackName --region $Region

if ($LASTEXITCODE -eq 0) {
    Write-Host "`n✔ Stack '$StackName' eliminado exitosamente." -ForegroundColor Green
} else {
    Write-Host "`n[AVISO]: Finalizó el comando de eliminación. Verifica con: aws cloudformation describe-stacks --stack-name $StackName" -ForegroundColor Yellow
}

# 5. Opcional: borrar bucket de plantillas
if ($DeleteBucket) {
    $bucketName = "asistencia-cfn-plantillas-$accountId-$Region"
    Write-Host "`n==> [OPCIONAL] Vaciando y eliminando bucket S3: $bucketName..." -ForegroundColor Cyan
    & aws @sslFlag s3 rb "s3://$bucketName" --force
    Write-Host "✔ Bucket S3 eliminado." -ForegroundColor Green
}

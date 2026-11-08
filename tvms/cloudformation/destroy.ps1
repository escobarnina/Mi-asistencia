<#
.SYNOPSIS
    Elimina por completo el stack de CloudFormation en AWS y limpia archivos generados de forma 100% automatizada.
.DESCRIPTION
    1. Verifica las credenciales de AWS.
    2. Comprueba si el stack existe.
    3. Ejecuta 'aws cloudformation delete-stack' sin solicitar confirmación humana.
    4. Espera a que AWS finalice la eliminación (stack-delete-complete).
    5. Elimina los KeyPairs creados en AWS y su archivo .pem local (si fue generado automáticamente).
    6. Elimina archivos locales generados (inventario.ini, ansible.cfg, packaged.yaml).
    7. Opcionalmente vacía y borra el bucket S3 (-DeleteBucket).
#>

[CmdletBinding()]
param(
    [string]$StackName = "miasistencia-modular-stack",
    [string]$Region = "us-east-1",
    [switch]$DeleteBucket,
    [switch]$NoVerifySsl
)

$ErrorActionPreference = "Stop"

$sslFlag = @()
if ($NoVerifySsl) {
    $sslFlag = @("--no-verify-ssl")
}

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " [CloudFormation] Destrucción de Infraestructura y Limpieza" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# Definición de rutas relativas
$scriptDir    = $PSScriptRoot
$tvmsDir      = Split-Path -Parent $scriptDir
$ansibleDir   = Join-Path $tvmsDir "ansible"
$packagedYaml = Join-Path $scriptDir "packaged.yaml"
$inventoryIni = Join-Path $ansibleDir "inventario.ini"
$ansibleCfg   = Join-Path $ansibleDir "ansible.cfg"
$defaultPem   = Join-Path $tvmsDir "asistencia-devops-key.pem"

# 1. Validar AWS CLI
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: AWS CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    exit 1
}

# 2. Validar credenciales activas
Write-Host "==> [1/4] Verificando credenciales de AWS..." -ForegroundColor Cyan
try {
    $callerJson = & aws @sslFlag sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId = $callerJson.Account
    Write-Host "    Cuenta AWS detectada: $accountId ($($callerJson.Arn))" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR]: No se detectaron credenciales válidas de AWS o expiraron." -ForegroundColor Red
    exit 1
}

# 3. Comprobar si el stack existe
Write-Host "==> [2/4] Comprobando existencia del stack '$StackName'..." -ForegroundColor Cyan
$stackStatus = & aws @sslFlag cloudformation describe-stacks --stack-name $StackName --region $Region --query "Stacks[0].StackStatus" --output text 2>&1

if ($LASTEXITCODE -eq 0 -and $stackStatus -notlike "*does not exist*") {
    Write-Host "    Estado actual: $stackStatus. Procediendo a eliminar sin confirmación..." -ForegroundColor Yellow

    # 4. Eliminar el stack de CloudFormation en AWS
    Write-Host "==> [3/4] Eliminando stack '$StackName' en AWS... (Esto puede tomar 2-3 minutos)" -ForegroundColor Cyan
    & aws @sslFlag cloudformation delete-stack --stack-name $StackName --region $Region
    & aws @sslFlag cloudformation wait stack-delete-complete --stack-name $StackName --region $Region

    if ($LASTEXITCODE -eq 0) {
        Write-Host " ✔ Stack '$StackName' eliminado de AWS con éxito." -ForegroundColor Green
    }
} else {
    Write-Host "    El stack '$StackName' ya no existe en AWS." -ForegroundColor Yellow
}

# 5. Limpieza de KeyPair en AWS y archivos locales generados
Write-Host "==> [4/4] Limpiando archivos locales generados..." -ForegroundColor Cyan

# Eliminar KeyPair generado en AWS (asistencia-devops-key)
try {
    & aws @sslFlag ec2 delete-key-pair --key-name "asistencia-devops-key" --region $Region 2>$null
} catch {}

# Eliminar archivo .pem generado
if (Test-Path $defaultPem) {
    Remove-Item $defaultPem -Force -ErrorAction SilentlyContinue
    Write-Host " ✔ Archivo eliminado: $defaultPem" -ForegroundColor Green
}

# Eliminar packaged.yaml si quedó
if (Test-Path $packagedYaml) {
    Remove-Item $packagedYaml -Force -ErrorAction SilentlyContinue
    Write-Host " ✔ Archivo eliminado: $packagedYaml" -ForegroundColor Green
}

# Eliminar inventario.ini
if (Test-Path $inventoryIni) {
    Remove-Item $inventoryIni -Force -ErrorAction SilentlyContinue
    Write-Host " ✔ Archivo eliminado: $inventoryIni" -ForegroundColor Green
}

# Eliminar ansible.cfg
if (Test-Path $ansibleCfg) {
    Remove-Item $ansibleCfg -Force -ErrorAction SilentlyContinue
    Write-Host " ✔ Archivo eliminado: $ansibleCfg" -ForegroundColor Green
}

# Opcional: borrar bucket S3 de plantillas
if ($DeleteBucket) {
    $bucketName = "asistencia-cfn-plantillas-$accountId-$Region"
    Write-Host " Vaciando y eliminando bucket S3: $bucketName..." -ForegroundColor Cyan
    & aws @sslFlag s3 rb "s3://$bucketName" --force 2>$null
    Write-Host " ✔ Bucket S3 eliminado." -ForegroundColor Green
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Destrucción y limpieza completada sin intervención humana!" -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Green

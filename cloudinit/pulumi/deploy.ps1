<#
.SYNOPSIS
    Despliega la infraestructura modular de Pulumi en Python (Backend + Frontend) con Cloud-Init.
.DESCRIPTION
    1. Verifica que Pulumi, Python y AWS CLI esten instalados.
    2. Comprueba o crea automaticamente el entorno virtual (venv) e instala dependencias (requirements.txt).
    3. Selecciona o crea el stack 'dev'.
    4. Auto-configura credenciales y parametros en Pulumi.dev.yaml si no existe.
    5. Ejecuta 'pulumi up' y muestra los outputs exportados.
#>

[CmdletBinding()]
param(
    [string]$Stack = "dev",
    [string]$Region = "us-east-1",
    [string]$Branch = "feat/cloudinit",
    [string]$AdminPassword = "Admin1234",
    [switch]$AutoApprove
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [Pulumi] Despliegue Automatizado de Infraestructura" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Validar Pulumi CLI
if (-not (Get-Command pulumi -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: Pulumi CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Instala Pulumi ejecutando en PowerShell:" -ForegroundColor Yellow
    Write-Host "   winget install Pulumi.Pulumi" -ForegroundColor Yellow
    Write-Host "   O visita: https://www.pulumi.com/docs/get-started/install/`n" -ForegroundColor Yellow
    exit 1
}

# 2. Validar Python
if (-not (Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: Python no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Instala Python 3.10+ desde https://www.python.org/downloads/`n" -ForegroundColor Yellow
    exit 1
}

# 3. Validar credenciales de AWS
Write-Host "==> [1/4] Verificando credenciales de AWS..." -ForegroundColor Cyan
if (Get-Command aws -ErrorAction SilentlyContinue) {
    try {
        $callerJson = & aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        Write-Host "    Cuenta AWS activa: $($callerJson.Account) ($($callerJson.Arn))" -ForegroundColor Green
    } catch {
        Write-Host "    [AVISO]: No se pudo validar 'aws sts get-caller-identity'. Pulumi usará las variables de entorno de AWS." -ForegroundColor Yellow
    }
}

Push-Location $PSScriptRoot
try {
    # 4. Entorno virtual de Python
    Write-Host "`n==> [2/4] Verificando entorno virtual de Python (venv)..." -ForegroundColor Cyan
    $venvDir = Join-Path $PSScriptRoot "venv"
    $pythonExe = Join-Path $venvDir "Scripts\python.exe"

    if (-not (Test-Path $pythonExe)) {
        Write-Host "    Creando entorno virtual en $venvDir..." -ForegroundColor Yellow
        & python -m venv venv
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: No se pudo crear el entorno virtual de Python." -ForegroundColor Red
            exit 1
        }
    }

    Write-Host "    Instalando/verificando librerías de requirements.txt..." -ForegroundColor Cyan
    & $pythonExe -m pip install --quiet --upgrade pip
    & $pythonExe -m pip install --quiet -r requirements.txt
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló la instalación de dependencias en requirements.txt." -ForegroundColor Red
        exit 1
    }
    Write-Host "    Dependencias de Python listas." -ForegroundColor Green

    # 5. Configurar Stack de Pulumi
    Write-Host "`n==> [3/4] Inicializando Stack de Pulumi '$Stack'..." -ForegroundColor Cyan
    $stackSelect = & pulumi stack select $Stack 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Creando nuevo stack '$Stack'..." -ForegroundColor Yellow
        & pulumi stack init $Stack
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: No se pudo inicializar el stack de Pulumi '$Stack'." -ForegroundColor Red
            exit 1
        }
    }

    # Configurar parámetros básicos
    & pulumi config set aws:region $Region
    & pulumi config set repo_rama $Branch
    & pulumi config set --secret admin_password $AdminPassword

    # 6. Desplegar con Pulumi
    Write-Host "`n==> [4/4] Desplegando infraestructura en AWS (pulumi up)..." -ForegroundColor Cyan
    $yesFlag = @()
    if ($AutoApprove) {
        $yesFlag = @("--yes")
    }

    & pulumi up --stack $Stack @yesFlag

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló 'pulumi up'." -ForegroundColor Red
        exit 1
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " ✔ Despliegue con Pulumi completado con éxito! Salidas:" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    & pulumi stack output
}
finally {
    Pop-Location
}

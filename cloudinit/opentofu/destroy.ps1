<#
.SYNOPSIS
    Elimina por completo la infraestructura de OpenTofu (VMs, Security Groups, llaves) en AWS.
.DESCRIPTION
    1. Verifica que OpenTofu o Terraform esten instalados.
    2. Comprueba que exista backend.hcl y terraform.tfvars.
    3. Solicita confirmacion interactiva (o por parametro -Force).
    4. Ejecuta 'tofu destroy' limpiando los recursos de la nube.
#>

[CmdletBinding()]
param(
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " [OpenTofu] Destrucción de Infraestructura" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

# 1. Determinar binario
$bin = $null
if (Get-Command tofu -ErrorAction SilentlyContinue) {
    $bin = "tofu"
} elseif (Get-Command terraform -ErrorAction SilentlyContinue) {
    $bin = "terraform"
} else {
    Write-Host "`n[ERROR]: Ni 'tofu' ni 'terraform' están instalados en el PATH." -ForegroundColor Red
    Write-Host "👉 Instala OpenTofu con: winget install opentofu.opentofu`n" -ForegroundColor Yellow
    exit 1
}

$awsDir = Join-Path $PSScriptRoot "aws"
if (-not (Test-Path $awsDir)) {
    Write-Host "`n[ERROR]: No se encontró la carpeta 'aws' en: $awsDir" -ForegroundColor Red
    exit 1
}

Push-Location $awsDir
try {
    if (-not (Test-Path "backend.hcl")) {
        Write-Host "`n[ERROR]: No existe 'backend.hcl' en $awsDir." -ForegroundColor Red
        Write-Host "👉 OpenTofu necesita saber en qué backend reside el estado para destruirlo.`n" -ForegroundColor Yellow
        exit 1
    }

    Write-Host "==> [1/2] Inicializando backend..." -ForegroundColor Cyan
    & $bin init -backend-config="backend.hcl" | Out-Null

    if (-not $Force) {
        $confirm = Read-Host "`n¿Estás SEGURO de que deseas DESTRUIR las máquinas virtuales y recursos de OpenTofu? (s/N)"
        if ($confirm -ne 's' -and $confirm -ne 'S') {
            Write-Host "Operación cancelada por el usuario." -ForegroundColor Yellow
            exit 0
        }
    }

    Write-Host "`n==> [2/2] Destruyendo recursos en AWS ($bin destroy)..." -ForegroundColor Cyan
    if ($Force) {
        & $bin destroy -auto-approve
    } else {
        & $bin destroy
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✔ Infraestructura de OpenTofu destruida exitosamente." -ForegroundColor Green
    } else {
        Write-Host "`n[ERROR]: Ocurrió un error al destruir los recursos con OpenTofu." -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

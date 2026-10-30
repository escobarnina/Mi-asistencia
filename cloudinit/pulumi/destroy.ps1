<#
.SYNOPSIS
    Elimina por completo los recursos de Pulumi en AWS (Backend + Frontend).
.DESCRIPTION
    1. Verifica que Pulumi este instalado.
    2. Selecciona el stack deseado (dev por defecto).
    3. Solicita confirmacion interactiva (o por parametro -Force).
    4. Ejecuta 'pulumi destroy'.
#>

[CmdletBinding()]
param(
    [string]$Stack = "dev",
    [switch]$Force
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Magenta
Write-Host " [Pulumi] Destrucción de Infraestructura" -ForegroundColor Magenta
Write-Host "==========================================================" -ForegroundColor Magenta

if (-not (Get-Command pulumi -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: Pulumi CLI no está instalado en el PATH." -ForegroundColor Red
    Write-Host "👉 Instala Pulumi con: winget install Pulumi.Pulumi`n" -ForegroundColor Yellow
    exit 1
}

Push-Location $PSScriptRoot
try {
    Write-Host "==> [1/2] Seleccionando stack '$Stack'..." -ForegroundColor Cyan
    $selectCheck = & pulumi stack select $Stack 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    El stack '$Stack' no existe. Nada que destruir." -ForegroundColor Yellow
        exit 0
    }

    if (-not $Force) {
        $confirm = Read-Host "`n¿Estás SEGURO de que deseas DESTRUIR todos los recursos del stack '$Stack'? (s/N)"
        if ($confirm -ne 's' -and $confirm -ne 'S') {
            Write-Host "Operación cancelada por el usuario." -ForegroundColor Yellow
            exit 0
        }
    }

    Write-Host "`n==> [2/2] Destruyendo recursos en AWS (pulumi destroy)..." -ForegroundColor Cyan
    if ($Force) {
        & pulumi destroy --stack $Stack --yes
    } else {
        & pulumi destroy --stack $Stack
    }

    if ($LASTEXITCODE -eq 0) {
        Write-Host "`n✔ Infraestructura de Pulumi destruida exitosamente." -ForegroundColor Green
    } else {
        Write-Host "`n[ERROR]: Ocurrió un error al ejecutar 'pulumi destroy'." -ForegroundColor Red
        exit 1
    }
}
finally {
    Pop-Location
}

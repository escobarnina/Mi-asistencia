<#
.SYNOPSIS
    Despliega la infraestructura completa de OpenTofu (Backend + Frontend) con Cloud-Init.
.DESCRIPTION
    1. Verifica que OpenTofu (tofu) o Terraform esten instalados.
    2. Verifica credenciales activas de AWS.
    3. Auto-genera backend.hcl y terraform.tfvars si no existen a partir de sus .example.
    4. Ejecuta tofu init (con backend remoto S3).
    5. Ejecuta tofu apply de forma automatica y muestra los outputs.
#>

[CmdletBinding()]
param(
    [string]$Branch = "feat/cloudinit",
    [string]$AdminPassword = "Admin1234",
    [switch]$AutoApprove
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [OpenTofu] Despliegue Automatizado de Infraestructura" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# 1. Determinar binario (tofu o terraform)
$bin = $null
if (Get-Command tofu -ErrorAction SilentlyContinue) {
    $bin = "tofu"
} elseif (Get-Command terraform -ErrorAction SilentlyContinue) {
    $bin = "terraform"
} else {
    Write-Host "`n[ERROR]: Ni 'tofu' ni 'terraform' están instalados o en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Instala OpenTofu ejecutando en PowerShell:" -ForegroundColor Yellow
    Write-Host "   winget install opentofu.opentofu" -ForegroundColor Yellow
    Write-Host "   O descarga el binario desde: https://opentofu.org/docs/intro/install/`n" -ForegroundColor Yellow
    exit 1
}
Write-Host "    Binario IaC detectado: $bin" -ForegroundColor Green

# 2. Validar credenciales de AWS
Write-Host "==> [1/4] Verificando credenciales de AWS..." -ForegroundColor Cyan
if (Get-Command aws -ErrorAction SilentlyContinue) {
    try {
        $callerJson = & aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        Write-Host "    Cuenta AWS activa: $($callerJson.Account) ($($callerJson.Arn))" -ForegroundColor Green
    } catch {
        Write-Host "    [AVISO]: No se pudo validar 'aws sts get-caller-identity'. Se intentará continuar con OpenTofu." -ForegroundColor Yellow
    }
} else {
    Write-Host "    [AVISO]: AWS CLI no detectado en el PATH. Asegúrate de tener variables AWS_ACCESS_KEY_ID configuradas." -ForegroundColor Yellow
}

# 3. Preparar archivos de configuracion en cloudinit/opentofu/aws
$awsDir = Join-Path $PSScriptRoot "aws"
if (-not (Test-Path $awsDir)) {
    Write-Host "`n[ERROR]: No se encontró la carpeta 'aws' en: $awsDir" -ForegroundColor Red
    exit 1
}

Push-Location $awsDir
try {
    # Verificar backend.hcl
    if (-not (Test-Path "backend.hcl")) {
        Write-Host "==> Preparando 'backend.hcl' a partir de 'backend.hcl.example'..." -ForegroundColor Yellow
        if (Test-Path "backend.hcl.example") {
            Copy-Item "backend.hcl.example" "backend.hcl"
            Write-Host "    Archivo backend.hcl creado." -ForegroundColor Green
        } else {
            Write-Host "`n[ERROR]: Falta 'backend.hcl' y no existe 'backend.hcl.example'." -ForegroundColor Red
            Write-Host "👉 Si usas backend local o remoto, genera backend.hcl con tus datos de S3.`n" -ForegroundColor Yellow
            exit 1
        }
    }

    # Verificar / actualizar terraform.tfvars
    # IMPORTANTE: siempre actualizar repo_rama y admin_password para evitar
    # el error "Mismatch between input and plan variable value" al hacer apply.
    if (-not (Test-Path "terraform.tfvars")) {
        Write-Host "==> Preparando 'terraform.tfvars' a partir de 'terraform.tfvars.example'..." -ForegroundColor Yellow
        if (Test-Path "terraform.tfvars.example") {
            Copy-Item "terraform.tfvars.example" "terraform.tfvars"
            Write-Host "    Archivo terraform.tfvars creado desde plantilla." -ForegroundColor Green
        } else {
            Write-Host "`n[ERROR]: Falta 'terraform.tfvars' y no existe plantilla .example." -ForegroundColor Red
            Write-Host "👉 Crea el archivo aws\terraform.tfvars con al menos: admin_password = `"TuPassword`"`n" -ForegroundColor Yellow
            exit 1
        }
    }

    # Siempre actualizar repo_rama y admin_password en el tfvars existente para
    # que plan y apply lean exactamente el mismo valor (evita mismatch).
    Write-Host "==> Sincronizando repo_rama y admin_password en terraform.tfvars..." -ForegroundColor Yellow
    $tfvarsContent = Get-Content "terraform.tfvars" -Raw
    if ($tfvarsContent -match 'repo_rama\s*=') {
        $tfvarsContent = $tfvarsContent -replace 'repo_rama\s*=\s*"[^"]*"', "repo_rama = `"$Branch`""
    } else {
        $tfvarsContent += "`nrepo_rama = `"$Branch`""
    }
    if ($tfvarsContent -match 'admin_password\s*=') {
        $tfvarsContent = $tfvarsContent -replace 'admin_password\s*=\s*"[^"]*"', "admin_password = `"$AdminPassword`""
    } else {
        $tfvarsContent += "`nadmin_password = `"$AdminPassword`""
    }
    Set-Content -Path "terraform.tfvars" -Value $tfvarsContent -NoNewline
    Write-Host "    terraform.tfvars sincronizado." -ForegroundColor Green

    # 4. Inicializar OpenTofu
    Write-Host "`n==> [2/4] Inicializando OpenTofu ($bin init)..." -ForegroundColor Cyan
    & $bin init -backend-config="backend.hcl"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Reintentando con flag -reconfigure..." -ForegroundColor Yellow
        & $bin init -backend-config="backend.hcl" -reconfigure
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: Falló '$bin init'." -ForegroundColor Red
            Write-Host "👉 Revisa que el bucket S3 y tabla DynamoDB definidos en 'backend.hcl' existan y tengas acceso.`n" -ForegroundColor Yellow
            exit 1
        }
    }

    # 5. Plan / Validar
    # Eliminar plan anterior para evitar el error "Mismatch between input and plan variable value"
    if (Test-Path "tfplan") {
        Remove-Item "tfplan" -Force
        Write-Host "    Plan anterior eliminado para forzar regeneración limpia." -ForegroundColor DarkGray
    }
    Write-Host "`n==> [3/4] Generando plan de ejecución ($bin plan)..." -ForegroundColor Cyan
    # Las variables vienen del terraform.tfvars ya sincronizado, NO se pasan por -var
    # para evitar el mismatch entre plan y apply.
    & $bin plan -out="tfplan"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló '$bin plan'. Revisa las credenciales o variables de AWS." -ForegroundColor Red
        exit 1
    }

    # 6. Aplicar
    Write-Host "`n==> [4/4] Aplicando infraestructura en AWS ($bin apply)..." -ForegroundColor Cyan
    if ($AutoApprove) {
        & $bin apply -auto-approve "tfplan"
    } else {
        & $bin apply "tfplan"
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló '$bin apply'." -ForegroundColor Red
        exit 1
    }

    if (Test-Path "tfplan") {
        Remove-Item "tfplan" -Force -ErrorAction SilentlyContinue
    }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " ✔ Despliegue con OpenTofu completado con éxito! Salidas:" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    & $bin output
}
finally {
    Pop-Location
}

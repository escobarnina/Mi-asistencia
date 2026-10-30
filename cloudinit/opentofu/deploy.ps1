<#
.SYNOPSIS
    Despliega la infraestructura completa de OpenTofu (Backend + Frontend) con Cloud-Init.
    Si es la primera vez, corre el BOOTSTRAP automáticamente para crear S3 + DynamoDB + Rol IAM.
.DESCRIPTION
    Flujo completo:
    PASO 0 (solo 1ª vez): Bootstrap → crea el bucket S3, tabla DynamoDB y Rol IAM colaborador.
                          Al terminar genera automáticamente aws/backend.hcl y aws/terraform.tfvars.
    PASO 1: tofu init    → conecta con el backend S3 remoto usando backend.hcl.
    PASO 2: tofu plan    → genera el plan de ejecución y lo guarda en tfplan.
    PASO 3: tofu apply   → aplica el plan en AWS y muestra IPs + URLs de acceso.

.PARAMETER Branch
    Rama del repositorio a desplegar. Por defecto: feat/cloudinit.

.PARAMETER AdminPassword
    Contraseña del administrador de la aplicación. Por defecto: Admin1234.

.PARAMETER AutoApprove
    Si se especifica, omite la confirmación interactiva de tofu apply.

.PARAMETER SaltarBootstrap
    Si se especifica, omite el PASO 0 aunque backend.hcl no esté configurado.
    Úsalo solo si ya corriste el bootstrap manualmente y el archivo es correcto.

.EXAMPLE
    # Despliegue completo (detecta si hace falta el bootstrap):
    .\deploy.ps1

    # Despliegue con aprobación automática:
    .\deploy.ps1 -AutoApprove

    # Forzar saltar el bootstrap:
    .\deploy.ps1 -SaltarBootstrap
#>

[CmdletBinding()]
param(
    [string]$Branch        = "feat/cloudinit",
    [string]$AdminPassword = "Admin1234",
    [switch]$AutoApprove,
    [switch]$SaltarBootstrap
)

$ErrorActionPreference = "Stop"

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [OpenTofu] Despliegue Automatizado de Infraestructura" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# Verificar binario (tofu o terraform)
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# [1/4] Validar credenciales de AWS
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [1/4] Verificando credenciales de AWS..." -ForegroundColor Cyan
if (Get-Command aws -ErrorAction SilentlyContinue) {
    try {
        $callerJson = & aws sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
        $accountId  = $callerJson.Account
        Write-Host "    Cuenta AWS activa: $accountId ($($callerJson.Arn))" -ForegroundColor Green
    } catch {
        Write-Host "`n[ERROR]: No se detectaron credenciales válidas de AWS." -ForegroundColor Red
        Write-Host "👉 Configura tus credenciales con:" -ForegroundColor Yellow
        Write-Host '   $env:AWS_ACCESS_KEY_ID     = "AKIA..."' -ForegroundColor Yellow
        Write-Host '   $env:AWS_SECRET_ACCESS_KEY = "..."' -ForegroundColor Yellow
        Write-Host "   O ejecuta: aws configure`n" -ForegroundColor Yellow
        exit 1
    }
} else {
    Write-Host "    [AVISO]: AWS CLI no detectado. Asegúrate de tener AWS_ACCESS_KEY_ID configurada." -ForegroundColor Yellow
}

# ─────────────────────────────────────────────────────────────────────────────
# PASO 0 — BOOTSTRAP (solo la primera vez)
# Detectar si backend.hcl ya tiene valores reales (generados por el bootstrap)
# ─────────────────────────────────────────────────────────────────────────────
$awsDir       = Join-Path $PSScriptRoot "aws"
$bootstrapDir = Join-Path $PSScriptRoot "bootstrap"
$backendHcl   = Join-Path $awsDir "backend.hcl"

$necesitaBootstrap = $false

if (-not $SaltarBootstrap) {
    if (-not (Test-Path $backendHcl)) {
        $necesitaBootstrap = $true
        Write-Host "`n    [INFO] No se encontró aws/backend.hcl → se ejecutará el bootstrap." -ForegroundColor Yellow
    } else {
        # Verificar que el archivo no tenga los placeholders del .example
        $hclContent = Get-Content $backendHcl -Raw
        if ($hclContent -match "NOMBRE_DE_TU_BUCKET_S3" -or
            $hclContent -match "ACCOUNT_ID_DEL_CREADOR" -or
            $hclContent -match "RolTerraformColaborador.*ACCOUNT_ID") {
            $necesitaBootstrap = $true
            Write-Host "`n    [INFO] aws/backend.hcl contiene valores de ejemplo sin reemplazar → se ejecutará el bootstrap." -ForegroundColor Yellow
        } else {
            Write-Host "    aws/backend.hcl detectado con valores reales. Saltando bootstrap." -ForegroundColor Green
        }
    }
}

if ($necesitaBootstrap) {
    Write-Host ""
    Write-Host "===========================================================" -ForegroundColor Magenta
    Write-Host " PASO 0: Bootstrap (se ejecuta UNA SOLA VEZ por cuenta AWS)" -ForegroundColor Magenta
    Write-Host "===========================================================" -ForegroundColor Magenta
    Write-Host " Crea:" -ForegroundColor White
    Write-Host "   • Bucket S3 para el estado remoto (.tfstate)" -ForegroundColor Gray
    Write-Host "   • Tabla DynamoDB para State Locking" -ForegroundColor Gray
    Write-Host "   • Rol IAM RolTerraformColaborador" -ForegroundColor Gray
    Write-Host "   • aws/backend.hcl y aws/terraform.tfvars (generados automáticamente)" -ForegroundColor Gray
    Write-Host ""

    if (-not (Test-Path $bootstrapDir)) {
        Write-Host "[ERROR]: No se encontró la carpeta 'bootstrap' en: $bootstrapDir" -ForegroundColor Red
        exit 1
    }

    Push-Location $bootstrapDir
    try {
        # Preparar terraform.tfvars del bootstrap si no existe
        if (-not (Test-Path "terraform.tfvars")) {
            if (Test-Path "terraform.tfvars.example") {
                Copy-Item "terraform.tfvars.example" "terraform.tfvars"
                Write-Host "    bootstrap/terraform.tfvars creado desde plantilla." -ForegroundColor Green
                Write-Host ""
                Write-Host "    [INFO] El bootstrap creará el bucket con el Account ID de tu cuenta AWS." -ForegroundColor Cyan
                Write-Host "    Si quieres agregar cuentas de compañeros al rol IAM, edita:" -ForegroundColor Cyan
                Write-Host "    bootstrap\terraform.tfvars → agrega sus Account IDs en 'cuentas_colaboradores'." -ForegroundColor Cyan
                Write-Host ""
            } else {
                Write-Host "[ERROR]: Falta bootstrap/terraform.tfvars.example." -ForegroundColor Red
                exit 1
            }
        }

        # tofu init del bootstrap (estado local, sin backend remoto)
        Write-Host "==> [Bootstrap 1/2] Inicializando bootstrap ($bin init)..." -ForegroundColor Cyan
        & $bin init
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: Falló '$bin init' en el bootstrap." -ForegroundColor Red
            Write-Host "👉 Revisa que tengas acceso a internet y credenciales AWS activas." -ForegroundColor Yellow
            exit 1
        }

        # tofu apply del bootstrap
        Write-Host "`n==> [Bootstrap 2/2] Aplicando bootstrap ($bin apply)..." -ForegroundColor Cyan
        Write-Host "    Esto crea el Bucket S3, la tabla DynamoDB y el Rol IAM en AWS." -ForegroundColor Gray
        if ($AutoApprove) {
            & $bin apply -auto-approve
        } else {
            & $bin apply
        }
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: Falló '$bin apply' en el bootstrap." -ForegroundColor Red
            Write-Host "👉 Revisa los errores arriba. Puede ser un problema de permisos IAM." -ForegroundColor Yellow
            Write-Host "   El usuario IAM necesita permisos: s3:*, dynamodb:*, iam:*, sts:*`n" -ForegroundColor Yellow
            exit 1
        }

        Write-Host "`n ✔ Bootstrap completado. aws/backend.hcl y aws/terraform.tfvars generados." -ForegroundColor Green

    } finally {
        Pop-Location
    }

    # Verificar que el bootstrap generó el backend.hcl correcto
    if (-not (Test-Path $backendHcl)) {
        Write-Host "`n[ERROR]: El bootstrap terminó pero no generó aws/backend.hcl." -ForegroundColor Red
        Write-Host "👉 Revisa los outputs del bootstrap arriba y crea el archivo manualmente." -ForegroundColor Yellow
        exit 1
    }
    Write-Host ""
}

# ─────────────────────────────────────────────────────────────────────────────
# [2/4] Preparar aws/terraform.tfvars (sincronizar admin_password y repo_rama)
# ─────────────────────────────────────────────────────────────────────────────
Push-Location $awsDir
try {
    $tfvarsPath = "terraform.tfvars"

    # Si el bootstrap no lo generó, crearlo desde el .example
    if (-not (Test-Path $tfvarsPath)) {
        Write-Host "==> Preparando terraform.tfvars desde .example..." -ForegroundColor Yellow
        if (Test-Path "terraform.tfvars.example") {
            Copy-Item "terraform.tfvars.example" $tfvarsPath
            Write-Host "    aws/terraform.tfvars creado desde plantilla." -ForegroundColor Green
        } else {
            Write-Host "`n[ERROR]: Falta aws/terraform.tfvars y no existe .example." -ForegroundColor Red
            Write-Host "👉 Crea el archivo con al menos: admin_password = `"TuPassword`"`n" -ForegroundColor Yellow
            exit 1
        }
    }

    # Siempre sincronizar repo_rama y admin_password para evitar mismatch plan/apply
    Write-Host "==> Sincronizando repo_rama y admin_password en terraform.tfvars..." -ForegroundColor Yellow
    $tfvarsContent = Get-Content $tfvarsPath -Raw

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
    Set-Content -Path $tfvarsPath -Value $tfvarsContent -NoNewline
    Write-Host "    terraform.tfvars sincronizado." -ForegroundColor Green

    # ─────────────────────────────────────────────────────────────────────────
    # [2/4] tofu init con backend.hcl
    # ─────────────────────────────────────────────────────────────────────────
    Write-Host "`n==> [2/4] Inicializando OpenTofu ($bin init)..." -ForegroundColor Cyan
    & $bin init -backend-config="backend.hcl"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "    Reintentando con -reconfigure..." -ForegroundColor Yellow
        & $bin init -backend-config="backend.hcl" -reconfigure
        if ($LASTEXITCODE -ne 0) {
            Write-Host "`n[ERROR]: Falló '$bin init'." -ForegroundColor Red
            Write-Host "👉 Posibles causas:" -ForegroundColor Yellow
            Write-Host "   1. El bucket S3 o tabla DynamoDB en backend.hcl no existen." -ForegroundColor Yellow
            Write-Host "      → Corre el bootstrap primero: cd bootstrap; tofu init; tofu apply" -ForegroundColor Yellow
            Write-Host "   2. El role_arn en backend.hcl no es válido o no tienes permiso sts:AssumeRole." -ForegroundColor Yellow
            Write-Host "      → Verifica en AWS Console > IAM > Roles > RolTerraformColaborador" -ForegroundColor Yellow
            Write-Host "   3. Las credenciales AWS no tienen permisos suficientes.`n" -ForegroundColor Yellow
            exit 1
        }
    }

    # ─────────────────────────────────────────────────────────────────────────
    # [3/4] tofu plan
    # ─────────────────────────────────────────────────────────────────────────
    # Eliminar plan anterior para evitar mismatch entre plan y apply
    if (Test-Path "tfplan") {
        Remove-Item "tfplan" -Force
        Write-Host "    Plan anterior eliminado." -ForegroundColor DarkGray
    }

    Write-Host "`n==> [3/4] Generando plan de ejecución ($bin plan)..." -ForegroundColor Cyan
    # Las variables vienen del terraform.tfvars ya sincronizado (no se pasan por -var
    # para evitar el error "Mismatch between input and plan variable value" en apply)
    & $bin plan -out="tfplan"
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló '$bin plan'. Revisa las credenciales o variables de AWS." -ForegroundColor Red
        exit 1
    }

    # ─────────────────────────────────────────────────────────────────────────
    # [4/4] tofu apply
    # ─────────────────────────────────────────────────────────────────────────
    Write-Host "`n==> [4/4] Aplicando infraestructura en AWS ($bin apply)..." -ForegroundColor Cyan
    if ($AutoApprove) {
        & $bin apply -auto-approve "tfplan"
    } else {
        & $bin apply "tfplan"
    }

    if ($LASTEXITCODE -ne 0) {
        Write-Host "`n[ERROR]: Falló '$bin apply'." -ForegroundColor Red
        Write-Host "👉 Para ver el detalle completo del error:" -ForegroundColor Yellow
        Write-Host "   $bin show tfplan" -ForegroundColor Yellow
        exit 1
    }

    if (Test-Path "tfplan") { Remove-Item "tfplan" -Force -ErrorAction SilentlyContinue }

    Write-Host "`n==========================================================" -ForegroundColor Green
    Write-Host " ✔ Despliegue con OpenTofu completado con éxito! Salidas:" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Green
    & $bin output

} finally {
    Pop-Location
}

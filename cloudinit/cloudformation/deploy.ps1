<#
.SYNOPSIS
    Empaqueta y despliega la infraestructura modular de CloudFormation en AWS sin pasos manuales.
    También puede inyectar los 3 secretos de AWS en el repositorio de GitHub via GitHub CLI (gh).
.DESCRIPTION
    1. (Opcional) Detecta si los secretos de GitHub Actions ya existen y ofrece subirlos via `gh secret set`.
    2. Verifica que AWS CLI esté instalado y que haya credenciales activas.
    3. Detecta dinámicamente la cuenta de AWS y región activa.
    4. Crea automáticamente el bucket S3 de plantillas si no existe (asistencia-cfn-plantillas-<account>-<region>).
    5. Detecta la VPC y Subred por defecto.
    6. Ejecuta 'aws cloudformation package' convirtiendo los paths locales ./modules/*.yaml en URLs de S3.
    7. Ejecuta 'aws cloudformation deploy' desplegando el stack completo con parámetros validados.

.PARAMETER Region
    Región de AWS. Por defecto: us-east-1.

.PARAMETER Branch
    Rama del repositorio a desplegar. Por defecto: feat/cloudinit.

.PARAMETER AdminPassword
    Contraseña del administrador de la aplicación. Por defecto: Admin1234.

.PARAMETER StackName
    Nombre del stack de CloudFormation. Por defecto: miasistencia-modular-stack.

.PARAMETER SoloSecretos
    Si se especifica, SOLO inyecta los secretos en GitHub y sale sin desplegar infraestructura.

.PARAMETER NoVerifySsl
    Desactiva la verificación SSL de AWS CLI (útil si hay proxy o antivirus corporativo).

.EXAMPLE
    # Despliegue completo (pide si quieres subir secretos también):
    .\deploy.ps1

    # Solo inyectar secretos en GitHub Actions sin desplegar:
    .\deploy.ps1 -SoloSecretos

    # Despliegue sin verificación SSL:
    .\deploy.ps1 -NoVerifySsl
#>

[CmdletBinding()]
param(
    [string]$Region       = "us-east-1",
    [string]$Branch       = "feat/cloudinit",
    [string]$AdminPassword = "Admin1234",
    [string]$StackName    = "miasistencia-modular-stack",
    [switch]$SoloSecretos,
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

# ─────────────────────────────────────────────────────────────────────────────
# BLOQUE OPCIONAL: Inyectar secretos en GitHub Actions via gh CLI
# ─────────────────────────────────────────────────────────────────────────────
Write-Host ""
Write-Host "===========================================================" -ForegroundColor Magenta
Write-Host " PASO PREVIO (opcional): Subir secretos a GitHub Actions" -ForegroundColor Magenta
Write-Host "===========================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host " Los 3 secretos que necesita el workflow de GitHub Actions son:" -ForegroundColor White
Write-Host "   • AWS_ACCESS_KEY_ID      — Llave de acceso del usuario IAM" -ForegroundColor Gray
Write-Host "   • AWS_SECRET_ACCESS_KEY  — Llave secreta del usuario IAM" -ForegroundColor Gray
Write-Host "   • AWS_REGION             — Región de AWS (ej. us-east-1)" -ForegroundColor Gray
Write-Host ""
Write-Host " Sin estos 3 secretos configurados en:" -ForegroundColor Yellow
Write-Host "   GitHub → Settings → Secrets and variables → Actions" -ForegroundColor Yellow
Write-Host " el workflow de GitHub Actions NO podrá desplegar en AWS." -ForegroundColor Yellow
Write-Host ""

$inyectarSecretos = $false

# Verificar si gh CLI está instalado
$ghDisponible = Get-Command gh -ErrorAction SilentlyContinue

if (-not $ghDisponible) {
    Write-Host " [INFO] GitHub CLI (gh) no está instalado. Los secretos deberán configurarse manualmente." -ForegroundColor DarkYellow
    Write-Host " 👉 Para instalar gh: https://cli.github.com/" -ForegroundColor DarkYellow
    Write-Host "    Luego autentícate con: gh auth login" -ForegroundColor DarkYellow
    Write-Host ""
} else {
    # Verificar si está autenticado en gh
    $ghAuth = & gh auth status 2>&1
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [INFO] GitHub CLI instalado pero NO autenticado." -ForegroundColor DarkYellow
        Write-Host " 👉 Ejecuta primero: gh auth login" -ForegroundColor DarkYellow
        Write-Host ""
    } else {
        Write-Host " GitHub CLI detectado y autenticado ✔" -ForegroundColor Green
        Write-Host ""
        $respuesta = Read-Host " ¿Deseas inyectar (o actualizar) los 3 secretos en GitHub ahora? (s/N)"
        if ($respuesta -match "^[sS]$") {
            $inyectarSecretos = $true
        }
    }
}

if ($inyectarSecretos) {
    Write-Host ""
    Write-Host " Ingresa las credenciales AWS que se guardarán como secretos en GitHub:" -ForegroundColor Cyan
    Write-Host " (Las credenciales permanentes se obtienen en IAM → Usuarios → Credenciales de seguridad)" -ForegroundColor Gray
    Write-Host ""

    $keyId     = Read-Host " AWS_ACCESS_KEY_ID"
    $secretKey = Read-Host " AWS_SECRET_ACCESS_KEY"
    $awsRegion = Read-Host " AWS_REGION (Enter para usar '$Region')"

    if ([string]::IsNullOrWhiteSpace($awsRegion)) {
        $awsRegion = $Region
    }

    if ([string]::IsNullOrWhiteSpace($keyId) -or [string]::IsNullOrWhiteSpace($secretKey)) {
        Write-Host ""
        Write-Host " [ERROR] AWS_ACCESS_KEY_ID y AWS_SECRET_ACCESS_KEY no pueden estar vacíos." -ForegroundColor Red
        Write-Host " 👉 Obtén tus credenciales en: AWS Console → IAM → Usuarios → <tu_usuario> → Credenciales de seguridad → Crear clave de acceso" -ForegroundColor Yellow
        exit 1
    }

    Write-Host ""
    Write-Host " Inyectando secretos en el repositorio de GitHub..." -ForegroundColor Cyan

    # Inyectar los 3 secretos
    $keyId     | & gh secret set AWS_ACCESS_KEY_ID
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [ERROR] No se pudo inyectar AWS_ACCESS_KEY_ID." -ForegroundColor Red
        Write-Host " 👉 Asegúrate de estar en el directorio del repositorio y tener permisos de administrador en el repo de GitHub." -ForegroundColor Yellow
        exit 1
    }

    $secretKey | & gh secret set AWS_SECRET_ACCESS_KEY
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [ERROR] No se pudo inyectar AWS_SECRET_ACCESS_KEY." -ForegroundColor Red
        exit 1
    }

    $awsRegion | & gh secret set AWS_REGION
    if ($LASTEXITCODE -ne 0) {
        Write-Host " [ERROR] No se pudo inyectar AWS_REGION." -ForegroundColor Red
        exit 1
    }

    Write-Host ""
    Write-Host " ✔ Los 3 secretos fueron inyectados exitosamente en GitHub Actions:" -ForegroundColor Green
    Write-Host "   • AWS_ACCESS_KEY_ID      ✔" -ForegroundColor Green
    Write-Host "   • AWS_SECRET_ACCESS_KEY  ✔" -ForegroundColor Green
    Write-Host "   • AWS_REGION             ✔ ($awsRegion)" -ForegroundColor Green
    Write-Host ""
    Write-Host " Verifica en: https://github.com/$(& gh repo view --json nameWithOwner -q .nameWithOwner)/settings/secrets/actions" -ForegroundColor Cyan
    Write-Host ""

    # Si solo queríamos subir secretos, terminar aquí
    if ($SoloSecretos) {
        Write-Host " Modo -SoloSecretos: finalizado. No se desplegó infraestructura." -ForegroundColor Yellow
        exit 0
    }
}

if ($SoloSecretos -and -not $inyectarSecretos) {
    Write-Host " [AVISO] Se pidió -SoloSecretos pero no se inyectaron secretos (gh no disponible o no autenticado)." -ForegroundColor Yellow
    exit 1
}

Write-Host ""
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " Iniciando despliegue de infraestructura en AWS..." -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# ─────────────────────────────────────────────────────────────────────────────
# 1. Validar AWS CLI
# ─────────────────────────────────────────────────────────────────────────────
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR]: AWS CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    Write-Host "👉 Solución: Descarga e instala AWS CLI v2 desde:" -ForegroundColor Yellow
    Write-Host "   https://aws.amazon.com/cli/ y reinicia tu terminal PowerShell.`n" -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Validar credenciales activas
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "==> [1/5] Verificando credenciales e identidad de AWS..." -ForegroundColor Cyan
try {
    $callerJson = & aws @sslFlag sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId  = $callerJson.Account
    Write-Host "    Cuenta AWS activa: $accountId ($($callerJson.Arn))" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR]: No se detectaron credenciales válidas de AWS o expiraron." -ForegroundColor Red
    Write-Host "👉 Solución: Configura tus credenciales con:" -ForegroundColor Yellow
    Write-Host "   aws configure" -ForegroundColor Yellow
    Write-Host "   O exporta directamente en PowerShell:" -ForegroundColor Yellow
    Write-Host '   $env:AWS_ACCESS_KEY_ID     = "AKIA..."' -ForegroundColor Yellow
    Write-Host '   $env:AWS_SECRET_ACCESS_KEY = "..."' -ForegroundColor Yellow
    Write-Host '   $env:AWS_REGION            = "us-east-1"' -ForegroundColor Yellow
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 3. Bucket S3 por cuenta (creación automática)
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# 4. Detectar VPC y Subred default
# ─────────────────────────────────────────────────────────────────────────────
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

# ─────────────────────────────────────────────────────────────────────────────
# 5. Empaquetar módulos a S3
# ─────────────────────────────────────────────────────────────────────────────
$rootDir          = (Get-Item $PSScriptRoot).FullName
$mainTemplate     = Join-Path $rootDir "main.yaml"
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

# ─────────────────────────────────────────────────────────────────────────────
# 6. Desplegar Stack
# ─────────────────────────────────────────────────────────────────────────────
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

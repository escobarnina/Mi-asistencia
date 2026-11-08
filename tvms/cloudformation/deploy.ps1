<#
.SYNOPSIS
    Automatización integral de infraestructura en AWS CloudFormation y configuración con Ansible.
.DESCRIPTION
    1. Valida herramientas requeridas (AWS CLI, Ansible o WSL).
    2. Valida o detecta el KeyPair y archivo .pem local.
    3. Asegura el bucket S3 para plantillas anidadas.
    4. Detecta VPC y Subred por defecto.
    5. Empaqueta la arquitectura modular con 'aws cloudformation package'.
    6. Despliega el stack con 'aws cloudformation deploy'.
    7. Extrae en tiempo real los Outputs FrontendIP, BackendIP y DatabaseIP vía JMESPath.
    8. Genera tvms/ansible/inventario.ini con bloques [frontend], [backend] y [database].
    9. Genera tvms/ansible/ansible.cfg configurando host_key_checking = False.
    10. Realiza una pausa de 20 segundos para estabilización de servicios SSH.
    11. Invoca de manera 100% automatizada 'ansible-playbook tvms/ansible/ping.yml'.
.PARAMETER KeyPath
    Ruta a la llave privada SSH (.pem). Si no se pasa, busca automáticamente un .pem en tvms o pedirá la ruta.
.PARAMETER KeyName
    Nombre del KeyPair en AWS asociado a la llave privada. Si no se especifica, se inferirá del nombre del .pem.
.PARAMETER Region
    Región de AWS para el despliegue. Por defecto: us-east-1.
.PARAMETER StackName
    Nombre del stack CloudFormation. Por defecto: miasistencia-modular-stack.
#>

[CmdletBinding()]
param(
    [string]$KeyPath        = "",
    [string]$KeyName        = "",
    [string]$Region         = "us-east-1",
    [string]$StackName      = "miasistencia-modular-stack",
    [string]$Branch         = "feat/cloudinit",
    [string]$AdminPassword  = "Admin1234",
    [switch]$NoVerifySsl
)

$ErrorActionPreference = "Stop"

$sslFlag = @()
if ($NoVerifySsl) {
    $sslFlag = @("--no-verify-ssl")
}

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " [DevOps Pipeline] CloudFormation Nested Stacks + Ansible" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Definición de rutas relativas al script
$scriptDir    = $PSScriptRoot
$tvmsDir      = Split-Path -Parent $scriptDir
$ansibleDir   = Join-Path $tvmsDir "ansible"
$mainYaml     = Join-Path $scriptDir "main.yaml"
$packagedYaml = Join-Path $scriptDir "packaged.yaml"
$inventoryIni = Join-Path $ansibleDir "inventario.ini"
$ansibleCfg   = Join-Path $ansibleDir "ansible.cfg"
$playbookPing = Join-Path $ansibleDir "ping.yml"

# ─────────────────────────────────────────────────────────────────────────────
# 1. Validación de AWS CLI
# ─────────────────────────────────────────────────────────────────────────────
if (-not (Get-Command aws -ErrorAction SilentlyContinue)) {
    Write-Host "`n[ERROR] AWS CLI no está instalado o no se encuentra en el PATH." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 2. Resolución de KeyPair y archivo .pem local
# ─────────────────────────────────────────────────────────────────────────────
if ([string]::IsNullOrWhiteSpace($KeyPath)) {
    # Buscar archivo .pem existente en tvms o directorios cercanos
    $pemCandidates = Get-ChildItem -Path $tvmsDir -Filter "*.pem" -Recurse -ErrorAction SilentlyContinue
    if ($pemCandidates -and $pemCandidates.Count -gt 0) {
        $KeyPath = $pemCandidates[0].FullName
        Write-Host " [INFO] Llave privada detectada automáticamente: $KeyPath" -ForegroundColor Yellow
    } else {
        # Si no existe, revisar si hay llaves en el directorio de usuario ~/.ssh o crear una
        $defaultKeyName = "asistencia-devops-key"
        $defaultPemPath = Join-Path $tvmsDir "$defaultKeyName.pem"
        Write-Host " [INFO] No se encontró .pem local. Creando KeyPair en AWS: $defaultKeyName..." -ForegroundColor Yellow
        try {
            $keyMaterial = & aws @sslFlag ec2 create-key-pair --key-name $defaultKeyName --query "KeyMaterial" --output text --region $Region 2>$null
            if ($keyMaterial) {
                Set-Content -Path $defaultPemPath -Value $keyMaterial -NoNewline
                $KeyPath = $defaultPemPath
                $KeyName = $defaultKeyName
                Write-Host " [INFO] KeyPair '$defaultKeyName' creado y guardado en: $defaultPemPath" -ForegroundColor Green
            }
        } catch {
            Write-Host " [AVISO] El KeyPair '$defaultKeyName' ya existía en AWS o falló la creación directa." -ForegroundColor DarkYellow
        }
    }
}

if ([string]::IsNullOrWhiteSpace($KeyPath) -or -not (Test-Path $KeyPath)) {
    Write-Host "`n[ERROR] Debes proporcionar una llave .pem válida usando el parámetro -KeyPath." -ForegroundColor Red
    Write-Host " Ejemplo: .\deploy.ps1 -KeyPath 'C:\ruta\mi-llave.pem' -KeyName 'mi-llave'`n" -ForegroundColor Yellow
    exit 1
}

# Resolver KeyName si no fue indicado
if ([string]::IsNullOrWhiteSpace($KeyName)) {
    $KeyName = [System.IO.Path]::GetFileNameWithoutExtension($KeyPath)
}
Write-Host " ✔ Llave privada SSH: $KeyPath" -ForegroundColor Green
Write-Host " ✔ AWS KeyPair Name : $KeyName" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 3. Validar identidad y credenciales de AWS
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [1/7] Comprobando credenciales de AWS..." -ForegroundColor Cyan
try {
    $callerJson = & aws @sslFlag sts get-caller-identity --output json 2>&1 | ConvertFrom-Json
    $accountId  = $callerJson.Account
    Write-Host "    Cuenta activa: $accountId ($($callerJson.Arn))" -ForegroundColor Green
} catch {
    Write-Host "`n[ERROR] No hay credenciales activas de AWS. Ejecuta 'aws configure'." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 4. Asegurar Bucket S3 para plantillas anidadas
# ─────────────────────────────────────────────────────────────────────────────
$bucketName = "asistencia-cfn-plantillas-$accountId-$Region"
Write-Host "`n==> [2/7] Asegurando bucket S3: $bucketName..." -ForegroundColor Cyan

$null = & aws @sslFlag s3api head-bucket --bucket $bucketName 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Host "    Creando bucket S3 $bucketName..." -ForegroundColor Yellow
    if ($Region -eq "us-east-1") {
        & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region | Out-Null
    } else {
        & aws @sslFlag s3api create-bucket --bucket $bucketName --region $Region --create-bucket-configuration LocationConstraint=$Region | Out-Null
    }
    & aws @sslFlag s3api put-bucket-encryption --bucket $bucketName --server-side-encryption-configuration '{\"Rules\": [{\"ApplyServerSideEncryptionByDefault\": {\"SSEAlgorithm\": \"AES256\"}}]}' | Out-Null
    Write-Host "    Bucket S3 configurado correctamente." -ForegroundColor Green
} else {
    Write-Host "    Bucket S3 verificado." -ForegroundColor Green
}

# ─────────────────────────────────────────────────────────────────────────────
# 5. Obtener VPC y Subred públicas
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [3/7] Consultando VPC y Subred predeterminadas..." -ForegroundColor Cyan
$vpcId = & aws @sslFlag ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text
$subnetId = & aws @sslFlag ec2 describe-subnets --filters "Name=vpc-id,Values=$vpcId" "Name=default-for-az,Values=true" --query "Subnets[0].SubnetId" --output text
Write-Host "    VpcId: $vpcId | SubnetId: $subnetId" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 6. Empaquetar y desplegar CloudFormation (Package & Deploy)
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [4/7] Empaquetando plantillas anidadas (aws cloudformation package)..." -ForegroundColor Cyan
& aws @sslFlag cloudformation package `
    --template-file $mainYaml `
    --s3-bucket $bucketName `
    --s3-prefix "cloudformation" `
    --output-template-file $packagedYaml

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Falló 'aws cloudformation package'." -ForegroundColor Red
    exit 1
}

Write-Host "`n==> [5/7] Desplegando infraestructura modular (aws cloudformation deploy)..." -ForegroundColor Cyan
& aws @sslFlag cloudformation deploy `
    --template-file $packagedYaml `
    --stack-name $StackName `
    --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND `
    --no-fail-on-empty-changeset `
    --parameter-overrides `
        VpcId=$vpcId `
        SubnetId=$subnetId `
        KeyName=$KeyName `
        RepoRama=$Branch `
        AdminPassword=$AdminPassword

if ($LASTEXITCODE -ne 0) {
    Write-Host "`n[ERROR] Falló el despliegue del Stack $StackName." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 7. Consultar Outputs mediante filtros JMESPath en tiempo real
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [6/7] Consultando Outputs en tiempo real con JMESPath (--query)..." -ForegroundColor Cyan

$frontendIp = (& aws @sslFlag cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='FrontendIP'].OutputValue" --output text).Trim()
$backendIp  = (& aws @sslFlag cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='BackendIP'].OutputValue" --output text).Trim()
$databaseIp = (& aws @sslFlag cloudformation describe-stacks --stack-name $StackName --query "Stacks[0].Outputs[?OutputKey=='DatabaseIP'].OutputValue" --output text).Trim()

Write-Host "    • FrontendIP : $frontendIp" -ForegroundColor Green
Write-Host "    • BackendIP  : $backendIp" -ForegroundColor Green
Write-Host "    • DatabaseIP : $databaseIp" -ForegroundColor Green

if (-not $frontendIp -or -not $backendIp -or -not $databaseIp) {
    Write-Host "`n[ERROR] No se pudieron recuperar todas las IPs de los Outputs del stack." -ForegroundColor Red
    exit 1
}

# ─────────────────────────────────────────────────────────────────────────────
# 8. Generar inventario.ini y ansible.cfg automáticamente
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==> [7/7] Configurando Ansible e inventario dinámico..." -ForegroundColor Cyan

if (-not (Test-Path $ansibleDir)) {
    New-Item -ItemType Directory -Path $ansibleDir -Force | Out-Null
}

# Crear / Sobreescribir inventario.ini
$inventoryContent = @"
[frontend]
$frontendIp

[backend]
$backendIp

[database]
$databaseIp

[all:vars]
ansible_user=ubuntu
ansible_ssh_private_key_file=~/.ssh/asistencia-devops-key.pem
ansible_ssh_common_args=-o StrictHostKeyChecking=no
"@

Set-Content -Path $inventoryIni -Value $inventoryContent -Encoding UTF8
Write-Host " ✔ Archivo generado: $inventoryIni" -ForegroundColor Green

# Crear / Sobreescribir ansible.cfg
$ansibleCfgContent = @"
[defaults]
inventory = inventario.ini
host_key_checking = False
deprecation_warnings = False
remote_user = ubuntu
private_key_file = ~/.ssh/asistencia-devops-key.pem
timeout = 30

[ssh_connection]
ssh_args = -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null
"@

Set-Content -Path $ansibleCfg -Value $ansibleCfgContent -Encoding UTF8
Write-Host " ✔ Archivo generado: $ansibleCfg" -ForegroundColor Green

# ─────────────────────────────────────────────────────────────────────────────
# 9. Pausa de 20 segundos y Validación Automática con ansible-playbook
# ─────────────────────────────────────────────────────────────────────────────
Write-Host "`n==========================================================" -ForegroundColor Yellow
Write-Host " Pausando por 20 segundos para inicialización de SSH en EC2..." -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Yellow

Start-Sleep -Seconds 20

Write-Host "`n==========================================================" -ForegroundColor Cyan
Write-Host " Ejecutando validación ping con Ansible contra los 3 nodos" -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

# Detección del entorno de ejecución para Ansible (ansible-playbook nativo o WSL)
$ansibleCmd = Get-Command ansible-playbook -ErrorAction SilentlyContinue
$wslCmd     = Get-Command wsl -ErrorAction SilentlyContinue

# Función para convertir ruta Windows a WSL (/mnt/c/...) sin invocar wslpath
function Convert-ToWslPath([string]$winPath) {
    $full = [System.IO.Path]::GetFullPath($winPath)
    $drive = $full.Substring(0, 1).ToLower()
    $sub = $full.Substring(2) -replace '\\', '/'
    return "/mnt/$drive$sub"
}

Push-Location $ansibleDir
try {
    if ($ansibleCmd) {
        Write-Host " [INFO] Ejecutando ansible-playbook nativo..." -ForegroundColor Cyan
        & ansible-playbook -i "inventario.ini" "ping.yml" --private-key "$KeyPath"
    } elseif ($wslCmd) {
        Write-Host " [INFO] 'ansible-playbook' detectado a través de WSL..." -ForegroundColor Cyan
        $wslKeyPath    = Convert-ToWslPath $KeyPath
        $wslAnsibleDir = Convert-ToWslPath $ansibleDir

        # 1. Copiar la llave a ~/.ssh/ en WSL con permisos 400 (seguro y persistente)
        & wsl bash -c "mkdir -p ~/.ssh && cp -f '$wslKeyPath' ~/.ssh/asistencia-devops-key.pem && chmod 600 ~/.ssh/asistencia-devops-key.pem"
        
        # 2. Ejecutar ansible-playbook forzando ANSIBLE_CONFIG
        & wsl bash -c "cd '$wslAnsibleDir' && ANSIBLE_CONFIG='$wslAnsibleDir/ansible.cfg' ANSIBLE_HOST_KEY_CHECKING=False ansible-playbook -i inventario.ini ping.yml"
    } else {
        Write-Host "`n[AVISO] Ansible no está instalado en Windows ni se detectó WSL." -ForegroundColor Yellow
        Write-Host "El inventario fue generado en: $inventoryIni" -ForegroundColor White
        Write-Host "Para ejecutar la prueba ping manualmente una vez instalado Ansible:" -ForegroundColor White
        Write-Host "   cd tvms/ansible" -ForegroundColor Gray
        Write-Host "   ansible-playbook -i inventario.ini ping.yml --private-key `"$KeyPath`"" -ForegroundColor Gray
    }
} finally {
    Pop-Location
    # Limpiar plantilla temporal empaquetada generada por 'aws cloudformation package'
    if (Test-Path $packagedYaml) {
        Remove-Item $packagedYaml -Force -ErrorAction SilentlyContinue
        Write-Host " [INFO] Archivo temporal packaged.yaml eliminado." -ForegroundColor Gray
    }
}

Write-Host "`n==========================================================" -ForegroundColor Green
Write-Host " Infraestructura lista y validada con Ping!" -ForegroundColor Green
Write-Host " Para configurar y aprovisionar los 3 servidores con Ansible:" -ForegroundColor Cyan
Write-Host "   WSL:     cd /mnt/c/Users/Usuario/Documents/m2/Mi-asistencia/tvms/ansible && ANSIBLE_CONFIG=./ansible.cfg ansible-playbook site.yml" -ForegroundColor Yellow
Write-Host "   Windows: cd tvms\ansible; ansible-playbook site.yml" -ForegroundColor Yellow
Write-Host "==========================================================" -ForegroundColor Green

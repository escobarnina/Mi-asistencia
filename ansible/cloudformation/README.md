# Despliegue con AWS CloudFormation Modular — Sistema de Asistencia

Infraestructura como Código (IaC) modular y reproducible con **AWS CloudFormation**, replicando exactamente la arquitectura de **OpenTofu** y **Pulumi**.

---

## 📁 Estructura del Directorio

```text
cloudinit/cloudformation/
├── cloud-init.yaml             # Archivo base de cloud-config compartido (paridad con OpenTofu y Pulumi)
├── main.yaml                   # Plantilla principal orquestadora (Stacks anidados)
├── deploy.ps1                  # Script PowerShell de auto-aprovisionamiento y despliegue
├── destroy.ps1                 # Script PowerShell para eliminar el stack y recursos
├── modules/
│   ├── security.yaml           # Security Groups (Backend SG y Frontend SG)
│   ├── backend.yaml            # VM Backend (Node.js 20 + MariaDB + init.sql + systemd)
│   └── frontend.yaml           # VM Frontend (React/Vite + Nginx reverse proxy + systemd)
└── README.md                   # Esta guía
```

---

## 🔑 Requisito Previo: Los 3 Secretos de AWS

Para que el workflow de **GitHub Actions** pueda desplegar en AWS, el repositorio necesita **3 secretos** configurados:

| Secreto | Descripción |
|---|---|
| `AWS_ACCESS_KEY_ID` | Llave de acceso del usuario IAM |
| `AWS_SECRET_ACCESS_KEY` | Llave secreta del usuario IAM |
| `AWS_REGION` | Región de AWS (ej. `us-east-1`) |

> [!IMPORTANT]
> Sin estos 3 secretos el workflow de GitHub Actions fallará. Los secretos son **permanentes** (no expiran como las credenciales de AWS Academy). Obtenlos en: **AWS Console → IAM → Usuarios → `<tu_usuario>` → Credenciales de seguridad → Crear clave de acceso**.

### Opción A: Inyectar via `deploy.ps1` con GitHub CLI (Recomendado)

El script `deploy.ps1` detecta automáticamente si tienes `gh` instalado y te ofrece inyectar los secretos sin tener que ir a la interfaz web de GitHub:

```powershell
cd cloudinit\cloudformation

# Modo A — Pasar credenciales directo como parámetros (no-interactivo, RECOMENDADO):
.\deploy.ps1 -AwsKeyId "AKIA..." -AwsSecretKey "wJalr..." -AwsRegionSecret "us-east-1"

# Modo B — Solo subir secretos sin desplegar infraestructura:
.\deploy.ps1 -SoloSecretos -AwsKeyId "AKIA..." -AwsSecretKey "wJalr..."

# Modo C — Interactivo (el script pregunta y pide los valores uno a uno):
.\deploy.ps1
# Cuando pregunte "Deseas inyectar los 3 secretos?" responde "s"
```

El script sube los 3 secretos usando `gh secret set`. Al finalizar muestra el enlace directo a `Settings → Secrets` del repositorio para verificarlos.

**Requisitos para esta opción:**
1. Tener [GitHub CLI](https://cli.github.com/) instalado.
2. Estar autenticado: ejecuta `gh auth login` si aún no lo has hecho.
3. Tener permisos de **administrador** en el repositorio de GitHub.

### Opción B: Configurar manualmente en GitHub (Alternativa)

Si no tienes `gh` instalado, ve directamente a:

```
https://github.com/escobarnina/Mi-asistencia/settings/secrets/actions
```

Haz clic en **"New repository secret"** y agrega los 3 secretos uno a uno:

```
AWS_ACCESS_KEY_ID      →  AKIA...
AWS_SECRET_ACCESS_KEY  →  wJalr...
AWS_REGION             →  us-east-1
```

---

## 🚀 Cómo Correr el Despliegue

### Opción 1: Despliegue Local con PowerShell (Recomendado)

El script `deploy.ps1` automatiza todo el proceso en 5 pasos:

```powershell
cd cloudinit\cloudformation
.\deploy.ps1
```

*(Opcional) Puedes personalizar parámetros:*
```powershell
.\deploy.ps1 -Branch "feat/cloudinit" -AdminPassword "TuPasswordSeguro123"
```

*(Si tu red corporativa, proxy o antivirus causa error SSL con AWS CLI):*
```powershell
.\deploy.ps1 -NoVerifySsl
```

El script se encargará automáticamente de:
1. Ofrecerte inyectar los 3 secretos en GitHub via `gh` (si está disponible).
2. Identificar tu cuenta de AWS y validar credenciales.
3. Crear el bucket S3 de plantillas si no existía.
4. Detectar tu VPC y Subred pública por defecto.
5. Ejecutar `aws cloudformation package` convirtiendo rutas relativas a URLs de S3.
6. Ejecutar `aws cloudformation deploy` y mostrar la tabla final con las IPs/URLs del Frontend y Backend.

---

### Opción 2: Despliegue Manual Paso a Paso (AWS CLI / Bash)

Si deseas ejecutar los comandos uno a uno manualmente:

1. **Obtener tu Account ID y definir variables:**
   ```bash
   ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
   REGION="us-east-1"
   BUCKET_NAME="asistencia-cfn-plantillas-${ACCOUNT_ID}-${REGION}"
   ```

2. **Crear el bucket S3 (solo la primera vez):**
   ```bash
   aws s3 mb "s3://${BUCKET_NAME}" --region "$REGION"
   ```

3. **Obtener VPC y Subred por defecto:**
   ```bash
   VPC_ID=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query "Vpcs[0].VpcId" --output text)
   SUBNET_ID=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$VPC_ID" "Name=default-for-az,Values=true" --query "Subnets[0].SubnetId" --output text)
   ```

4. **Empaquetar módulos a S3 (`package`):**
   ```bash
   aws cloudformation package \
     --template-file cloudinit/cloudformation/main.yaml \
     --s3-bucket "$BUCKET_NAME" \
     --s3-prefix "cloudformation" \
     --output-template-file cloudinit/cloudformation/packaged.yaml
   ```

5. **Desplegar el Stack (`deploy`):**
   ```bash
   aws cloudformation deploy \
     --template-file cloudinit/cloudformation/packaged.yaml \
     --stack-name miasistencia-modular-stack \
     --capabilities CAPABILITY_IAM CAPABILITY_AUTO_EXPAND \
     --no-fail-on-empty-changeset \
     --parameter-overrides \
         VpcId="$VPC_ID" \
         SubnetId="$SUBNET_ID" \
         RepoRama="feat/cloudinit" \
         AdminPassword="Admin1234"
   ```

6. **Consultar Outputs (URLs de acceso):**
   ```bash
   aws cloudformation describe-stacks \
     --stack-name miasistencia-modular-stack \
     --query "Stacks[0].Outputs" \
     --output table
   ```

---

## 🔐 Acceso a la Aplicación

Una vez finalizado el despliegue:

* **Frontend:** Abre en tu navegador la URL devuelta en `FrontendUrl` (puerto 80).
* **Backend Healthcheck:** Abre en tu navegador la URL devuelta en `BackendApiUrl` con `/api/health`.
* **Credenciales de inicio de sesión:**
  - **Estudiante:** Código de registro `220001`
  - **Administrador:** Correo `admin@ejemplo.com` | Contraseña `Admin1234` (o la configurada en `AdminPassword`).

---

## 🧹 Limpieza y Destrucción de Recursos

### Opción 1: Con el script interactivo (Recomendado)

```powershell
cd cloudinit\cloudformation
.\destroy.ps1
```

*(Opcional: puedes eliminar también el bucket S3 de plantillas o forzar sin confirmación)*:
```powershell
.\destroy.ps1 -Force -DeleteBucket
```

El script se encargará automáticamente de:
1. Comprobar que el stack exista.
2. Solicitar confirmación interactiva de seguridad.
3. Ejecutar la eliminación en AWS y esperar hasta que termine (`wait stack-delete-complete`).
4. (Opcional) Vaciar y borrar el bucket S3 temporal de plantillas.

---

### Opción 2: Con comandos manuales de AWS CLI

```powershell
aws cloudformation delete-stack --stack-name miasistencia-modular-stack
```

*(Opcional: Si deseas eliminar también el bucket S3 temporal de plantillas)*:
```powershell
aws s3 rb s3://asistencia-cfn-plantillas-<tu-account-id>-us-east-1 --force
```

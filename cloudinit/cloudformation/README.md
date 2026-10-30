# Despliegue con AWS CloudFormation Modular — Sistema de Asistencia

Infraestructura como Código (IaC) modular y reproducible con **AWS CloudFormation**, replicando exactamente la arquitectura de **OpenTofu** y **Pulumi**.

---

## 📁 Estructura del Directorio

```text
cloudinit/cloudformation/
├── cloud-init.yaml             # Archivo base de cloud-config compartido (paridad con OpenTofu y Pulumi)
├── main.yaml                   # Plantilla principal orquestadora (Stacks anidados)
├── deploy.ps1                  # Script PowerShell de auto-aprovisionamiento y despliegue
├── modules/
│   ├── security.yaml           # Security Groups (Backend SG y Frontend SG)
│   ├── backend.yaml            # VM Backend (Node.js 20 + MariaDB + init.sql + systemd)
│   └── frontend.yaml           # VM Frontend (React/Vite + Nginx reverse proxy + systemd)
└── README.md                   # Esta guía
```

---


3. **AMI Dinámica y KeyPair Automático**:
   - Resuelve Ubuntu Server 24.04 LTS en cualquier región mediante SSM Parameter Store.
   - Genera el par de llaves SSH directamente en AWS vía CloudFormation (`AWS::EC2::KeyPair`).

4. **Compatibilidad con Pull Requests en `feat/cloudinit`**:
   - El pipeline en GitHub Actions ejecuta `cfn-lint` en los PRs sin requerir credenciales de AWS.
   - Al hacer push/merge en `feat/cloudinit` o `main`, se empaqueta y despliega automáticamente.

---

## 🚀 Cómo Correr el Despliegue

### Opción 1: Despliegue Local con PowerShell (Recomendado)

El script `deploy.ps1` automatiza todo el proceso:

1. Abre tu terminal PowerShell y entra a la carpeta:
   ```powershell
   cd cloudinit\cloudformation
   ```

2. Ejecuta el script:
   ```powershell
   .\deploy.ps1
   ```

   *(Opcional) Puedes personalizar parámetros:*
   ```powershell
   .\deploy.ps1 -Branch "feat/cloudinit" -AdminPassword "TuPasswordSeguro123"
   ```

   *(Si tu red corporativa, proxy o antivirus causa error de validación SSL con AWS CLI):*
   ```powershell
   .\deploy.ps1 -Branch "feat/cloudinit" -NoVerifySsl
   ```

El script se encargará automáticamente de:
- Identificar tu cuenta de AWS.
- Crear el bucket S3 si no existía.
- Detectar tu VPC y Subred pública por defecto.
- Ejecutar `aws cloudformation package` convirtiendo rutas relativas a URLs de S3.
- Ejecutar `aws cloudformation deploy` y mostrar la tabla final con las IPs y URLs del Frontend y Backend.

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

Para eliminar todos los recursos creados en AWS y no incurrir en costos:

```powershell
aws cloudformation delete-stack --stack-name miasistencia-modular-stack
```

*(Opcional: Si deseas eliminar también el bucket S3 temporal de plantillas):*
```powershell
aws s3 rb s3://asistencia-cfn-plantillas-<tu-account-id>-us-east-1 --force
```

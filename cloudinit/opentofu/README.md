# Módulo v2: Infraestructura como Código (IaC)

Este directorio contiene las implementaciones de IaC organizadas por herramientas y nubes, incluyendo la gestión de estado remoto en AWS S3 + DynamoDB con soporte multi-cuenta y el despliegue con Pulumi en Python.

---

## Estructura del Directorio

```text
v2/
├── bootstrap/               # Aprovisionamiento inicial del almacenamiento de estado remoto
│   ├── aws/                 # S3 Bucket + DynamoDB + Rol IAM para Terraform/OpenTofu
│   └── azure/               # Storage Account + Contenedor de referencia en Azure
├── aws/                     # Despliegue de la aplicación (EC2, VPC, SG) con OpenTofu / Terraform
│   ├── backend.tf           # Definición abstracta del backend S3 (limpio, sin secretos)
│   ├── backend.hcl.example  # Plantilla de configuración del backend (SÍ va a GitHub)
│   ├── backend.hcl          # Valores reales del backend remoto (IGNORADO por Git)
│   ├── main.tf              # Definición de recursos EC2 (backend y frontend) + auto-start
│   ├── variables.tf         # Declaración de variables
│   ├── outputs.tf           # Salidas (IPs públicas, comandos SSH, URLs)
│   ├── versions.tf          # Versiones y configuración del provider AWS (assume_role)
│   ├── scripts/             # Scripts user_data para aprovisionar las VMs
│   ├── terraform.tfvars.example  # Plantilla de variables para la app (SÍ va a GitHub)
│   └── terraform.tfvars     # Variables locales con contraseñas (IGNORADO por Git)
├── pulumi/                  # Despliegue alternativo con Pulumi (Python)
│   ├── Pulumi.yaml          # Metadatos del proyecto Pulumi
│   ├── Pulumi.dev.yaml      # Parámetros del stack 'dev'
│   ├── __main__.py          # Código Python para desplegar una única instancia EC2
│   ├── requirements.txt     # Dependencias de Python
│   └── README.md            # Guía detallada de uso con Pulumi
└── README.md                # Esta guía general
```

---

## 1. Módulo `v2/bootstrap/aws` (Ejecutar UNA SOLA VEZ en la cuenta creadora)

Crea la infraestructura de soporte para el estado remoto y la colaboración en equipo:
- **Bucket S3:** Almacena de forma centralizada el `.tfstate` con versionado y cifrado AES256.
- **Tabla DynamoDB:** Gestiona el *State Locking* para evitar colisiones entre colaboradores.
- **Rol IAM (`RolTerraformColaborador`):** Permite que colaboradores de otras cuentas AWS administren los recursos sin exponer credenciales fijas.

### Pasos:
1. Copia la plantilla y define tus valores:
   ```bash
   cd v2/bootstrap/aws
   cp terraform.tfvars.example terraform.tfvars
   ```
2. En `terraform.tfvars` define el nombre del bucket, tabla y los Account IDs de los colaboradores:
   ```hcl
   region        = "us-east-1"
   nombre_bucket = "asistencia-tfstate-85htnsfx"
   nombre_tabla  = "asistencia-tfstate-locks"

   cuentas_colaboradores = [
     "838115390516"  # Account ID de los compañeros autorizados
   ]
   ```
3. Inicializa y aplica:
   ```bash
   tofu init
   tofu apply
   ```

Al terminar con éxito, `tofu apply` mostrará los **Outputs** que usaremos para configurar el backend:

```text
Outputs:
dynamodb_table_name = "asistencia-tfstate-locks"
region              = "us-east-1"
role_arn            = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
s3_bucket_name      = "asistencia-tfstate-85htnsfx"
```

---

## 2. Módulo `v2/aws` (Despliegue de la Aplicación)

### ¿Cómo funciona `backend.tf` ahora? (Configuración Parcial Limpia)

Para **no subir a GitHub** nombres de buckets, tablas ni Account IDs privados de AWS, usamos la técnica de **Configuración Parcial (*Partial Backend Configuration*)**:

1. En el repositorio, [`v2/aws/backend.tf`](aws/backend.tf) se mantiene **completamente limpio** y sin datos sensibles:
   ```hcl
   terraform {
     backend "s3" {
     }
   }
   ```
   *Este archivo SÍ se sube a GitHub sin riesgo.*

2. Los datos reales generados por el bootstrap se guardan localmente en **`v2/aws/backend.hcl`** (protegido por `.gitignore`, nunca se sube a GitHub):
   ```hcl
   bucket         = "asistencia-tfstate-85htnsfx"
   key            = "mi-asistencia/dev/terraform.tfstate"
   region         = "us-east-1"
   dynamodb_table = "asistencia-tfstate-locks"
   encrypt        = true
   role_arn       = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
   ```

| Parámetro en `backend.hcl` | ¿De dónde se saca el valor? | Descripción |
| :--- | :--- | :--- |
| `bucket` | Output `s3_bucket_name` del bootstrap | Nombre del bucket S3 donde reside el `.tfstate`. |
| `key` | Ruta fija dentro de S3 | `"mi-asistencia/dev/terraform.tfstate"` |
| `region` | Output `region` del bootstrap | `"us-east-1"` |
| `dynamodb_table` | Output `dynamodb_table_name` del bootstrap | Tabla que gestiona el lock automático. |
| `encrypt` | `true` | Cifrado AES256 forzoso en S3. |
| `role_arn` | Output `role_arn` del bootstrap | ARN del rol que deben asumir todos los colaboradores. |

> **Nota sobre `role_arn`:** El ARN del rol **SIEMPRE lleva el Account ID de la cuenta dueña/creadora** (en este ejemplo `168692730615`). Ningún colaborador debe cambiar ese número por el suyo, porque el rol y los recursos residen en la cuenta dueña.

---

### ¿Cómo inicializar la PRIMERA VEZ (o un nuevo compañero)?

Cada vez que se clona el proyecto por primera vez (o si cambia el backend):

1. **Crear tu archivo de backend local:**
   ```powershell
   cd v2\aws
   cp backend.hcl.example backend.hcl
   ```
   *Edita `backend.hcl` y pon los valores del bootstrap (o pídeselos al creador del proyecto).*

2. **Crear tu archivo de variables locales:**
   ```powershell
   cp terraform.tfvars.example terraform.tfvars
   ```
   *Edita `terraform.tfvars` y define tu contraseña `admin_password` y tu IP pública `mi_ip`.*

3. **Inicializar conectando con el backend remoto:**
   ```powershell
   tofu init -backend-config="backend.hcl"
   ```
   *(Si vienes de una configuración previa o da aviso de cambios, usa: `tofu init -backend-config="backend.hcl" -reconfigure`).*

   Verás el mensaje de confirmación:
   > `Successfully configured the backend "s3"! OpenTofu will automatically use this backend...`

---

### Flujo de trabajo en el DÍA A DÍA

Una vez inicializado, **ya NO necesitas pasar `-backend-config`** en cada comando:

```powershell
# Ver cambios sin tocar la nube
tofu plan

# Aplicar cambios en AWS
tofu apply

# Ver IPs y datos de acceso generados
tofu output
```

---

### Comportamiento Automático de las Instancias EC2

El archivo `main.tf` incluye protecciones avanzadas para evitar reconstrucciones no deseadas:

1. **Auto-encendido si están `Stopped`:**
   Gracias a los recursos `aws_ec2_instance_state`, si las máquinas fueron apagadas manualmente en la consola de AWS, al ejecutar `tofu apply` OpenTofu detectará que deben estar encendidas y las **iniciará (`running`) en segundos sin destruirlas**.
2. **Protección de IP pública (`ignore_changes`):**
   Las instancias tienen configurado `ignore_changes = [associate_public_ip_address]`. Cuando una máquina se detiene en AWS, pierde temporalmente su IP pública; esta regla impide que OpenTofu intente recrear/destruir la máquina por ese motivo.

---

## 3. Guía de Destrucción (`tofu destroy`) y Permisos

Para apagar recursos y evitar costos cuando el proyecto no esté en uso:

### A. Destruir la aplicación (`v2/aws`)

- **¿Qué borra?** Las máquinas virtuales EC2 (backend y frontend), Security Groups, pares de llaves SSH y reglas de red.
- **¿Quién puede ejecutarlo?** **CUALQUIERA** del equipo: el creador o cualquier colaborador externo que tenga permisos sobre el rol.
- **Comando:**
  ```powershell
  cd v2\aws
  tofu destroy
  ```
- **Resultado:** Las máquinas se eliminan en AWS y el `.tfstate` remoto en S3 queda limpio. El bucket S3 y DynamoDB **siguen existiendo** listos para el próximo despliegue.

---

### B. Destruir la infraestructura base (`v2/bootstrap/aws`)

- **¿Qué borra?** El Bucket S3 que almacena el `.tfstate`, la tabla DynamoDB y el Rol IAM `RolTerraformColaborador`.
- **¿Quién puede ejecutarlo?** **ÚNICAMENTE EL CREADOR / DUEÑO** de la cuenta central desde su propia máquina con credenciales directas.
  > ⚠️ **Los colaboradores externos NO pueden borrar el bootstrap:** Dará error `403 AccessDenied` porque el estado del bootstrap es local de la cuenta creadora.
- **Pasos:**
  1. En [`v2/bootstrap/aws/main.tf`](bootstrap/aws/main.tf), cambiar:
     ```hcl
     resource "aws_s3_bucket" "tfstate" {
       bucket        = var.nombre_bucket
       force_destroy = true    # Vacía los archivos dentro del bucket

       lifecycle {
         prevent_destroy = false  # Permite que se pueda destruir
       }
     }
     ```
  2. Ejecutar desde la cuenta dueña:
     ```powershell
     cd v2\bootstrap\aws
     tofu destroy
     ```

---

## 4. Módulo `v2/pulumi` (Despliegue con Python)

Despliega una única instancia EC2 en AWS utilizando Infrastructure as Code nativa en Python con Pulumi:

1. Entra a la carpeta y activa el entorno virtual:
   ```powershell
   cd v2\pulumi
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Previsualiza y despliega:
   ```powershell
   pulumi stack select dev --create
   pulumi up
   ```
3. Destruir la infraestructura de Pulumi:
   ```powershell
   pulumi destroy
   ```


---

## 5. Aprovisionamiento con Cloud-Init Unificado (`cloud-init.yaml`)

Se utiliza una única plantilla parametrizada `cloudinit/opentofu/aws/cloud-init.yaml` que aprovisiona las **2 máquinas virtuales EC2** de forma limpia utilizando directivas condicionales `%{ if rol == "backend" }` y `%{ if rol == "frontend" }`:

### A. VM Backend (`rol = "backend"`)
- **Paquetes:** Node.js 20 LTS, MariaDB Server, Git, Swap de 1GB.
- **Base de datos:** Inicializa MariaDB, crea usuario y carga el esquema y datos iniciales desde `backend/init.sql` o vía migraciones Sequelize.
- **Servicio Systemd:** Crea y activa `asistencia-backend.service` (Node.js en puerto 8000) con autoreinicio.
- **Seguridad:** MariaDB escucha solo localmente (`127.0.0.1`), la API expone el puerto 8000 para el frontend.

### B. VM Frontend (`rol = "frontend"`)
- **Paquetes:** Nginx, Node.js 20 (para compilar la SPA de React con Vite), Git, Swap de 2GB.
- **Compilación:** Ejecuta `npm ci` y `npm run build` dentro de la carpeta `frontend/`.
- **Nginx Reverse Proxy:** Sirve los estáticos en el puerto 80 y reenvía `/api/` a la IP privada de la VM Backend (`http://${backend_ip}:8000`), manteniendo la comunicación segura dentro de la VPC.

### Salidas principales de OpenTofu:
- `url_frontend`: URL pública en el puerto 80 para acceder a la aplicación web.
- `url_backend_health`: Endpoint de salud `http://<IP_BACKEND>:8000/api/health`.
- `ssh_frontend` y `ssh_backend`: Comandos de conexión SSH independientes.


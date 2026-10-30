# OpenTofu / Terraform — Infraestructura con Cloud-Init

Este directorio contiene las implementaciones de IaC con **OpenTofu / Terraform** organizadas de forma limpia, incluyendo la gestión de estado remoto en AWS S3 + DynamoDB con soporte multi-cuenta y el aprovisionamiento automatizado mediante **Cloud-Init**.

---

## 📁 Estructura del Directorio

```text
cloudinit/
├── opentofu/
│   ├── bootstrap/                   # Aprovisionamiento del backend remoto (S3 + DynamoDB)
│   │   ├── main.tf                  # Bucket S3 + DynamoDB Lock + Rol IAM
│   │   ├── variables.tf             # Parámetros del bootstrap
│   │   ├── outputs.tf               # Datos exportados (Bucket, DynamoDB, Rol)
│   │   ├── terraform.tfvars.example # Plantilla de variables (SÍ va a GitHub)
│   │   └── terraform.tfvars         # Variables con tus datos de cuenta (IGNORADO por Git)
│   ├── aws/                         # Despliegue de la aplicación (2 EC2s con Cloud-Init)
│   │   ├── backend.tf               # Declaración limpia del backend S3 (sin credenciales)
│   │   ├── backend.hcl.example      # Plantilla de conexión al backend remoto (SÍ va a GitHub)
│   │   ├── backend.hcl              # Configuración real generada (IGNORADO por Git)
│   │   ├── cloud-init.yaml          # Script Cloud-Init unificado (Backend + Frontend)
│   │   ├── main.tf                  # Recursos EC2, VPC, Security Groups y auto-encendido
│   │   ├── variables.tf             # Declaración de variables
│   │   ├── outputs.tf               # Salidas (IPs, URLs, comandos SSH)
│   │   ├── versions.tf              # Configuración de proveedores (assume_role)
│   │   ├── terraform.tfvars.example # Plantilla de variables de la app (SÍ va a GitHub)
│   │   └── terraform.tfvars         # Variables locales de la app (IGNORADO por Git)
│   └── README.md                    # Esta guía
├── pulumi/                          # Despliegue alternativo con Pulumi en Python
└── cloudformation/                  # Despliegue alternativo con AWS CloudFormation
```

---

## 1. Módulo `cloudinit/opentofu/bootstrap` (Ejecutar UNA SOLA VEZ en la cuenta dueña)

Crea la infraestructura de soporte para el estado remoto y la colaboración en equipo:
- **Bucket S3:** Almacena de forma centralizada el `.tfstate` con versionado y cifrado AES256.
- **Tabla DynamoDB:** Gestiona el *State Locking* para evitar colisiones entre colaboradores.
- **Rol IAM (`RolTerraformColaborador`):** Permite que colaboradores de otras cuentas AWS administren los recursos sin exponer credenciales fijas.

### Pasos:
1. Copia la plantilla y define tus valores:
   ```bash
   cd cloudinit/opentofu/bootstrap
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

Al terminar con éxito, `tofu apply` genera automáticamente `backend.hcl` y `terraform.tfvars` dentro de `cloudinit/opentofu/aws/`.

---

## 2. Módulo `cloudinit/opentofu/aws` (Despliegue de la Aplicación)

### ¿Cómo funciona `backend.tf`? (Configuración Parcial Limpia)

Para **no subir a GitHub** nombres de buckets, tablas ni Account IDs privados de AWS, usamos la técnica de **Configuración Parcial (*Partial Backend Configuration*)**:

1. En el repositorio, [`cloudinit/opentofu/aws/backend.tf`](aws/backend.tf) se mantiene **completamente limpio**:
   ```hcl
   terraform {
     backend "s3" {
     }
   }
   ```
   *Este archivo SÍ se sube a GitHub sin riesgo.*

2. Los datos reales generados por el bootstrap se guardan localmente en **`cloudinit/opentofu/aws/backend.hcl`** (protegido por `.gitignore`, nunca se sube a GitHub):
   ```hcl
   bucket         = "asistencia-tfstate-85htnsfx"
   key            = "mi-asistencia/dev/terraform.tfstate"
   region         = "us-east-1"
   dynamodb_table = "asistencia-tfstate-locks"
   encrypt        = true
   role_arn       = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
   ```

---

### ¿Cómo inicializar la PRIMERA VEZ (o un nuevo compañero)?

Cada vez que se clona el proyecto por primera vez:

1. **Crear tu archivo de backend local:**
   ```powershell
   cd cloudinit\opentofu\aws
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

---

### Flujo de trabajo en el DÍA A DÍA

Una vez inicializado, **ya NO necesitas pasar `-backend-config`**:

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

El archivo `main.tf` incluye protecciones avanzadas:

1. **Nombres claros en la consola de AWS:**
   - Backend: `asistencia-tofu-backend` (tag `herramienta=opentofu`).
   - Frontend: `asistencia-tofu-frontend` (tag `herramienta=opentofu`).
2. **Auto-encendido si están `Stopped`:**
   Gracias a los recursos `aws_ec2_instance_state`, si las máquinas fueron apagadas manualmente en la consola de AWS, al ejecutar `tofu apply` OpenTofu detectará que deben estar encendidas y las **iniciará (`running`) en segundos sin destruirlas**.
3. **Protección de IP pública (`ignore_changes`):**
   Las instancias tienen configurado `ignore_changes = [associate_public_ip_address]`. Cuando una máquina se detiene en AWS, pierde temporalmente su IP pública; esta regla impide que OpenTofu intente recrear/destruir la máquina por ese motivo.

---

## 3. Aprovisionamiento con Cloud-Init Unificado (`cloud-init.yaml`)

Se utiliza la plantilla unificada [`cloudinit/opentofu/aws/cloud-init.yaml`](aws/cloud-init.yaml) que aprovisiona las **2 máquinas virtuales EC2** utilizando directivas condicionales `%{ if rol == "backend" }` y `%{ if rol == "frontend" }`:

### A. VM Backend (`asistencia-tofu-backend`)
- **Paquetes:** Node.js 20 LTS, MariaDB Server, Git, Swap de 1GB.
- **Base de datos:** Inicializa MariaDB, crea usuario y carga `backend/init.sql` y corre `node src/seed.js` para crear el estudiante de prueba (`220001`) y el admin.
- **Servicio Systemd:** Crea y activa `asistencia-backend.service` (Node.js en puerto 8000) con autoreinicio.
- **Seguridad:** MariaDB escucha solo localmente (`127.0.0.1`), la API expone el puerto 8000 para el frontend.

### B. VM Frontend (`asistencia-tofu-frontend`)
- **Paquetes:** Nginx, Node.js 20 (para compilar la SPA de React con Vite), Git, Swap de 2GB.
- **Compilación:** Ejecuta `npm install` y `npm run build` en `frontend/` configurando `VITE_API_URL` hacia la IP privada del backend.
- **Nginx Reverse Proxy:** Sirve los estáticos en el puerto 80 y reenvía `/api/` a la IP privada de la VM Backend (`http://${backend_ip}:8000`).

---

## 4. Guía de Destrucción (`tofu destroy`) y Limpieza

Para apagar recursos y evitar costos cuando el proyecto no esté en uso:

### A. Destruir la aplicación (`cloudinit/opentofu/aws`)
- **¿Qué borra?** Las 2 instancias EC2 (`asistencia-tofu-backend` y `asistencia-tofu-frontend`), Security Groups, llave SSH y reglas de red.
- **Comando:**
  ```powershell
  cd cloudinit\opentofu\aws
  tofu destroy
  ```
- **Resultado:** Las máquinas se eliminan en AWS y el `.tfstate` remoto en S3 queda limpio. El bucket S3 y DynamoDB **siguen existiendo** para futuros despliegues.

### B. Destruir la infraestructura base (`cloudinit/opentofu/bootstrap`)
- **¿Qué borra?** El Bucket S3 del `.tfstate`, la tabla DynamoDB y el Rol IAM `RolTerraformColaborador`.
- **¿Quién puede ejecutarlo?** **ÚNICAMENTE EL DUEÑO** de la cuenta central.
- **Pasos:**
  1. En `cloudinit/opentofu/bootstrap/main.tf`, asegurar `force_destroy = true`.
  2. Ejecutar:
     ```powershell
     cd cloudinit\opentofu\bootstrap
     tofu destroy
     ```

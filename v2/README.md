# Módulo v2: Infraestructura como Código (IaC)

Este directorio contiene las implementaciones de IaC organizadas por herramientas y nubes, incluyendo la gestión de estado remoto y el despliegue con Pulumi en Python.

---

## Estructura del Directorio

```text
v2/
├── bootstrap/               # Aprovisionamiento inicial del almacenamiento de estado remoto
│   ├── aws/                 # S3 Bucket + DynamoDB + Rol IAM para Terraform/OpenTofu
│   └── azure/               # Storage Account + Contenedor de referencia en Azure
├── aws/                     # Despliegue de la aplicación (EC2, VPC, SG) con OpenTofu / Terraform
│   ├── backend.tf           # Conexión al backend remoto en AWS S3
│   ├── main.tf              # Definición de recursos EC2 (backend y frontend)
│   ├── variables.tf         # Declaración de variables
│   ├── outputs.tf           # Salidas (IPs públicas, DNS)
│   ├── versions.tf          # Versiones y configuración del provider AWS (assume_role)
│   ├── scripts/             # Scripts user_data para aprovisionar las VMs
│   └── terraform.tfvars.example  # Plantilla de variables para el entorno
├── pulumi/                  # Despliegue alternativo con Pulumi (Python)
│   ├── Pulumi.yaml          # Metadatos del proyecto Pulumi
│   ├── Pulumi.dev.yaml      # Parámetros del stack 'dev'
│   ├── __main__.py          # Código Python para desplegar una única instancia EC2
│   ├── requirements.txt     # Dependencias de Python
│   └── README.md            # Guía detallada de uso con Pulumi
└── README.md                # Esta guía general
```

---

## 1. Módulo `v2/bootstrap/aws` (Ejecutar una única vez en la cuenta principal)

Crea la infraestructura de soporte para el estado remoto y la colaboración en equipo:
- **Bucket S3:** Almacena de forma centralizada el `.tfstate` con versionado y cifrado AES256.
- **Tabla DynamoDB:** Gestiona el *State Locking* para evitar colisiones entre colaboradores.
- **Rol IAM (`RolTerraformColaborador`):** Permite que colaboradores de otras cuentas AWS administren los recursos.

```bash
cd v2/bootstrap/aws
tofu init
tofu apply
```

Al terminar con éxito, `tofu apply` mostrará los **Outputs** necesarios para el siguiente paso:

```text
Outputs:
dynamodb_table_name = "asistencia-tfstate-locks"
region              = "us-east-1"
role_arn            = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
s3_bucket_name      = "asistencia-tfstate-v3vw1dtt"
```

---

## 2. Módulo `v2/aws` (Despliegue con Terraform / OpenTofu)

### ¿De dónde salen los valores de `v2/aws/backend.tf`?

> **¡IMPORTANTE!** Por limitación del motor de Terraform/OpenTofu, dentro del bloque `backend "s3"` **NO se permiten usar variables** (`var.algo`). Los valores deben escribirse de forma estática o pasarse mediante configuración parcial.

Cada colaborador (o quien despliegue) debe asegurarse de que [`v2/aws/backend.tf`](backend.tf) tenga los valores que generó el `bootstrap`:

| Campo en `backend.tf` | ¿De dónde se saca el valor? | Ejemplo real generado por bootstrap |
| :--- | :--- | :--- |
| `bucket` | Output `s3_bucket_name` de `v2/bootstrap/aws` | `"asistencia-tfstate-v3vw1dtt"` |
| `key` | Ruta lógica donde se guardará el `.tfstate` dentro de S3 | `"mi-asistencia/dev/terraform.tfstate"` |
| `region` | Output `region` de `v2/bootstrap/aws` | `"us-east-1"` |
| `dynamodb_table` | Output `dynamodb_table_name` de `v2/bootstrap/aws` | `"asistencia-tfstate-locks"` |
| `encrypt` | Cifrado obligatorio en reposo | `true` |
| `role_arn` | Output `role_arn` de `v2/bootstrap/aws` (permite que colaboradores asuman el rol de la cuenta central) | `"arn:aws:iam::168692730615:role/RolTerraformColaborador"` |

> **Nota sobre `role_arn`:** El ARN del rol **SIEMPRE debe llevar el Account ID de la cuenta central/creador** (en este ejemplo `168692730615`). Los colaboradores externos **NO deben cambiar ese número** por su propia cuenta, porque el rol y los recursos residen en la cuenta central.

Ejemplo completo de [`v2/aws/backend.tf`](backend.tf):

```hcl
terraform {
  backend "s3" {
    bucket         = "asistencia-tfstate-v3vw1dtt"
    key            = "mi-asistencia/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "asistencia-tfstate-locks"
    encrypt        = true
    role_arn       = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
  }
}
```

---

### Pasos para desplegar la aplicación:

1. **Configura tus variables locales:**
   ```bash
   cd v2/aws
   cp terraform.tfvars.example terraform.tfvars
   ```
   *En `terraform.tfvars` asegúrate de configurar tu contraseña `admin_password` y opcionalmente tu `role_arn`.*

2. **Inicializa la conexión con el backend remoto:**
   ```bash
   tofu init -reconfigure
   ```

3. **Revisa y aplica los cambios:**
   ```bash
   tofu plan
   tofu apply
   ```

> **Seguridad:** Los archivos `.pem` (llave SSH privada), `.tfvars` (contraseñas/IPs) y la carpeta `.terraform/` están en `.gitignore` y **NUNCA se suben a GitHub**.

---

## 3. Guía de Destrucción (`tofu destroy`) y Permisos

Para apagar recursos y evitar costos cuando el proyecto no esté en uso, existen dos niveles de borrado:

### A. Destruir la aplicación (`v2/aws`)

- **¿Qué borra?** Las máquinas virtuales EC2 (backend, frontend), Security Groups, pares de llaves y reglas de red.
- **¿Quién puede ejecutarlo?** **CUALQUIERA** de los miembros del equipo: tanto el **creador** de la cuenta central como **cualquier colaborador externo** autorizado mediante el `assume_role`.
- **Comando:**
  ```bash
  cd v2/aws
  tofu destroy
  ```
- **Resultado:** Las máquinas se apagan y eliminan en AWS. El archivo `.tfstate` remoto en S3 se actualiza automáticamente indicando que ya no hay recursos activos. El bucket S3 y DynamoDB **siguen existiendo** para futuros despliegues.

---

### B. Destruir la infraestructura base (`v2/bootstrap/aws`)

- **¿Qué borra?** El Bucket S3 que almacena el `.tfstate`, la tabla DynamoDB de locks y el Rol IAM `RolTerraformColaborador`.
- **¿Quién puede ejecutarlo?** **ÚNICAMENTE EL CREADOR / DUEÑO** de la cuenta central (`168692730615`) desde su propia máquina y con sus credenciales directas.
  > ⚠️ **Los colaboradores externos NO pueden borrar el bootstrap:** Dará error `403 AccessDenied` porque el estado de bootstrap es puramente local de la cuenta dueña y ningún colaborador tiene propiedad directa sobre el bucket base.
- **Pasos para destruirlo (si se requiere eliminar todo por completo):**
  1. En [`v2/bootstrap/aws/main.tf`](bootstrap/aws/main.tf), cambiar el candado de seguridad a `false`:
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
     ```bash
     cd v2/bootstrap/aws
     tofu destroy
     ```

---

## 4. Módulo `v2/pulumi` (Despliegue con Python)

Despliega una única instancia EC2 en AWS utilizando Infrastructure as Code nativa en Python con Pulumi:

1. Entra a la carpeta y activa el entorno virtual:
   ```bash
   cd v2/pulumi
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Previsualiza y despliega:
   ```bash
   pulumi stack select dev --create
   pulumi up
   ```
3. Destruir la instancia de Pulumi:
   ```bash
   pulumi destroy
   ```

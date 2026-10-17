# Módulo v2: Infraestructura como Código (IaC)

Este directorio contiene las implementaciones de IaC organizadas por herramientas y nubes, incluyendo la gestión de estado remoto y el despliegue con Pulumi en Python.

---

## Estructura del Directorio

```text
v2/
├── bootstrap/               # Aprovisionamiento inicial del almacenamiento de estado remoto
│   ├── aws/                 # S3 Bucket + DynamoDB para el backend de Terraform/OpenTofu
│   └── azure/               # Storage Account + Contenedor de referencia en Azure
├── aws/                     # Despliegue de la aplicación (EC2, VPC, SG) con OpenTofu / Terraform
│   ├── backend.tf           # Conexión al backend remoto en AWS S3
│   ├── main.tf              # Definición de recursos EC2 (backend y frontend)
│   ├── variables.tf         # Declaración de variables
│   ├── outputs.tf           # Salidas (IPs públicas, DNS)
│   ├── versions.tf          # Versiones y configuración del provider AWS
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

## 1. Módulo `v2/bootstrap/aws` (Ejecutar una única vez)

Crea la infraestructura de soporte para el estado remoto:
- **Bucket S3:** Almacena de forma centralizada el `.tfstate` con versionado y cifrado AES256.
- **Tabla DynamoDB:** Gestiona el *State Locking* para evitar modificaciones simultáneas entre compañeros de equipo.

```bash
cd v3/bootstrap/aws
tofu init
tofu apply
```

---

## 2. Módulo `v2/aws` (Despliegue con Terraform / OpenTofu)

Despliega la aplicación completa consultando y sincronizando el estado directamente con AWS S3:

1. Configura tus variables a partir de la plantilla:
   ```bash
   cd v3/aws
   cp terraform.tfvars.example terraform.tfvars
   ```
2. Inicializa y aplica:
   ```bash
   tofu init
   tofu plan
   tofu apply
   ```

> **Seguridad:** Los archivos `.pem` (llave SSH), `.tfvars` (contraseñas) y carpetas `.terraform/` están estrictamente ignorados por `.gitignore` y **no se suben al repositorio**.

---

## 3. Módulo `v2/pulumi` (Despliegue con Python)

Despliega una única instancia EC2 en AWS utilizando Infrastructure as Code nativa en Python con Pulumi:

1. Entra a la carpeta y activa el entorno virtual:
   ```bash
   cd v3/pulumi
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```
2. Previsualiza y despliega:
   ```bash
   pulumi stack select dev --create
   pulumi up
   ```

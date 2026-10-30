# Despliegue con Pulumi en Python (Cloud-Init)

Este directorio contiene la infraestructura como código (IaC) para desplegar el **Sistema de Asistencia** en AWS utilizando **Pulumi con Python**, reutilizando la misma plantilla declarativa `cloud-init.yaml`.

---

## Estructura Modular

El código está organizado siguiendo las mejores prácticas de modularización en Python:

```text
cloudinit/pulumi/
├── Pulumi.yaml                 # Metadatos del proyecto Pulumi
├── Pulumi.dev.yaml.example     # Plantilla de configuración del stack dev
├── requirements.txt            # Dependencias Python
├── __main__.py                 # Orquestador principal (limpio y declarativo)
└── modules/
    ├── __init__.py
    ├── config.py               # Carga y validación de parámetros de configuración
    ├── security.py             # Generación de llaves SSH, contraseñas y Security Groups
    ├── cloud_init.py           # Renderizado dinámico de la plantilla cloud-init.yaml
    └── compute.py              # Aprovisionamiento de VMs EC2 (backend y frontend)
```

---

## Requisitos Previos

1. **Python 3.10+** instalado.
2. **Pulumi CLI** instalado (`pulumi version`).
3. **Credenciales de AWS** configuradas en tu terminal (`aws configure` o variables de entorno `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`).

---

## Despliegue Paso a Paso

### 1. Crear y activar el entorno virtual
```powershell
cd cloudinit\pulumi
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 2. Inicializar el stack y configurar variables
```powershell
pulumi stack init dev
cp Pulumi.dev.yaml.example Pulumi.dev.yaml
```

Configura tus secretos de forma segura con Pulumi:
```powershell
pulumi config set aws:region us-east-1
pulumi config set repo_rama feat/cloudinit
pulumi config set --secret admin_password "Asistencia-2026"
```

### 3. Previsualizar y aplicar
```powershell
pulumi preview
pulumi up
```

### 4. Consultar Salidas
```powershell
pulumi stack output url_frontend
pulumi stack output url_backend_health
```

### 5. Destrucción de recursos
```powershell
pulumi destroy
```

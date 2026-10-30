# Despliegue con Pulumi en Python (Cloud-Init)

Este directorio contiene la infraestructura como código (IaC) para desplegar el **Sistema de Asistencia** en AWS utilizando **Pulumi con Python**, reutilizando la misma arquitectura y plantilla declarativa `cloud-init.yaml`.

---

## 📁 Estructura Modular

```text
cloudinit/pulumi/
├── deploy.ps1                  # Script automatizado de despliegue en 1 clic
├── destroy.ps1                 # Script automatizado de destrucción de recursos
├── Pulumi.yaml                 # Metadatos del proyecto Pulumi
├── Pulumi.dev.yaml.example     # Plantilla de configuración del stack dev
├── requirements.txt            # Dependencias Python
├── __main__.py                 # Orquestador principal
├── cloud-init.yaml             # Configuración unificada de cloud-init
└── modules/
    ├── __init__.py
    ├── config.py               # Carga y validación de parámetros de configuración
    ├── security.py             # Llaves SSH, contraseñas y Security Groups
    ├── cloud_init.py           # Renderizado dinámico de cloud-init.yaml
    └── compute.py              # Aprovisionamiento de VMs EC2 (asistencia-pulumi-backend y frontend)
```

---

## 🚀 Despliegue Automatizado (Recomendado)

Cualquier integrante del equipo puede desplegar ejecutando el script interactivo:

```powershell
cd cloudinit\pulumi
.\deploy.ps1
```

*(Opcional: puedes personalizar parámetros como rama o contraseña)*:
```powershell
.\deploy.ps1 -Branch "feat/cloudinit" -AdminPassword "TuPasswordSeguro123" -AutoApprove
```

### ¿Qué hace el script automáticamente?
1. **Comprueba los requisitos:** Verifica que `pulumi`, `python` y las credenciales de AWS estén listas. Si falta algo, te dice exactamente cómo instalarlo o configurarlo.
2. **Entorno Virtual (venv):** Si no existe, lo crea automáticamente e instala las dependencias de `requirements.txt`.
3. **Stack `dev`:** Si no existe, lo inicializa y configura los parámetros base.
4. **Ejecuta `pulumi up`:** Despliega las 2 instancias EC2 y muestra en pantalla las URLs públicas y comandos de acceso.

---

## 🧹 Destrucción Automatizada

Para apagar y eliminar todos los recursos creados en AWS para no generar costos:

```powershell
.\destroy.ps1
```

*(Para omitir la confirmación interactiva)*:
```powershell
.\destroy.ps1 -Force
```

---

## 🛠️ Despliegue Manual Paso a Paso (Alternativo)

Si prefieres ejecutar cada comando de Pulumi a mano:

1. **Crear y activar el entorno virtual:**
   ```powershell
   python -m venv venv
   .\venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

2. **Inicializar stack y variables:**
   ```powershell
   pulumi stack init dev
   pulumi config set aws:region us-east-1
   pulumi config set repo_rama feat/cloudinit
   pulumi config set --secret admin_password "Admin1234"
   ```

3. **Previsualizar y aplicar:**
   ```powershell
   pulumi preview
   pulumi up
   ```

4. **Destruir manualmente:**
   ```powershell
   pulumi destroy
   ```

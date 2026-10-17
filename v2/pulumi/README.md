# Despliegue de Instancia EC2 con Pulumi y Python

Este proyecto despliega **únicamente una instancia EC2** en AWS utilizando Infrastructure as Code con **Pulumi (Python)**.

---

## Estructura de archivos

```text
v2/pulumi/
├── Pulumi.yaml          # Metadatos del proyecto Pulumi y runtime (python)
├── Pulumi.dev.yaml      # Parámetros y variables de configuración del stack dev
├── requirements.txt     # Dependencias del SDK de Pulumi para Python
├── __main__.py          # Código Python que define y crea la instancia EC2
├── .gitignore           # Excluye venv/ y archivos temporales
└── README.md            # Guía de instalación y ejecución
```

---

## Requisitos previos

1. **Python 3.8+** instalado.
2. **AWS CLI** configurado con tus credenciales (`aws configure`).
3. **Pulumi CLI** instalado. Si aún no lo tienes en Windows, puedes instalarlo mediante PowerShell:
   ```powershell
   winget install Pulumi.Pulumi
   # O mediante Chocolatey:
   # choco install pulumi
   ```

---

## Pasos para ejecutar

1. **Entrar a la carpeta:**
   ```bash
   cd v3/pulumi
   ```

2. **Crear y activar el entorno virtual de Python:**
   - En Windows (PowerShell):
     ```powershell
     python -m venv venv
     .\venv\Scripts\Activate.ps1
     ```
   - En Linux / macOS / Git Bash:
     ```bash
     python3 -m venv venv
     source venv/bin/activate
     ```

3. **Instalar dependencias:**
   ```bash
   pip install -r requirements.txt
   ```

4. **Seleccionar o inicializar el stack de Pulumi:**
   ```bash
   pulumi stack select dev --create
   ```

5. **Previsualizar y desplegar:**
   ```bash
   # Ver qué recursos se crearán
   pulumi preview

   # Crear la instancia EC2 en AWS
   pulumi up
   ```

6. **Destruir los recursos cuando ya no los necesites:**
   ```bash
   pulumi destroy
   ```

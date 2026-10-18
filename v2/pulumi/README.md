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
   cd v2/pulumi
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

4. **Inicio de sesión en Pulumi (`pulumi login`):**
   - **¿Cuándo usarlo?**
     Debes usar `pulumi login` la primera vez que configuras tu entorno o cuando cambias de máquina/backend para que Pulumi sepa dónde almacenar el estado de tu infraestructura.
   - **Opciones de almacenamiento:**
     - **Pulumi Cloud (por defecto):**
       ```bash
       pulumi login
       ```
       Inicia sesión en el servicio administrado de Pulumi (requiere cuenta en pulumi.com).
     - **Almacenamiento local (sin cuenta en la nube):**
       ```bash
       pulumi login --local
       ```
       Guarda el estado en tu propio disco local (`~/.pulumi`).
     - **En un bucket de AWS S3:**
       ```bash
       pulumi login s3://mi-bucket-de-estado
       ```

5. **Seleccionar o crear el stack:**
   ```bash
   pulumi stack select dev --create
   ```
   - **¿Qué significa este comando?**
     - `pulumi stack select dev`: Le indica a Pulumi que active y trabaje sobre el stack/ambiente llamado `dev` (desarrollo). En Pulumi, un *stack* es una instancia aislada e independiente de tu infraestructura (por ejemplo: `dev`, `staging`, `prod`).
     - `--create`: Es una bandera opcional que le indica a Pulumi: *"si el stack `dev` no existe todavía, créalo automáticamente en lugar de arrojar un error"*. Si el stack ya existe, simplemente lo selecciona.

6. **Previsualizar y desplegar:**
   ```bash
   # Ver qué recursos se crearán
   pulumi preview

   # Crear la instancia EC2 en AWS
   pulumi up
   ```

7. **Destruir los recursos cuando ya no los necesites:**
   ```bash
   pulumi destroy
   ```

---

## Comandos útiles adicionales

### Sincronizar el estado real con `pulumi refresh`
```bash
pulumi refresh
```

**¿Cuándo usarlo?**
- **Recursos modificados o eliminados fuera de Pulumi:** Si alguien apagó, modificó o eliminó una instancia EC2 u otro recurso directamente desde la consola web de AWS (o por CLI de AWS), el estado guardado en Pulumi quedará desincronizado con la realidad de la nube.
- **Error `Resource provider reported that the resource did not exist while updating`:** Ocurre durante un `pulumi up` cuando Pulumi intenta actualizar un recurso que ya no existe físicamente en AWS.
- **Solución:** Al ejecutar `pulumi refresh`, Pulumi consulta directamente a AWS, compara lo que realmente existe contra su archivo de estado y te da la opción de actualizar su estado local/remoto para reflejar la realidad antes de volver a correr `pulumi up`.

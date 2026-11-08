# Guía Completa: Infraestructura en AWS (CloudFormation) y Configuración Total con Ansible

En esta arquitectura, **CloudFormation únicamente levanta las 3 instancias EC2 limpias (Ubuntu 24.04)** con sus respectivos Security Groups. **TODA la configuración del sistema operativo, paquetes, base de datos MySQL, backend Node.js y frontend Nginx/React se gestiona desde Ansible**.

> **Nota importante:** Se ha eliminado por completo `cloud-init` y cualquier configuración incrustada en `UserData`. Las máquinas quedan en estado limpio para ser configuradas al 100% mediante tus playbooks de Ansible locales.

---

## 📁 Estructura del Proyecto

```text
tvms/
├── ansible/
│   ├── ansible.cfg                # Configuración con host_key_checking = False y llave SSH
│   ├── inventario.ini             # Inventario con los 3 grupos: [frontend], [backend], [database]
│   ├── ping.yml                   # Playbook simple de comprobación de conectividad
│   ├── site.yml                   # 🚀 Master Playbook que orquesta la configuración de los 3 servidores
│   ├── vars/
│   │   └── main.yml               # Variables centralizadas (puertos, credenciales, repo Git, timezone)
│   ├── playbooks/
│   │   ├── 01-database.yml        # Configuración de MariaDB/MySQL, permisos de red (%) y firewall
│   │   ├── 02-backend.yml         # Node.js 20, clonación del repo, .env, npm install y servicio systemd
│   │   └── 03-frontend.yml        # Node.js 20, Vite build, Nginx con reverse proxy hacia el backend y UFW
│   └── templates/
│       ├── backend.env.j2         # Plantilla Jinja2 del archivo .env para el backend
│       └── nginx-asistencia.conf.j2 # Plantilla del Virtual Host Nginx con proxy /api
└── cloudformation/
    ├── modules/
    │   ├── security.yaml          # Security Groups cruzados (Frontend, Backend, Database)
    │   ├── database.yaml          # Instancia EC2 limpia para la Base de Datos
    │   ├── backend.yaml           # Instancia EC2 limpia para el Backend
    │   └── frontend.yaml          # Instancia EC2 limpia para el Frontend
    ├── main.yaml                  # Orquestador CloudFormation Nested Stacks
    ├── deploy.ps1                 # Script de despliegue automatizado en PowerShell
    └── destroy.ps1                # Script para destruir la infraestructura
```

---

## 🚀 Paso 1: Desplegar Infraestructura en AWS (desde PowerShell)

Ejecuta el script de despliegue desde Windows:

```powershell
cd tvms/cloudformation
.\deploy.ps1
```

Este script:
1. Detecta o crea tu llave SSH (`asistencia-devops-key.pem`).
2. Sube los módulos de CloudFormation a S3 y crea el stack en AWS.
3. Extrae las IPs públicas de cada EC2.
4. Genera automáticamente `tvms/ansible/inventario.ini` y `tvms/ansible/ansible.cfg`.
5. Ejecuta una prueba inicial `ping.yml` para confirmar que los servidores responden por SSH.

---

## 🛠️ Paso 2: Configurar los Servidores con Ansible

Una vez que las máquinas están activas, tienes el control total para configurar los 3 servidores desde tu máquina local usando el playbook maestro `site.yml`.

### Opción A: Desde tu terminal de WSL (Recomendado)

1. Abre tu terminal de WSL y ve a la carpeta de Ansible:
   ```bash
   cd /mnt/c/Users/Usuario/Documents/m2/Mi-asistencia/tvms/ansible
   ```

2. Ejecuta el aprovisionamiento completo:
   ```bash
   ANSIBLE_CONFIG=./ansible.cfg ansible-playbook site.yml
   ```

### Opción B: Ejecutar playbooks individuales
Si quieres configurar o actualizar solo un servidor en específico:

- **Solo la Base de Datos MySQL:**
  ```bash
  ANSIBLE_CONFIG=./ansible.cfg ansible-playbook playbooks/01-database.yml
  ```
- **Solo el Backend API:**
  ```bash
  ANSIBLE_CONFIG=./ansible.cfg ansible-playbook playbooks/02-backend.yml
  ```
- **Solo el Frontend Web:**
  ```bash
  ANSIBLE_CONFIG=./ansible.cfg ansible-playbook playbooks/03-frontend.yml
  ```

---

## ⚙️ ¿Qué realiza cada Playbook de Ansible?

### 1. `01-database.yml` (Servidor MySQL)
- Instala MariaDB/MySQL server y dependencias Python (`python3-pymysql`).
- Configura `bind-address = 0.0.0.0` para admitir conexiones remotas provenientes del backend.
- Crea la base de datos `asistencia` con codificación `utf8mb4`.
- Crea el usuario `asistencia` con privilegios globales y contraseña segura.
- Habilita los puertos `22` (SSH) y `3306` (MySQL) en el firewall UFW.

### 2. `02-backend.yml` (Servidor Backend)
- Instala Node.js 20.x LTS y cliente MariaDB.
- Clona el repositorio oficial de GitHub en `/opt/asistencia`.
- Conecta dinámicamente con la IP del servidor de Base de Datos y genera `/opt/asistencia/backend/.env`.
- Ejecuta `npm install`.
- Configura e inicializa el servicio `systemd` (`asistencia-backend.service`) para ejecución continua.
- Habilita los puertos `22` (SSH) y `8000` (API) en el firewall UFW.

### 3. `03-frontend.yml` (Servidor Frontend)
- Instala Node.js 20.x LTS y Nginx.
- Clona el repositorio en `/opt/asistencia`.
- Configura `VITE_API_URL` apuntando a la IP del backend y compila el frontend con `npm run build`.
- Configura Nginx como servidor web y Reverse Proxy para `/api` hacia el backend.
- Habilita el servicio Nginx y abre los puertos `22` (SSH), `80` (HTTP) y `443` (HTTPS) en UFW.

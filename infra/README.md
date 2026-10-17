# Despliegue del Sistema de Asistencia con OpenTofu / Terraform (AWS, sin Docker)

Este proyecto crea **2 servidores** en AWS con un solo comando y los deja funcionando:

```
                Internet
                   │
     ┌─────────────┴──────────────┐
     │ http://IP-FRONTEND  (80)   │  http://IP-BACKEND:8000/api/health
     ▼                            ▼
┌──────────────────┐   /api/   ┌──────────────────────────┐
│ VM 1  FRONTEND   │ ────────► │ VM 2  BACKEND            │
│ Ubuntu 24.04     │ IP privada│ Ubuntu 24.04             │
│ nginx + build    │   :8000   │ Node 20 + Express (8000) │
│ React/Vite       │           │ MySQL 8 (solo local)     │
└──────────────────┘           └──────────────────────────┘
        Security Group               Security Group
        80 público, 22 tu IP         8000 público, 22 tu IP, 3306 cerrado
```

- **Terraform/OpenTofu aprovisiona** (crea VMs, firewall, llave SSH).
- Un script **cloud-init (`user_data`) configura** cada VM al arrancar (instala Node, MySQL, nginx, clona el repo, migra, siembra y deja servicios `systemd`). Equivale al paso que haríamos con Ansible.
- El código `.tf` sirve **igual para `terraform` y para `tofu`**: solo cambia el comando.

---

## 1. Qué necesitas tener

| Herramienta | Para qué | Instalación en Windows (PowerShell) |
|---|---|---|
| **OpenTofu** *o* **Terraform** | Leer los `.tf` y crear la infraestructura | `winget install OpenTofu.Tofu` · o · `winget install Hashicorp.Terraform` |
| **AWS CLI v2** | Guardar tus credenciales de AWS | `winget install Amazon.AWSCLI` |
| **Git** | Ya lo tienes (el repo) | `winget install Git.Git` |
| VS Code + extensión *HashiCorp Terraform* / *OpenTofu* | Resaltado y autocompletado (opcional) | Marketplace |

Cierra y vuelve a abrir la terminal, y verifica:

```powershell
tofu version        # o: terraform version
aws --version
```

## 2. Preparar la cuenta AWS (una sola vez)

1. **Alerta de presupuesto** (evita sorpresas): Consola → *Billing and Cost Management* → *Budgets* → *Create budget* → plantilla *Zero spend budget* o *Monthly cost budget* de 5 USD.
2. **Usuario IAM para la CLI** (no uses el usuario raíz):
   - Consola → *IAM* → *Users* → *Create user* → nombre `tofu-estudiante`.
   - *Attach policies directly* → **AmazonEC2FullAccess**.
   - Entra al usuario → *Security credentials* → *Create access key* → *Command Line Interface (CLI)*.
   - Copia **Access key ID** y **Secret access key** (el secreto solo se muestra una vez).
3. Configura la CLI:

```powershell
aws configure
#   AWS Access Key ID:     AKIA...
#   AWS Secret Access Key: ....
#   Default region name:   us-east-1
#   Default output format: json

aws sts get-caller-identity   # debe mostrar tu cuenta y el usuario tofu-estudiante
```

4. **¿Qué tipo de VM es gratis para ti?** Consola → *EC2* → *Launch instance* → mira qué tipo dice **"Free tier eligible"**:
   - Cuenta creada **desde el 15-jul-2025** → `t3.micro` (se paga con los créditos de bienvenida).
   - Cuenta **anterior** → `t2.micro` (750 h/mes gratis los primeros 12 meses).

## 3. Desplegar

```powershell
cd iac-asistencia
copy terraform.tfvars.example terraform.tfvars
# Edita terraform.tfvars: admin_password, tipo_instancia, mi_ip (https://checkip.amazonaws.com + "/32")

tofu init        # descarga los providers (aws, random, tls, local)
tofu plan        # muestra QUÉ va a crear (léelo: ~11 recursos)
tofu apply       # escribe: yes
```

Al terminar verás algo así:

```
url_frontend       = "http://54.x.x.x"
url_backend_health = "http://3.x.x.x:8000/api/health"
ssh_backend        = "ssh -i asistencia-llave.pem ubuntu@3.x.x.x"
```

> **Espera 5–8 minutos** después del `apply`: las VMs están instalando todo.
> Primero abre `url_backend_health` → debe responder `{"status":"ok"}`. Luego `url_frontend`.
> Ver la contraseña del admin: `tofu output credenciales_admin`

## 4. Verificar / depurar por SSH

En Windows la llave necesita permisos restringidos (una sola vez):

```powershell
icacls asistencia-llave.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i asistencia-llave.pem ubuntu@IP-BACKEND
```

Dentro de la VM:

```bash
sudo tail -f /var/log/despliegue.log          # progreso de la instalación ("=== BACKEND LISTO ===")
systemctl status asistencia-backend            # servicio Node
journalctl -u asistencia-backend -f            # logs de la API
curl localhost:8000/api/health
sudo mysql asistencia -e "SHOW TABLES;"        # deben aparecer las 9 tablas
```

En el frontend: `systemctl status nginx` y `sudo tail -f /var/log/despliegue.log`.

## 5. Actualizar el código cuando el equipo haga merge a `main`

Sin volver a crear nada:

```bash
# en la VM backend
sudo actualizar-backend      # git pull + npm ci + migraciones + reinicio
# en la VM frontend
sudo actualizar-frontend     # git pull + build + recarga nginx
```

## 6. Destruir (¡importante para no gastar!)

```powershell
tofu destroy     # escribe: yes  → borra las 2 VMs, firewalls y la llave
```

Puedes volver a crear todo idéntico con `tofu apply` el día de la presentación: **eso es justamente la reproducibilidad de IaC**.

## 7. Costos aproximados (us-east-1, si estuvieran prendidas 24/7 un mes)

| Concepto | Cálculo | USD/mes |
|---|---|---|
| 2 × t3.micro | 2 × 730 h × 0,0104 | 15,18 |
| 2 IPs públicas IPv4 | 2 × 730 h × 0,005 | 7,30 |
| Disco gp3 30 GB | 30 × 0,08 | 2,40 |
| **Total** | | **≈ 25** |

- Cuenta nueva: lo cubren los créditos de bienvenida.
- Cuenta antigua con 750 h gratis: alcanzan para **1** VM 24/7; con 2 VMs te pasarías ~710 h (≈ 8 USD). Destruye cuando no las uses.

## 8. Escenario B: frontend en otra nube (OVH, Azure, GCP)

El docente permite nubes distintas. En `terraform.tfvars`:

```hcl
crear_frontend      = false
frontend_ip_externa = "IP.DEL.FRONTEND/32"
```

En la VM de la otra nube (Ubuntu 24.04) ejecuta `scripts/frontend.sh.tftpl` reemplazando
`${backend_ip}` por la **IP pública** del backend (`tofu output backend_ip_publica`) y los
`${repo_url}` / `${repo_rama}` por sus valores. Para que esa VM también quede "como código",
se crea con el provider de esa nube (`azurerm` para Azure, `google` para GCP,
`openstack`/`ovh` para OVHcloud) usando el mismo script como `custom_data`/`user_data`.

## 9. Estructura

```
iac-asistencia/
├── versions.tf               providers y versión mínima
├── variables.tf              parámetros (región, tipo VM, rama, admin...)
├── main.tf                   red, security groups, llave SSH, 2 VMs
├── outputs.tf                URLs, comandos SSH
├── terraform.tfvars.example  copia a terraform.tfvars
└── scripts/
    ├── backend.sh.tftpl      instala Node 20 + MySQL 8 + systemd
    └── frontend.sh.tftpl     build Vite + nginx con proxy /api
```

## 10. Problemas comunes

| Síntoma | Causa / solución |
|---|---|
| `No valid credential sources found` | Falta `aws configure` |
| `UnauthorizedOperation` | Al usuario IAM le falta `AmazonEC2FullAccess` |
| `InvalidParameterCombination ... not eligible for Free Tier` | Cambia `tipo_instancia` (t2.micro ↔ t3.micro) |
| Frontend carga pero el login falla (502) | El backend aún instala: revisa `/var/log/despliegue.log` en el backend |
| `UNPROTECTED PRIVATE KEY FILE` | Ejecuta el `icacls` de la sección 4 |
| `ssh` no conecta | `mi_ip` no coincide con tu IP actual: ajústala y `tofu apply` |
| Contraseña admin con comilla simple `'` | Evítala: rompe el `.env` |

> No subas a GitHub: `terraform.tfvars`, `*.tfstate`, `*.pem` (ya están en `.gitignore`).

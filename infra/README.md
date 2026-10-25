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

<!-- BEGIN_TF_DOCS -->
## Requirements

| Name | Version |
| ---- | ------- |
| <a name="requirement_terraform"></a> [terraform](#requirement\_terraform) | >= 1.5 |
| <a name="requirement_aws"></a> [aws](#requirement\_aws) | ~> 5.0 |
| <a name="requirement_local"></a> [local](#requirement\_local) | ~> 2.5 |
| <a name="requirement_random"></a> [random](#requirement\_random) | ~> 3.6 |
| <a name="requirement_tls"></a> [tls](#requirement\_tls) | ~> 4.0 |

## Providers

| Name | Version |
| ---- | ------- |
| <a name="provider_aws"></a> [aws](#provider\_aws) | 5.100.0 |
| <a name="provider_local"></a> [local](#provider\_local) | 2.9.1 |
| <a name="provider_random"></a> [random](#provider\_random) | 3.9.1 |
| <a name="provider_tls"></a> [tls](#provider\_tls) | 4.4.1 |

## Modules

No modules.

## Resources

| Name | Type |
| ---- | ---- |
| [aws_instance.backend](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance) | resource |
| [aws_instance.frontend](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/instance) | resource |
| [aws_key_pair.ssh](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/key_pair) | resource |
| [aws_security_group.backend](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_security_group.frontend](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/security_group) | resource |
| [aws_vpc_security_group_ingress_rule.api_desde_externo](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule) | resource |
| [aws_vpc_security_group_ingress_rule.api_desde_frontend](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule) | resource |
| [aws_vpc_security_group_ingress_rule.api_publica](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/resources/vpc_security_group_ingress_rule) | resource |
| [local_sensitive_file.llave_pem](https://registry.terraform.io/providers/hashicorp/local/latest/docs/resources/sensitive_file) | resource |
| [random_password.db](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [random_password.jwt](https://registry.terraform.io/providers/hashicorp/random/latest/docs/resources/password) | resource |
| [tls_private_key.ssh](https://registry.terraform.io/providers/hashicorp/tls/latest/docs/resources/private_key) | resource |
| [aws_ami.ubuntu](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/ami) | data source |
| [aws_subnets.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/subnets) | data source |
| [aws_vpc.default](https://registry.terraform.io/providers/hashicorp/aws/latest/docs/data-sources/vpc) | data source |

## Inputs

| Name | Description | Type | Default | Required |
| ---- | ----------- | ---- | ------- | :------: |
| <a name="input_admin_email"></a> [admin\_email](#input\_admin\_email) | Correo del administrador inicial (lo crea la semilla). | `string` | `"admin@ejemplo.com"` | no |
| <a name="input_admin_password"></a> [admin\_password](#input\_admin\_password) | Contraseña del administrador inicial. | `string` | n/a | yes |
| <a name="input_backend_publico"></a> [backend\_publico](#input\_backend\_publico) | true = el puerto 8000 del backend queda abierto a internet (el docente pide backend 'publicado'). | `bool` | `true` | no |
| <a name="input_cargar_semilla"></a> [cargar\_semilla](#input\_cargar\_semilla) | Si es true, corre 'npm run seed' (módulo de ejemplo + 2 estudiantes de prueba). | `bool` | `true` | no |
| <a name="input_crear_frontend"></a> [crear\_frontend](#input\_crear\_frontend) | true = crea también la VM del frontend en AWS. false = solo backend (el frontend va en otra nube). | `bool` | `true` | no |
| <a name="input_frontend_ip_externa"></a> [frontend\_ip\_externa](#input\_frontend\_ip\_externa) | Solo si el frontend está en OTRA nube: su IP pública en CIDR (ej. 51.75.1.2/32), para dejarla pasar al puerto 8000. | `string` | `""` | no |
| <a name="input_mi_ip"></a> [mi\_ip](#input\_mi\_ip) | Tu IP pública en formato CIDR para permitir SSH (ej. 181.115.10.20/32). Averíguala en https://checkip.amazonaws.com | `string` | `"0.0.0.0/0"` | no |
| <a name="input_proyecto"></a> [proyecto](#input\_proyecto) | Prefijo para nombrar los recursos. | `string` | `"asistencia"` | no |
| <a name="input_region"></a> [region](#input\_region) | Región de AWS. us-east-1 (Virginia) es la más barata y tiene todo disponible. | `string` | `"us-east-1"` | no |
| <a name="input_repo_rama"></a> [repo\_rama](#input\_repo\_rama) | Rama que se despliega. | `string` | `"main"` | no |
| <a name="input_repo_url"></a> [repo\_url](#input\_repo\_url) | Repositorio del proyecto. | `string` | `"https://github.com/escobarnina/Mi-asistencia.git"` | no |
| <a name="input_tipo_instancia"></a> [tipo\_instancia](#input\_tipo\_instancia) | Tipo de VM. Cuentas AWS creadas DESDE el 15-jul-2025: t3.micro (plan con créditos).<br/>Cuentas más antiguas (capa gratuita de 12 meses): usa t2.micro en us-east-1.<br/>En la consola de EC2 el tipo correcto aparece con la etiqueta "Free tier eligible". | `string` | `"t3.micro"` | no |

## Outputs

| Name | Description |
| ---- | ----------- |
| <a name="output_aviso"></a> [aviso](#output\_aviso) | n/a |
| <a name="output_backend_ip_publica"></a> [backend\_ip\_publica](#output\_backend\_ip\_publica) | n/a |
| <a name="output_credenciales_admin"></a> [credenciales\_admin](#output\_credenciales\_admin) | n/a |
| <a name="output_ssh_backend"></a> [ssh\_backend](#output\_ssh\_backend) | n/a |
| <a name="output_ssh_frontend"></a> [ssh\_frontend](#output\_ssh\_frontend) | n/a |
| <a name="output_url_backend_health"></a> [url\_backend\_health](#output\_url\_backend\_health) | Prueba del backend publicado. |
| <a name="output_url_frontend"></a> [url\_frontend](#output\_url\_frontend) | Abre esto en el navegador (el sistema completo). |
<!-- END_TF_DOCS -->
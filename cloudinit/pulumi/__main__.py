"""
Sistema de Asistencia — Despliegue en AWS con Pulumi, Python y Cloud-Init (2 VMs)
Orquestador principal modularizado.
"""
import os
import pulumi
import pulumi_aws as aws

from modules.config import load_config
from modules.security import create_security
from modules.cloud_init import render_cloud_init
from modules.compute import (
    get_ubuntu_ami,
    create_backend_instance,
    create_frontend_instance
)

# 1. Cargar configuraciones
cfg = load_config()

# 2. Obtener VPC y Subnets por defecto de AWS
default_vpc = aws.ec2.get_vpc(default=True)
default_subnets = aws.ec2.get_subnets(
    filters=[
        aws.ec2.GetSubnetsFilterArgs(name="vpc-id", values=[default_vpc.id]),
        aws.ec2.GetSubnetsFilterArgs(name="default-for-az", values=["true"]),
    ]
)
subnet_id = default_subnets.ids[0]

# 3. Obtener AMI de Ubuntu 24.04 LTS oficial
ubuntu_ami = get_ubuntu_ami()

# 4. Crear Llaves SSH, Contraseñas y Security Groups
sec = create_security(cfg, default_vpc.id)

# 5. Ruta a la plantilla de Cloud-Init (local de pulumi o compartida)
cloud_init_local = os.path.join(os.path.dirname(__file__), "cloud-init.yaml")
cloud_init_shared = os.path.join(os.path.dirname(__file__), "..", "opentofu", "aws", "cloud-init.yaml")
cloud_init_template_path = cloud_init_local if os.path.exists(cloud_init_local) else cloud_init_shared

# 6. Renderizar User Data y crear VM BACKEND
backend_user_data = render_cloud_init(
    template_path=cloud_init_template_path,
    rol="backend",
    variables={
        "backend_ip": "",
        "repo_url": cfg.repo_url,
        "repo_rama": cfg.repo_rama,
        "db_password": sec["db_password"],
        "jwt_secret": sec["jwt_secret"],
        "admin_email": cfg.admin_email,
        "admin_password": cfg.admin_password,
    }
)

backend_vm = create_backend_instance(
    cfg=cfg,
    sec=sec,
    subnet_id=subnet_id,
    ami_id=ubuntu_ami.id,
    user_data=backend_user_data
)

# 7. Renderizar User Data y crear VM FRONTEND (conecta por IP privada al backend)
frontend_user_data = render_cloud_init(
    template_path=cloud_init_template_path,
    rol="frontend",
    variables={
        "backend_ip": backend_vm.private_ip,
        "repo_url": cfg.repo_url,
        "repo_rama": cfg.repo_rama,
        "db_password": "",
        "jwt_secret": "",
        "admin_email": "",
        "admin_password": "",
    }
)

frontend_vm = create_frontend_instance(
    cfg=cfg,
    sec=sec,
    subnet_id=subnet_id,
    ami_id=ubuntu_ami.id,
    user_data=frontend_user_data
)

# 8. Exportar Salidas (URLs, IPs y Comandos SSH)
pulumi.export("url_frontend", frontend_vm.public_ip.apply(lambda ip: f"http://{ip}"))
pulumi.export("url_backend_health", backend_vm.public_ip.apply(lambda ip: f"http://{ip}:8000/api/health"))
pulumi.export("frontend_ip_publica", frontend_vm.public_ip)
pulumi.export("backend_ip_publica", backend_vm.public_ip)
pulumi.export("backend_ip_privada", backend_vm.private_ip)
pulumi.export("ssh_backend", backend_vm.public_ip.apply(lambda ip: f"ssh -i {cfg.proyecto}-llave.pem ubuntu@{ip}"))
pulumi.export("ssh_frontend", frontend_vm.public_ip.apply(lambda ip: f"ssh -i {cfg.proyecto}-llave.pem ubuntu@{ip}"))
pulumi.export("ssh_private_key_openssh", sec["ssh_key"].private_key_openssh)
pulumi.export("credenciales_admin", pulumi.Output.concat(cfg.admin_email, " / ", cfg.admin_password))

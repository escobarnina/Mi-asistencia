"""
Módulo de Seguridad: Llaves SSH, Contraseñas Aleatorias y Security Groups.
"""
from typing import Dict, Any
import pulumi
import pulumi_aws as aws
import pulumi_random as random
import pulumi_tls as tls
from modules.config import AppConfig

def create_security(cfg: AppConfig, vpc_id: str) -> Dict[str, Any]:
    # 1. Par de llaves SSH (ED25519)
    ssh_key = tls.PrivateKey(
        f"{cfg.proyecto}-ssh-key",
        algorithm="ED25519"
    )

    aws_key_pair = aws.ec2.KeyPair(
        f"{cfg.proyecto}-keypair",
        key_name=f"{cfg.proyecto}-pulumi-llave",
        public_key=ssh_key.public_key_openssh,
        tags={"Name": f"{cfg.proyecto}-llave", "ManagedBy": "Pulumi"}
    )

    # 2. Contraseñas aleatorias para DB y JWT
    db_password = random.RandomPassword(
        f"{cfg.proyecto}-db-pass",
        length=20,
        special=False
    )

    jwt_secret = random.RandomPassword(
        f"{cfg.proyecto}-jwt-secret",
        length=48,
        special=False
    )

    # 3. Security Group para Frontend (HTTP 80 público y SSH)
    frontend_sg = aws.ec2.SecurityGroup(
        f"{cfg.proyecto}-sg-frontend",
        vpc_id=vpc_id,
        description="Frontend: HTTP publico (80) y SSH (22)",
        ingress=[
            aws.ec2.SecurityGroupIngressArgs(
                description="HTTP publico",
                protocol="tcp",
                from_port=80,
                to_port=80,
                cidr_blocks=["0.0.0.0/0"]
            ),
            aws.ec2.SecurityGroupIngressArgs(
                description="SSH",
                protocol="tcp",
                from_port=22,
                to_port=22,
                cidr_blocks=[cfg.mi_ip]
            )
        ],
        egress=[
            aws.ec2.SecurityGroupEgressArgs(
                description="Permitir salida total",
                protocol="-1",
                from_port=0,
                to_port=0,
                cidr_blocks=["0.0.0.0/0"]
            )
        ],
        tags={"Name": f"{cfg.proyecto}-sg-frontend", "ManagedBy": "Pulumi"}
    )

    # 4. Security Group para Backend (SSH y API 8000 desde frontend / publico)
    backend_ingress = [
        aws.ec2.SecurityGroupIngressArgs(
            description="SSH",
            protocol="tcp",
            from_port=22,
            to_port=22,
            cidr_blocks=[cfg.mi_ip]
        ),
        aws.ec2.SecurityGroupIngressArgs(
            description="API 8000 desde Frontend",
            protocol="tcp",
            from_port=8000,
            to_port=8000,
            security_groups=[frontend_sg.id]
        )
    ]

    if cfg.backend_publico:
        backend_ingress.append(
            aws.ec2.SecurityGroupIngressArgs(
                description="API 8000 publica",
                protocol="tcp",
                from_port=8000,
                to_port=8000,
                cidr_blocks=["0.0.0.0/0"]
            )
        )

    backend_sg = aws.ec2.SecurityGroup(
        f"{cfg.proyecto}-sg-backend",
        vpc_id=vpc_id,
        description="Backend: API 8000 y SSH. MariaDB no se expone.",
        ingress=backend_ingress,
        egress=[
            aws.ec2.SecurityGroupEgressArgs(
                description="Permitir salida para descargas",
                protocol="-1",
                from_port=0,
                to_port=0,
                cidr_blocks=["0.0.0.0/0"]
            )
        ],
        tags={"Name": f"{cfg.proyecto}-sg-backend", "ManagedBy": "Pulumi"}
    )

    return {
        "ssh_key": ssh_key,
        "key_pair": aws_key_pair,
        "db_password": db_password.result,
        "jwt_secret": jwt_secret.result,
        "frontend_sg": frontend_sg,
        "backend_sg": backend_sg
    }

"""
Módulo de Cómputo: AMI oficial de Ubuntu y creación de instancias EC2.
"""
from typing import Dict, Any
import pulumi
import pulumi_aws as aws
from modules.config import AppConfig

def get_ubuntu_ami() -> aws.ec2.AwaitableGetAmiResult:
    return aws.ec2.get_ami(
        most_recent=True,
        owners=["099720109477"],  # Canonical
        filters=[
            aws.ec2.GetAmiFilterArgs(
                name="name",
                values=["ubuntu/images/hvm-ssd-gp3/ubuntu-noble-24.04-amd64-server-*"]
            ),
            aws.ec2.GetAmiFilterArgs(
                name="virtualization-type",
                values=["hvm"]
            )
        ]
    )

def create_backend_instance(
    cfg: AppConfig,
    sec: Dict[str, Any],
    subnet_id: str,
    ami_id: str,
    user_data: pulumi.Output[str]
) -> aws.ec2.Instance:
    return aws.ec2.Instance(
        f"{cfg.proyecto}-pulumi-backend",
        ami=ami_id,
        instance_type=cfg.tipo_instancia,
        subnet_id=subnet_id,
        vpc_security_group_ids=[sec["backend_sg"].id],
        key_name=sec["key_pair"].key_name,
        associate_public_ip_address=True,
        ebs_optimized=True,
        monitoring=True,
        root_block_device=aws.ec2.InstanceRootBlockDeviceArgs(
            volume_size=20,
            volume_type="gp3"
        ),
        user_data=user_data,
        user_data_replace_on_change=True,
        tags={
            "Name": f"{cfg.proyecto}-pulumi-backend",
            "rol": "backend",
            "herramienta": "pulumi",
            "ManagedBy": "Pulumi"
        }
    )

def create_frontend_instance(
    cfg: AppConfig,
    sec: Dict[str, Any],
    subnet_id: str,
    ami_id: str,
    user_data: pulumi.Output[str]
) -> aws.ec2.Instance:
    return aws.ec2.Instance(
        f"{cfg.proyecto}-pulumi-frontend",
        ami=ami_id,
        instance_type=cfg.tipo_instancia,
        subnet_id=subnet_id,
        vpc_security_group_ids=[sec["frontend_sg"].id],
        key_name=sec["key_pair"].key_name,
        associate_public_ip_address=True,
        ebs_optimized=True,
        monitoring=True,
        root_block_device=aws.ec2.InstanceRootBlockDeviceArgs(
            volume_size=10,
            volume_type="gp3"
        ),
        user_data=user_data,
        user_data_replace_on_change=True,
        tags={
            "Name": f"{cfg.proyecto}-pulumi-frontend",
            "rol": "frontend",
            "herramienta": "pulumi",
            "ManagedBy": "Pulumi"
        }
    )

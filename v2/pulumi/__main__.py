"""
Despliegue de ÚNICAMENTE una instancia EC2 en AWS con Pulumi y Python.
"""
import pulumi
import pulumi_aws as aws

# 1. Cargar configuraciones del stack (con valores por defecto)
config = pulumi.Config()
instance_type = config.get("instance_type") or "t3.micro"
instance_name = config.get("instance_name") or "asistencia-ec2"

# 2. Obtener la AMI oficial más reciente de Ubuntu 22.04 LTS (Canonical)
ubuntu_ami = aws.ec2.get_ami(
    most_recent=True,
    owners=["099720109477"],  # Canonical
    filters=[
        aws.ec2.GetAmiFilterArgs(
            name="name",
            values=["ubuntu/images/hvm-ssd/ubuntu-jammy-22.04-amd64-server-*"]
        ),
        aws.ec2.GetAmiFilterArgs(
            name="virtualization-type",
            values=["hvm"]
        )
    ]
)

# 3. Security Group para la instancia (SSH puerto 22 y HTTP puerto 80)
sec_group = aws.ec2.SecurityGroup(
    f"{instance_name}-sg",
    description="Permitir trafico SSH y HTTP",
    ingress=[
        aws.ec2.SecurityGroupIngressArgs(
            protocol="tcp",
            from_port=22,
            to_port=22,
            cidr_blocks=["0.0.0.0/0"],
            description="SSH"
        ),
        aws.ec2.SecurityGroupIngressArgs(
            protocol="tcp",
            from_port=80,
            to_port=80,
            cidr_blocks=["0.0.0.0/0"],
            description="HTTP"
        ),
    ],
    egress=[
        aws.ec2.SecurityGroupEgressArgs(
            protocol="-1",
            from_port=0,
            to_port=0,
            cidr_blocks=["0.0.0.0/0"],
            description="Permitir todo el trafico de salida"
        )
    ],
    tags={
        "Name": f"{instance_name}-sg",
        "ManagedBy": "Pulumi"
    }
)

# 4. Creación de la instancia EC2
ec2_instance = aws.ec2.Instance(
    instance_name,
    instance_type=instance_type,
    ami=ubuntu_ami.id,
    vpc_security_group_ids=[sec_group.id],
    tags={
        "Name": instance_name,
        "ManagedBy": "Pulumi"
    }
)

# 5. Exportar datos útiles
pulumi.export("instance_id", ec2_instance.id)
pulumi.export("public_ip", ec2_instance.public_ip)
pulumi.export("public_dns", ec2_instance.public_dns)

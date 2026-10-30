"""
Módulo de Configuración de Pulumi para el Sistema de Asistencia.
"""
import pulumi
from dataclasses import dataclass

@dataclass
class AppConfig:
    proyecto: str
    region: str
    tipo_instancia: str
    mi_ip: str
    repo_url: str
    repo_rama: str
    admin_email: str
    admin_password: str
    backend_publico: bool

def load_config() -> AppConfig:
    config = pulumi.Config()
    aws_config = pulumi.Config("aws")

    return AppConfig(
        proyecto=config.get("proyecto") or "asistencia",
        region=aws_config.get("region") or "us-east-1",
        tipo_instancia=config.get("tipo_instancia") or "t3.micro",
        mi_ip=config.get("mi_ip") or "0.0.0.0/0",
        repo_url=config.get("repo_url") or "https://github.com/escobarnina/Mi-asistencia.git",
        repo_rama=config.get("repo_rama") or "feat/cloudinit",
        admin_email=config.get("admin_email") or "admin@ejemplo.com",
        admin_password=config.get_secret("admin_password") or "Asistencia-2026",
        backend_publico=config.get_bool("backend_publico") if config.get_bool("backend_publico") is not None else True,
    )

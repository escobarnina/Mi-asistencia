"""
Módulo para renderizar la plantilla cloud-init.yaml común para Backend y Frontend.
Soporta directivas %{ if rol == "..." ~}, %{ else ~}, %{ endif ~} y variables ${var_name}.
"""
import os
from typing import Dict, Any
import pulumi

def render_cloud_init(
    template_path: str,
    rol: str,
    variables: Dict[str, Any]
) -> pulumi.Output[str]:
    """
    Renderiza la plantilla cloud-init.yaml común resolviendo las directivas
    de plantilla idéntico a OpenTofu/Terraform.
    """
    if not os.path.isabs(template_path):
        template_path = os.path.join(os.path.dirname(__file__), "..", template_path)

    with open(template_path, "r", encoding="utf-8") as f:
        template_raw = f.read()

    def process_content(resolved_vars: dict) -> str:
        current_rol = resolved_vars.get("rol", rol)
        lines = template_raw.splitlines()
        result = []
        stack = [True]

        for line in lines:
            stripped = line.strip()
            if stripped.startswith('%{ if rol == "') and stripped.endswith('~}'):
                target = stripped.split('"')[1]
                stack.append(target == current_rol)
            elif stripped == '%{ else ~}':
                if len(stack) > 1:
                    stack[-1] = not stack[-1]
            elif stripped == '%{ endif ~}':
                if len(stack) > 1:
                    stack.pop()
            else:
                if all(stack):
                    result.append(line)

        text = "\n".join(result)

        # Sustituir variables ${nombre}
        for k, v in resolved_vars.items():
            text = text.replace(f"${{{k}}}", str(v))

        return text

    return pulumi.Output.all(rol=rol, **variables).apply(process_content)

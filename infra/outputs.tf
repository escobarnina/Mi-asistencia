output "url_frontend" {
  description = "Abre esto en el navegador (el sistema completo)."
  value       = var.crear_frontend ? "http://${aws_instance.frontend[0].public_ip}" : "(frontend no creado en AWS)"
}

output "url_backend_health" {
  description = "Prueba del backend publicado."
  value       = "http://${aws_instance.backend.public_ip}:8000/api/health"
}

output "backend_ip_publica" {
  value = aws_instance.backend.public_ip
}

output "ssh_backend" {
  value = "ssh -i ${var.proyecto}-llave.pem ubuntu@${aws_instance.backend.public_ip}"
}

output "ssh_frontend" {
  value = var.crear_frontend ? "ssh -i ${var.proyecto}-llave.pem ubuntu@${aws_instance.frontend[0].public_ip}" : ""
}

output "credenciales_admin" {
  value     = "${var.admin_email} / ${var.admin_password}"
  sensitive = true
}

output "aviso" {
  value = "Las VMs tardan ~5-8 minutos en instalar todo DESPUES del apply. Progreso: sudo tail -f /var/log/despliegue.log"
}

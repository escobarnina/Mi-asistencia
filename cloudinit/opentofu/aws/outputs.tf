output "url_frontend" {
  description = "Abre esto en el navegador (el frontend en puerto 80 sirviendo React y redirigiendo /api/)."
  value       = var.crear_frontend ? "http://${aws_instance.frontend[0].public_ip}" : "(frontend no creado en AWS)"
}

output "url_backend_health" {
  description = "Prueba de salud del backend publicado en puerto 8000."
  value       = "http://${aws_instance.backend.public_ip}:8000/api/health"
}

output "frontend_ip_publica" {
  description = "IP pública del servidor Frontend."
  value       = var.crear_frontend ? aws_instance.frontend[0].public_ip : ""
}

output "backend_ip_publica" {
  description = "IP pública del servidor Backend."
  value       = aws_instance.backend.public_ip
}

output "backend_ip_privada" {
  description = "IP privada con la que se comunica Nginx en la misma VPC."
  value       = aws_instance.backend.private_ip
}

output "ssh_frontend" {
  description = "Comando SSH para conectarse al servidor Frontend."
  value       = var.crear_frontend ? "ssh -i ${var.proyecto}-llave.pem ubuntu@${aws_instance.frontend[0].public_ip}" : ""
}

output "ssh_backend" {
  description = "Comando SSH para conectarse al servidor Backend."
  value       = "ssh -i ${var.proyecto}-llave.pem ubuntu@${aws_instance.backend.public_ip}"
}

output "credenciales_admin" {
  description = "Credenciales del administrador inicial."
  value       = "${var.admin_email} / ${var.admin_password}"
  sensitive   = true
}

output "aviso" {
  value = "Las VMs tardan ~4-6 minutos en instalar dependencias y compilar. Para ver el progreso por SSH: sudo tail -f /var/log/cloud-init-output.log"
}

variable "region" {
  description = "Región de AWS. us-east-1 (Virginia) es la más barata y tiene todo disponible."
  type        = string
  default     = "us-east-1"
}

variable "proyecto" {
  description = "Prefijo para nombrar los recursos."
  type        = string
  default     = "asistencia"
}

variable "tipo_instancia" {
  description = <<-EOT
    Tipo de VM. Cuentas AWS creadas DESDE el 15-jul-2025: t3.micro (plan con créditos).
    Cuentas más antiguas (capa gratuita de 12 meses): usa t2.micro en us-east-1.
    En la consola de EC2 el tipo correcto aparece con la etiqueta "Free tier eligible".
  EOT
  type        = string
  default     = "t3.micro"
}

variable "mi_ip" {
  description = "Tu IP pública en formato CIDR para permitir SSH (ej. 181.115.10.20/32). Averíguala en https://checkip.amazonaws.com"
  type        = string
  default     = "0.0.0.0/0"
}

variable "repo_url" {
  description = "Repositorio del proyecto."
  type        = string
  default     = "https://github.com/escobarnina/Mi-asistencia.git"
}

variable "repo_rama" {
  description = "Rama que se despliega."
  type        = string
  default     = "main"
}

variable "admin_email" {
  description = "Correo del administrador inicial (lo crea la semilla)."
  type        = string
  default     = "admin@ejemplo.com"
}

variable "admin_password" {
  description = "Contraseña del administrador inicial."
  type        = string
  sensitive   = true
}

variable "cargar_semilla" {
  description = "Si es true, corre 'npm run seed' (módulo de ejemplo + 2 estudiantes de prueba)."
  type        = bool
  default     = true
}

variable "crear_frontend" {
  description = "true = crea también la VM del frontend en AWS. false = solo backend (el frontend va en otra nube)."
  type        = bool
  default     = true
}

variable "frontend_ip_externa" {
  description = "Solo si el frontend está en OTRA nube: su IP pública en CIDR (ej. 51.75.1.2/32), para dejarla pasar al puerto 8000."
  type        = string
  default     = ""
}

variable "backend_publico" {
  description = "true = el puerto 8000 del backend queda abierto a internet (el docente pide backend 'publicado')."
  type        = bool
  default     = true
}
variable "role_arn" {
  description = "ARN del rol a asumir en la cuenta central (se define en terraform.tfvars)"
  type        = string
  default     = ""
}


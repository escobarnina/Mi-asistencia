variable "region" {
  description = "Región de AWS para almacenar el estado remoto"
  type        = string
  default     = "us-east-1"
}

variable "proyecto" {
  description = "Prefijo identificador para los recursos"
  type        = string
  default     = "asistencia"
}

# Lista de cuentas autorizadas para asumir el rol (puedes agregar tantas como quieras)
variable "cuentas_colaboradores" {
  description = "Lista de Account IDs de AWS de los compañeros que podrán colaborar"
  type        = list(string)
  default     = [
]
}
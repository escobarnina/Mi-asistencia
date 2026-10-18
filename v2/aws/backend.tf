terraform {
  backend "s3" {
    key     = "mi-asistencia/dev/terraform.tfstate"
    encrypt = true
  }
}
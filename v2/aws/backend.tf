# Ojo: dentro de un bloque backend NO se pueden usar variables.
# Copia aquí los valores que mostró "terraform output" al ejecutar v3/bootstrap/aws.
terraform {
  backend "s3" {
    bucket         = "asistencia-tfstate-vond4wuc"
    key            = "mi-asistencia/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "asistencia-tfstate-locks"
    encrypt        = true
  }
}

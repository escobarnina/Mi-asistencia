# Ojo: dentro de un bloque backend NO se pueden usar variables.
# Valores copiados del "terraform output" al ejecutar v2/bootstrap/aws.
terraform {
  backend "s3" {
    bucket         = "asistencia-tfstate-gqqauiyp"
    key            = "mi-asistencia/dev/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "asistencia-tfstate-locks"
    encrypt        = true
    role_arn       = "arn:aws:iam::168692730615:role/RolTerraformColaborador"
  }
}
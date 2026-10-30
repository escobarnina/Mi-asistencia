
# Obtiene la información de TU propia cuenta actual
data "aws_caller_identity" "current" {}

# Generador de sufijo aleatorio para unicidad en S3
resource "random_string" "sufijo" {
  length  = 8
  special = false
  upper   = false
}

# 1. Bucket S3 para almacenar el .tfstate
resource "aws_s3_bucket" "tfstate" {
  #checkov:skip=CKV_AWS_18:El bucket de tfstate no requiere access logging en dev
  #checkov:skip=CKV_AWS_144:No se requiere replicacion cross-region para tfstate en dev
  #checkov:skip=CKV_AWS_145:Se utiliza cifrado por defecto AES256 de AWS para evitar costos de KMS CMK
  #checkov:skip=CKV2_AWS_62:No se requieren notificaciones por eventos S3 en el bucket tfstate
  #checkov:skip=CKV2_AWS_61:Gestionado por recurso aws_s3_bucket_lifecycle_configuration
  bucket        = "${var.proyecto}-tfstate-${random_string.sufijo.result}"
  force_destroy = true #Cambiar a true para vaciar los archivos dentro del bucket S3

  lifecycle {
    prevent_destroy = false #Cambiar a false para poder borrar el bucket S3
  }
}


# Ciclo de vida para versiones de estado S3
resource "aws_s3_bucket_lifecycle_configuration" "tfstate" {
  #checkov:skip=CKV_AWS_300:Regla de ciclo de vida adecuada para versiones de tfstate
  bucket = aws_s3_bucket.tfstate.id

  rule {
    id     = "limpiar-versiones-antiguas"
    status = "Enabled"

    filter {}

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Versionado en S3
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Cifrado en reposo (AES256)
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bloqueo de acceso público en S3
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. Tabla DynamoDB para el State Locking
resource "aws_dynamodb_table" "tfstate_locks" {
  #checkov:skip=CKV_AWS_119:Se utiliza cifrado por defecto gestionado por AWS para evitar costos de KMS CMK
  name         = "${var.proyecto}-tfstate-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  point_in_time_recovery {
    enabled = true
  }

  attribute {
    name = "LockID"
    type = "S"
  }
}

# 3. ROL IAM PARA COLABORADORES MULTI-CUENTA
resource "aws_iam_role" "colaborador" {
  name = "RolTerraformColaborador"

  # Trust relationships (Política de confianza)
  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          AWS = concat(
            [data.aws_caller_identity.current.arn],                           # Tu propia cuenta
            [for id in var.cuentas_colaboradores : "arn:aws:iam::${id}:root"] # Cuentas de tus compañeros
          )
        }
        Action = "sts:AssumeRole"
      }
    ]
  })
}

# 4. Asignar AdministratorAccess al Rol
resource "aws_iam_role_policy_attachment" "admin_access" {
  #checkov:skip=CKV_AWS_274:Rol de bootstrap destinado a la creacion completa de infraestructura por Terraform
  role       = aws_iam_role.colaborador.name
  policy_arn = "arn:aws:iam::aws:policy/AdministratorAccess"
}

# 5. Generar automaticamente backend.hcl para opentofu/aws
resource "local_file" "backend_config" {
  filename = "${path.module}/../aws/backend.hcl"
  content  = <<-EOT
    bucket         = "${aws_s3_bucket.tfstate.bucket}"
    key            = "mi-asistencia/dev/terraform.tfstate"
    region         = "${var.region}"
    dynamodb_table = "${aws_dynamodb_table.tfstate_locks.name}"
    encrypt        = true
    role_arn       = "${aws_iam_role.colaborador.arn}"
  EOT
}



# 6. Generar automaticamente terraform.tfvars local para opentofu/aws (ignorado por Git)
resource "local_file" "tfvars_app" {
  filename = "${path.module}/../aws/terraform.tfvars"
  content  = <<-EOT
    # Generado automaticamente por el modulo bootstrap
    region         = "${var.region}"
    tipo_instancia = "t3.micro"
    mi_ip          = "0.0.0.0/0"
    admin_password = "CambiarPasswordSeguro123!"
    role_arn       = "${aws_iam_role.colaborador.arn}"
  EOT
}

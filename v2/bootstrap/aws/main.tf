terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }
}

variable "region" {
  description = "Región de AWS para almacenar el estado remoto"
  type        = string
  default     = "us-east-1"
}

variable "proyecto" {
  description = "Prefijo identificador para el bucket y la tabla"
  type        = string
  default     = "asistencia"
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      proyecto = var.proyecto
      uso      = "terraform-state"
    }
  }
}

# Generador de sufijo aleatorio para asegurar unicidad global en S3
resource "random_string" "sufijo" {
  length  = 8
  special = false
  upper   = false
}

# 1. Bucket S3 para almacenar el .tfstate
resource "aws_s3_bucket" "tfstate" {
  bucket        = "${var.proyecto}-tfstate-${random_string.sufijo.result}"
  force_destroy = false

  lifecycle {
    prevent_destroy = true
  }
}

# Versionado para recuperar estados previos si se corrompe o borra
resource "aws_s3_bucket_versioning" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Cifrado en reposo por defecto (AES256)
resource "aws_s3_bucket_server_side_encryption_configuration" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

# Bloqueo total de acceso público
resource "aws_s3_bucket_public_access_block" "tfstate" {
  bucket = aws_s3_bucket.tfstate.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# 2. Tabla DynamoDB para el State Locking (evita ejecuciones simultáneas)
resource "aws_dynamodb_table" "tfstate_locks" {
  name         = "${var.proyecto}-tfstate-locks"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "LockID"

  attribute {
    name = "LockID"
    type = "S"
  }
}

# Valores a copiar en v3/aws/backend.tf
output "s3_bucket_name" {
  description = "Nombre del bucket S3 para el backend remoto"
  value       = aws_s3_bucket.tfstate.bucket
}

output "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB para locking"
  value       = aws_dynamodb_table.tfstate_locks.name
}

output "region" {
  description = "Región de AWS configurada"
  value       = var.region
}

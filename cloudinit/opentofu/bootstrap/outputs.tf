# 5. Salidas útiles para copiar en el backend.tf
output "s3_bucket_name" {
  description = "Nombre del bucket S3 para el backend remoto"
  value       = aws_s3_bucket.tfstate.bucket
}

output "dynamodb_table_name" {
  description = "Nombre de la tabla DynamoDB para locking"
  value       = aws_dynamodb_table.tfstate_locks.name
}

output "role_arn" {
  description = "ARN del rol que deben asumir los colaboradores"
  value       = aws_iam_role.colaborador.arn
}

output "region" {
  description = "Región de AWS configurada"
  value       = var.region
}
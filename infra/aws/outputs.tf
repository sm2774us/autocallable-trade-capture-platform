output "bootstrap_brokers_sasl_iam" {
  description = "Value for KAFKA_BOOTSTRAP."
  value       = aws_msk_cluster.this.bootstrap_brokers_sasl_iam
}

output "db_endpoint" {
  description = "Host and port for DB_URL."
  value       = aws_db_instance.capture.endpoint
}

output "app_role_arn" {
  description = "Annotate the Kubernetes ServiceAccount with this role."
  value       = module.app_irsa.iam_role_arn
}

output "ecr_repository_url" {
  description = "Push the image here."
  value       = aws_ecr_repository.app.repository_url
}

output "kafka_bootstrap" {
  description = "Value for KAFKA_BOOTSTRAP (port 9092, SASL_SSL with OAUTHBEARER)."
  value       = "bootstrap.${google_managed_kafka_cluster.main.cluster_id}.${var.region}.managedkafka.${var.project_id}.cloud.goog:9092"
}

output "db_connection_name" {
  description = "Cloud SQL instance connection name."
  value       = google_sql_database_instance.capture.connection_name
}

output "app_service_account" {
  description = "Annotate the Kubernetes ServiceAccount with this email."
  value       = google_service_account.app.email
}

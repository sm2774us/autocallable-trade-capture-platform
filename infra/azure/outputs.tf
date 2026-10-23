output "kafka_bootstrap" {
  description = "Value for KAFKA_BOOTSTRAP (port 9093, SASL_SSL, OAUTHBEARER)."
  value       = "${azurerm_eventhub_namespace.main.name}.servicebus.windows.net:9093"
}

output "db_fqdn" {
  description = "Host for DB_URL."
  value       = azurerm_postgresql_flexible_server.capture.fqdn
}

output "app_client_id" {
  description = "Annotate the Kubernetes ServiceAccount with this client ID."
  value       = azurerm_user_assigned_identity.app.client_id
}

locals {
  name  = "trade-capture-${var.env}"
  alnum = replace(local.name, "-", "")
}

resource "azurerm_resource_group" "main" {
  name     = "rg-${local.name}"
  location = var.location
}

# ---------------------------------------------------------------- network
resource "azurerm_virtual_network" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  address_space       = ["10.80.0.0/16"]
}

resource "azurerm_subnet" "aks" {
  name                 = "aks"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.80.0.0/20"]
}

resource "azurerm_subnet" "db" {
  name                 = "db"
  resource_group_name  = azurerm_resource_group.main.name
  virtual_network_name = azurerm_virtual_network.main.name
  address_prefixes     = ["10.80.16.0/24"]

  delegation {
    name = "postgres"

    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

# ---------------------------------------------------------------- Kubernetes (AKS)
resource "azurerm_kubernetes_cluster" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  dns_prefix          = local.name
  sku_tier            = "Standard"

  private_cluster_enabled   = true
  oidc_issuer_enabled       = true
  workload_identity_enabled = true
  azure_policy_enabled      = true

  automatic_upgrade_channel = "patch"

  default_node_pool {
    name                 = "system"
    vm_size              = "Standard_D4ds_v5"
    vnet_subnet_id       = azurerm_subnet.aks.id
    zones                = ["1", "2", "3"]
    auto_scaling_enabled = true
    min_count            = 3
    max_count            = 9
    os_sku               = "AzureLinux" # Microsoft's minimal, container-optimised node OS
  }

  identity {
    type = "SystemAssigned"
  }

  network_profile {
    network_plugin      = "azure"
    network_plugin_mode = "overlay"
    network_data_plane  = "cilium"
    network_policy      = "cilium" # enforces the NetworkPolicy objects
  }
}

# ---------------------------------------------------------------- PostgreSQL (Flexible Server)
resource "azurerm_private_dns_zone" "postgres" {
  name                = "${local.name}.private.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_private_dns_zone_virtual_network_link" "postgres" {
  name                  = "postgres"
  resource_group_name   = azurerm_resource_group.main.name
  private_dns_zone_name = azurerm_private_dns_zone.postgres.name
  virtual_network_id    = azurerm_virtual_network.main.id
}

resource "azurerm_postgresql_flexible_server" "capture" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  version             = "16"
  sku_name            = "GP_Standard_D4ds_v5"
  storage_mb          = 262144
  zone                = "1"

  delegated_subnet_id           = azurerm_subnet.db.id
  private_dns_zone_id           = azurerm_private_dns_zone.postgres.id
  public_network_access_enabled = false

  backup_retention_days        = 14
  geo_redundant_backup_enabled = true

  high_availability {
    mode                      = "ZoneRedundant"
    standby_availability_zone = "2"
  }

  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false # Entra ID tokens only: no password to leak
    tenant_id                     = var.tenant_id
  }

  depends_on = [azurerm_private_dns_zone_virtual_network_link.postgres]
}

resource "azurerm_postgresql_flexible_server_database" "capture" {
  name      = "capture"
  server_id = azurerm_postgresql_flexible_server.capture.id
}

# ---------------------------------------------------------------- Kafka-compatible endpoint (Event Hubs)
resource "azurerm_eventhub_namespace" "main" {
  name                = local.name
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
  sku                 = "Premium" # Kafka endpoint needs Standard or above; verify feature set per tier
  capacity            = 1
  minimum_tls_version = "1.2"

  local_authentication_enabled = false # Entra ID only
}

resource "azurerm_eventhub" "trades" {
  name            = "trades.normalized" # an event hub is the Kafka topic
  namespace_id    = azurerm_eventhub_namespace.main.id
  partition_count = 12
}

# ---------------------------------------------------------------- registry and secrets
resource "azurerm_container_registry" "main" {
  name                    = "${local.alnum}acr"
  location                = azurerm_resource_group.main.location
  resource_group_name     = azurerm_resource_group.main.name
  sku                     = "Premium"
  admin_enabled           = false
  zone_redundancy_enabled = true
}

resource "azurerm_key_vault" "main" {
  name                       = "kv-${local.alnum}"
  location                   = azurerm_resource_group.main.location
  resource_group_name        = azurerm_resource_group.main.name
  tenant_id                  = var.tenant_id
  sku_name                   = "standard"
  rbac_authorization_enabled = true
  purge_protection_enabled   = true
}

# ---------------------------------------------------------------- workload identity
resource "azurerm_user_assigned_identity" "app" {
  name                = "${local.name}-app"
  location            = azurerm_resource_group.main.location
  resource_group_name = azurerm_resource_group.main.name
}

resource "azurerm_federated_identity_credential" "app" {
  name      = "aks-trade-capture"
  parent_id = azurerm_user_assigned_identity.app.id
  audience  = ["api://AzureADTokenExchange"]
  issuer    = azurerm_kubernetes_cluster.main.oidc_issuer_url
  subject   = "system:serviceaccount:capture:trade-capture"
}

resource "azurerm_role_assignment" "eventhubs_receiver" {
  scope                = azurerm_eventhub_namespace.main.id
  role_definition_name = "Azure Event Hubs Data Receiver"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_role_assignment" "eventhubs_sender" {
  scope                = azurerm_eventhub_namespace.main.id
  role_definition_name = "Azure Event Hubs Data Sender"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_role_assignment" "keyvault_reader" {
  scope                = azurerm_key_vault.main.id
  role_definition_name = "Key Vault Secrets User"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

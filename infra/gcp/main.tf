locals {
  name = "trade-capture-${var.env}"
}

resource "google_project_service" "apis" {
  for_each = toset([
    "container.googleapis.com",
    "sqladmin.googleapis.com",
    "servicenetworking.googleapis.com",
    "artifactregistry.googleapis.com",
    "secretmanager.googleapis.com",
    "managedkafka.googleapis.com",
  ])

  service            = each.value
  disable_on_destroy = false
}

# ---------------------------------------------------------------- network
resource "google_compute_network" "main" {
  name                    = local.name
  auto_create_subnetworks = false
}

resource "google_compute_subnetwork" "main" {
  name                     = local.name
  region                   = var.region
  network                  = google_compute_network.main.id
  ip_cidr_range            = "10.50.0.0/20"
  private_ip_google_access = true

  secondary_ip_range {
    range_name    = "pods"
    ip_cidr_range = "10.60.0.0/16"
  }

  secondary_ip_range {
    range_name    = "services"
    ip_cidr_range = "10.70.0.0/20"
  }

  log_config {
    aggregation_interval = "INTERVAL_5_SEC"
    flow_sampling        = 0.5
  }
}

resource "google_compute_router" "main" {
  name    = local.name
  region  = var.region
  network = google_compute_network.main.id
}

resource "google_compute_router_nat" "main" {
  name                               = local.name
  router                             = google_compute_router.main.name
  region                             = var.region
  nat_ip_allocate_option             = "AUTO_ONLY"
  source_subnetwork_ip_ranges_to_nat = "ALL_SUBNETWORKS_ALL_IP_RANGES"
}

# ---------------------------------------------------------------- Kubernetes (GKE Autopilot)
resource "google_container_cluster" "main" {
  name     = local.name
  location = var.region

  enable_autopilot    = true # Google manages nodes: hardened image, auto-upgrade, no node SSH
  deletion_protection = true

  network    = google_compute_network.main.id
  subnetwork = google_compute_subnetwork.main.id

  ip_allocation_policy {
    cluster_secondary_range_name  = "pods"
    services_secondary_range_name = "services"
  }

  private_cluster_config {
    enable_private_nodes    = true
    enable_private_endpoint = true
  }

  release_channel {
    channel = "REGULAR"
  }

  binary_authorization {
    evaluation_mode = "PROJECT_SINGLETON_POLICY_ENFORCE"
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------- PostgreSQL (Cloud SQL)
resource "google_compute_global_address" "private_services" {
  name          = "${local.name}-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 20
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]
}

resource "google_sql_database_instance" "capture" {
  name                = local.name
  region              = var.region
  database_version    = "POSTGRES_16"
  deletion_protection = true

  settings {
    tier              = "db-custom-4-16384"
    availability_type = "REGIONAL" # synchronous standby in another zone
    disk_autoresize   = true

    ip_configuration {
      ipv4_enabled    = false
      private_network = google_compute_network.main.id
    }

    backup_configuration {
      enabled                        = true
      point_in_time_recovery_enabled = true
    }
  }

  depends_on = [google_service_networking_connection.private_services]
}

resource "google_sql_database" "capture" {
  name     = "capture"
  instance = google_sql_database_instance.capture.name
}

# ---------------------------------------------------------------- Kafka (Managed Service for Apache Kafka)
resource "google_managed_kafka_cluster" "main" {
  cluster_id = local.name
  location   = var.region

  capacity_config {
    vcpu_count   = 3
    memory_bytes = 3221225472
  }

  gcp_config {
    access_config {
      network_configs {
        subnet = google_compute_subnetwork.main.id
      }
    }
  }

  depends_on = [google_project_service.apis]
}

resource "google_managed_kafka_topic" "trades" {
  topic_id           = "trades.normalized"
  cluster            = google_managed_kafka_cluster.main.cluster_id
  location           = var.region
  partition_count    = 12
  replication_factor = 3
}

# ---------------------------------------------------------------- registry and secrets
resource "google_artifact_registry_repository" "app" {
  repository_id = "trade-capture"
  location      = var.region
  format        = "DOCKER"

  docker_config {
    immutable_tags = true
  }

  depends_on = [google_project_service.apis]
}

resource "google_secret_manager_secret" "db_password" {
  secret_id = "${local.name}-db-password"

  replication {
    auto {}
  }

  depends_on = [google_project_service.apis]
}

# ---------------------------------------------------------------- workload identity
resource "google_service_account" "app" {
  account_id   = "${local.name}-app"
  display_name = "trade-capture runtime"
}

resource "google_project_iam_member" "app_roles" {
  for_each = toset([
    "roles/cloudsql.client",
    "roles/managedkafka.client",
    "roles/secretmanager.secretAccessor",
  ])

  project = var.project_id
  role    = each.value
  member  = "serviceAccount:${google_service_account.app.email}"
}

resource "google_service_account_iam_member" "workload_identity" {
  service_account_id = google_service_account.app.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "serviceAccount:${var.project_id}.svc.id.goog[capture/trade-capture]"
}

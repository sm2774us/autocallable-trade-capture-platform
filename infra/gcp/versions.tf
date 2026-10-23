terraform {
  required_version = ">= 1.8.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 6.0"
    }
  }

  backend "gcs" {
    bucket = "acme-tofu-state"
    prefix = "trade-capture/gcp"
  }

  encryption {
    key_provider "gcp_kms" "state" {
      kms_encryption_key = "projects/acme-sec/locations/us/keyRings/tofu/cryptoKeys/state"
      key_length         = 32
    }

    method "aes_gcm" "state" {
      keys = key_provider.gcp_kms.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

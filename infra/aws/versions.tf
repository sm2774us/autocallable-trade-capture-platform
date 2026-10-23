terraform {
  required_version = ">= 1.8.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Remote state with locking. S3 native locking or a DynamoDB table both work.
  backend "s3" {
    bucket         = "acme-tofu-state"
    key            = "trade-capture/aws/terraform.tfstate"
    region         = "us-east-1"
    dynamodb_table = "acme-tofu-locks"
    encrypt        = true
  }

  # OpenTofu-only: client-side state encryption. State holds connection strings and ARNs,
  # so it is encrypted before it ever reaches the bucket. Terraform has no equivalent.
  encryption {
    key_provider "aws_kms" "state" {
      kms_key_id = "alias/tofu-state"
      region     = "us-east-1"
      key_spec   = "AES_256"
    }

    method "aes_gcm" "state" {
      keys = key_provider.aws_kms.state
    }

    state {
      method   = method.aes_gcm.state
      enforced = true
    }
  }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = {
      application = "trade-capture"
      environment = var.env
      managed-by  = "opentofu"
    }
  }
}

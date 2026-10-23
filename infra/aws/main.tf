data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  name = "trade-capture-${var.env}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 3)
}

# ---------------------------------------------------------------- network
module "vpc" {
  source  = "terraform-aws-modules/vpc/aws"
  version = "~> 5.0"

  name = local.name
  cidr = var.vpc_cidr
  azs  = local.azs

  private_subnets  = [for i in range(3) : cidrsubnet(var.vpc_cidr, 4, i)]
  public_subnets   = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, 200 + i)]
  database_subnets = [for i in range(3) : cidrsubnet(var.vpc_cidr, 8, 210 + i)]

  enable_nat_gateway     = true
  one_nat_gateway_per_az = true # an AZ outage must not take out egress for the others

  enable_flow_log                      = true
  create_flow_log_cloudwatch_log_group = true
  create_flow_log_cloudwatch_iam_role  = true

  private_subnet_tags = {
    "kubernetes.io/role/internal-elb" = 1
  }
}

# ---------------------------------------------------------------- Kubernetes
module "eks" {
  source  = "terraform-aws-modules/eks/aws"
  version = "~> 20.0"

  cluster_name    = local.name
  cluster_version = "1.31"

  vpc_id     = module.vpc.vpc_id
  subnet_ids = module.vpc.private_subnets

  cluster_endpoint_public_access = false
  enable_irsa                    = true

  eks_managed_node_groups = {
    main = {
      ami_type       = "BOTTLEROCKET_x86_64" # minimal, immutable, container-only node OS
      instance_types = ["m7i.xlarge"]
      min_size       = 3
      max_size       = 9
      desired_size   = 3
    }
  }
}

# ---------------------------------------------------------------- security groups
resource "aws_security_group" "msk" {
  name_prefix = "${local.name}-msk-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "Kafka over TLS with IAM auth from the cluster nodes"
    from_port       = 9098
    to_port         = 9098
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }
}

resource "aws_security_group" "rds" {
  name_prefix = "${local.name}-rds-"
  vpc_id      = module.vpc.vpc_id

  ingress {
    description     = "PostgreSQL from the cluster nodes"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [module.eks.node_security_group_id]
  }
}

# ---------------------------------------------------------------- Kafka (MSK)
resource "aws_kms_key" "data" {
  description         = "${local.name} data at rest"
  enable_key_rotation = true
}

resource "aws_msk_configuration" "this" {
  name           = local.name
  kafka_versions = ["3.7.x"]

  server_properties = <<-PROPS
    auto.create.topics.enable=false
    default.replication.factor=3
    min.insync.replicas=2
    unclean.leader.election.enable=false
    num.partitions=12
  PROPS
}

resource "aws_msk_cluster" "this" {
  cluster_name           = local.name
  kafka_version          = "3.7.x"
  number_of_broker_nodes = 3

  broker_node_group_info {
    instance_type   = var.kafka_broker_type
    client_subnets  = module.vpc.private_subnets
    security_groups = [aws_security_group.msk.id]

    storage_info {
      ebs_storage_info {
        volume_size = 500
      }
    }
  }

  configuration_info {
    arn      = aws_msk_configuration.this.arn
    revision = aws_msk_configuration.this.latest_revision
  }

  client_authentication {
    sasl {
      iam = true
    }
  }

  encryption_info {
    encryption_at_rest_kms_key_arn = aws_kms_key.data.arn

    encryption_in_transit {
      client_broker = "TLS"
      in_cluster    = true
    }
  }
}

# ---------------------------------------------------------------- PostgreSQL (RDS)
resource "aws_db_instance" "capture" {
  identifier     = local.name
  engine         = "postgres"
  engine_version = "16"
  instance_class = "db.m7g.large"

  allocated_storage     = 200
  max_allocated_storage = 1000
  storage_encrypted     = true
  kms_key_id            = aws_kms_key.data.arn

  db_name                     = "capture"
  username                    = "capture_admin"
  manage_master_user_password = true # RDS keeps the password in Secrets Manager; not in state

  multi_az               = true
  db_subnet_group_name   = module.vpc.database_subnet_group_name
  vpc_security_group_ids = [aws_security_group.rds.id]

  backup_retention_period      = 14
  deletion_protection          = true
  performance_insights_enabled = true
  skip_final_snapshot          = false
  final_snapshot_identifier    = "${local.name}-final"
}

# ---------------------------------------------------------------- registry
resource "aws_ecr_repository" "app" {
  name                 = "trade-capture"
  image_tag_mutability = "IMMUTABLE" # a tag always means the same bytes

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.data.arn
  }
}

# ---------------------------------------------------------------- workload identity (IRSA)
resource "aws_iam_policy" "app" {
  name = "${local.name}-app"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "KafkaDataPlane"
        Effect = "Allow"
        Action = [
          "kafka-cluster:Connect",
          "kafka-cluster:DescribeTopic",
          "kafka-cluster:ReadData",
          "kafka-cluster:WriteData",
          "kafka-cluster:AlterGroup",
          "kafka-cluster:DescribeGroup",
        ]
        Resource = [
          aws_msk_cluster.this.arn,
          "${replace(aws_msk_cluster.this.arn, ":cluster/", ":topic/")}/*",
          "${replace(aws_msk_cluster.this.arn, ":cluster/", ":group/")}/*",
        ]
      },
      {
        Sid      = "ReadDatabaseSecret"
        Effect   = "Allow"
        Action   = ["secretsmanager:GetSecretValue"]
        Resource = [aws_db_instance.capture.master_user_secret[0].secret_arn]
      },
    ]
  })
}

module "app_irsa" {
  source  = "terraform-aws-modules/iam/aws//modules/iam-role-for-service-accounts-eks"
  version = "~> 5.0"

  role_name        = "${local.name}-app"
  role_policy_arns = { app = aws_iam_policy.app.arn }

  oidc_providers = {
    main = {
      provider_arn               = module.eks.oidc_provider_arn
      namespace_service_accounts = ["capture:trade-capture"]
    }
  }
}

variable "env" {
  description = "Environment name: dev, uat or prod."
  type        = string

  validation {
    condition     = contains(["dev", "uat", "prod"], var.env)
    error_message = "env must be dev, uat or prod."
  }
}

variable "region" {
  description = "AWS region."
  type        = string
  default     = "us-east-1"
}

variable "vpc_cidr" {
  description = "CIDR block of the VPC."
  type        = string
  default     = "10.40.0.0/16"
}

variable "kafka_broker_type" {
  description = "MSK broker instance type."
  type        = string
  default     = "kafka.m7g.large"
}

variable "project_id" {
  description = "GCP project that hosts the environment."
  type        = string
}

variable "env" {
  description = "Environment name: dev, uat or prod."
  type        = string
}

variable "region" {
  description = "GCP region."
  type        = string
  default     = "us-east4"
}

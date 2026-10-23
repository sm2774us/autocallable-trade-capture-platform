variable "subscription_id" {
  description = "Azure subscription that hosts the environment."
  type        = string
}

variable "tenant_id" {
  description = "Microsoft Entra tenant ID."
  type        = string
}

variable "env" {
  description = "Environment name: dev, uat or prod."
  type        = string
}

variable "location" {
  description = "Azure region."
  type        = string
  default     = "eastus2"
}

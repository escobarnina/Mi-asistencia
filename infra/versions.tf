# Funciona igual con Terraform (>= 1.5) y con OpenTofu (>= 1.6).
terraform {
  required_version = ">= 1.5"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
    tls = {
      source  = "hashicorp/tls"
      version = "~> 4.0"
    }
    local = {
      source  = "hashicorp/local"
      version = "~> 2.5"
    }
  }
}

provider "aws" {
  region = var.region
  # Las credenciales se toman de "aws configure" (~/.aws/credentials).
  # Nunca escribas tu Access Key aquí.

  default_tags {
    tags = {
      proyecto = var.proyecto
      gestion  = "2-2026"
    }
  }
}

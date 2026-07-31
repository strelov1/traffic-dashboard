terraform {
  required_version = ">= 1.5"

  required_providers {
    hcloud = {
      source  = "hetznercloud/hcloud"
      version = "~> 1.48"
    }

    random = {
      source  = "hashicorp/random"
      version = "~> 3.6"
    }
  }

  # State is local and this configuration is applied by a person, deliberately.
  # Infrastructure here is one server that changes rarely; the thing that
  # changes on every merge is the application, and that is what the deploy
  # workflow automates. Wiring `terraform apply` into CI would need remote state
  # and would make a merge able to replace a machine, which is not a trade worth
  # making for a single host.
  #
  # For a team, uncomment and point at an S3-compatible bucket:
  #
  # backend "s3" {
  #   bucket = "..."
  #   key    = "traffic-dashboard/terraform.tfstate"
  #   region = "auto"
  # }
}

provider "hcloud" {
  token = var.hcloud_token
}

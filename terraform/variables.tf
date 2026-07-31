variable "hcloud_token" {
  description = "Hetzner Cloud API token with read and write access."
  type        = string
  sensitive   = true
}

variable "public_domain" {
  description = "Domain the dashboard is served on. Its A record must point at the server's address before Caddy can obtain a certificate."
  type        = string
}

variable "ssh_public_key" {
  description = "Public key authorised on the server. The matching private key is what the deploy workflow uses."
  type        = string
}

variable "repository_url" {
  description = "Repository the server clones on first boot and pulls from on deploy."
  type        = string
  default     = "https://github.com/strelov1/traffic-dashboard"
}

variable "server_type" {
  description = "Hetzner server type. cx22 is two shared cores and 4 GB, which the load test shows carries the brief's top tier with room."
  type        = string
  default     = "cx22"
}

variable "location" {
  description = "Hetzner location. hel1 is Helsinki."
  type        = string
  default     = "hel1"
}

variable "seed_events" {
  description = "Detections generated on first boot, when the table is empty."
  type        = number
  default     = 250000
}

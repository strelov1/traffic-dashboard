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
  description = "Administrator public key, authorised without restriction."
  type        = string
}

variable "deploy_public_key" {
  description = "Public half of the key the deploy workflow uses. Installed as a forced command, so it can run the deploy and nothing else."
  type        = string
}

variable "repository_url" {
  description = "Repository the server clones on first boot and pulls from on deploy."
  type        = string
  default     = "https://github.com/strelov1/traffic-dashboard"
}

variable "server_type" {
  description = "Hetzner server type. cpx21 is three shared cores and 4 GB: the load test shows two cores carry the brief's top tier, and the memory is for building the images on the box. Verified against a live account — the cx line is not offered on every one, so check `hcloud server-type list` before changing this."
  type        = string
  default     = "cpx21"
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

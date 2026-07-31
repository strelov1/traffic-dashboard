output "ipv4" {
  description = "Point the domain's A record here, then Caddy can obtain a certificate."
  value       = hcloud_server.app.ipv4_address
}

output "url" {
  description = "Where the dashboard answers once DNS resolves."
  value       = "https://${var.public_domain}"
}

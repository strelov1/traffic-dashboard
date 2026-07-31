resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "hcloud_firewall" "web" {
  name = "traffic-dashboard"

  # Only what a public host needs. The application's own ports are bound to
  # loopback as well; a firewall rule and a bind address fail in different ways,
  # so both are set.
  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "22"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "80"
    source_ips = ["0.0.0.0/0", "::/0"]
  }

  rule {
    direction  = "in"
    protocol   = "tcp"
    port       = "443"
    source_ips = ["0.0.0.0/0", "::/0"]
  }
}

resource "hcloud_server" "app" {
  name        = "traffic-dashboard"
  image       = "ubuntu-24.04"
  server_type = var.server_type
  location    = var.location

  # Keys are handed to cloud-init rather than registered as hcloud_ssh_key
  # resources: Hetzner enforces uniqueness on the key material across the whole
  # account, so a key already present for another project would fail the apply.
  # cloud-init also lets the deploy key carry its forced command, which the
  # provider's ssh_keys cannot express.
  firewall_ids = [hcloud_firewall.web.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    public_domain     = var.public_domain
    repository_url    = var.repository_url
    seed_events       = var.seed_events
    postgres_password = random_password.postgres.result
    admin_public_key  = var.ssh_public_key
    deploy_public_key = var.deploy_public_key
  })

  # Changing user_data replaces the server, which is the honest behaviour:
  # cloud-init only runs on first boot, so an edited file would otherwise
  # describe a machine that never ran it.
}

resource "random_password" "postgres" {
  length  = 32
  special = false
}

resource "hcloud_ssh_key" "deploy" {
  name       = "traffic-dashboard"
  public_key = var.ssh_public_key
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

  ssh_keys     = [hcloud_ssh_key.deploy.id]
  firewall_ids = [hcloud_firewall.web.id]

  user_data = templatefile("${path.module}/cloud-init.yaml.tftpl", {
    public_domain     = var.public_domain
    repository_url    = var.repository_url
    seed_events       = var.seed_events
    postgres_password = random_password.postgres.result
  })

  # Changing user_data replaces the server, which is the honest behaviour:
  # cloud-init only runs on first boot, so an edited file would otherwise
  # describe a machine that never ran it.
}

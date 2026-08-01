# Deployment

Two tools, one boundary between them: Terraform describes the machine,
`docker-compose.yml` describes what runs on it. Neither describes the other, so
nothing is written down twice.

```
terraform/               hcloud server, firewall, ssh key, cloud-init
docker-compose.yml       the application
docker-compose.prod.yml  adds Caddy, which obtains and renews its own certificate
deploy/host-deploy.sh    the only command the deploy key may run
```

## Provisioning

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # token, domain, public key
terraform init && terraform apply
```

Cloud-init installs Docker, clones this repository, and brings the stack up.
Point the domain's A record at the printed address and Caddy issues the
certificate on first request — no certbot, no cron, no manual DNS step.

State is local and apply is run by a person, deliberately. The infrastructure is
one server that changes rarely; what changes on every merge is the application.
Wiring `terraform apply` into CI would need remote state and would let a merge
replace a machine, which is not a trade worth making for a single host.

## Releases

Push to `main` → CI runs lint, typecheck, tests, and both image builds → Deploy
runs only if CI passed. It rolls the host forward to that commit, waits for
`/api/health` to report the database up, and rolls back to the previous commit
if it does not within two minutes (thirty attempts, four seconds apart, in
`deploy/host-deploy.sh`).

The deploy key is restricted to a **forced command**: it can run
`deploy/host-deploy.sh` and nothing else — no shell, no port forwarding. The
commit arrives through `SSH_ORIGINAL_COMMAND`, which is attacker-controlled by
definition, and is matched against `^[0-9a-f]{40}$` before it reaches `git`.
That matters because the demo currently shares a host with unrelated production;
a key that leaks is a redeploy, not a machine.

Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` in the repository's
Actions secrets. Terraform reads `hcloud_token` from `terraform.tfvars`, which
is not committed.

## One origin behind the proxy

`PUBLIC_ORIGIN` sets both the origin the frontend bundle is built against and
the single origin the API allows, so the browser never makes a cross-origin
request in production. Pair it with host-scoped ports — `API_PORT=127.0.0.1:3390`,
`WEB_PORT=127.0.0.1:8090` — so nothing is reachable except through the proxy.
`.env.example` carries both, commented, with the reason at each.

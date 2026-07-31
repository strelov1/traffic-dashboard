#!/usr/bin/env bash
# Prepares an existing host — one already running nginx for something else — to
# serve this stack and accept deploys.
#
# The alternative is terraform/, which provisions a dedicated machine where Caddy
# handles TLS and none of this is needed. This path exists because the demo
# shares a host, and because everything it does was otherwise living only on that
# server, reproducible by memory alone.
#
#   PUBLIC_DOMAIN=traffic.example.com ./bootstrap.sh /path/to/deploy-key.pub
#
# Idempotent: safe to re-run.
set -euo pipefail

DOMAIN=${PUBLIC_DOMAIN:?set PUBLIC_DOMAIN}
DEPLOY_KEY_FILE=${1:?pass the path to the public half of the deploy key}
DIR=${DEPLOY_DIR:-/opt/traffic-dashboard}
REPO=${REPO_URL:-https://github.com/strelov1/traffic-dashboard}

# Its own certbot directories. The host-wide renew can be blocked indefinitely
# by any single certificate configured with a manual DNS hook, and one blocked
# renewal silently stops every other one.
CERT_ROOT=/etc/letsencrypt-traffic

echo "==> checkout"
[ -d "$DIR/.git" ] || git clone "$REPO" "$DIR"
git -C "$DIR" fetch --quiet origin
git -C "$DIR" reset --quiet --hard origin/main

echo "==> environment"
if [ ! -f "$DIR/.env" ]; then
  cat > "$DIR/.env" <<EOF
PUBLIC_ORIGIN=https://$DOMAIN
# Loopback-scoped: nginx is the only way in.
API_PORT=127.0.0.1:3390
WEB_PORT=127.0.0.1:8091
SEED_EVENTS=250000
POSTGRES_PASSWORD=$(openssl rand -hex 16)
EOF
  chmod 600 "$DIR/.env"
  echo "    wrote $DIR/.env"
else
  echo "    kept existing $DIR/.env"
fi

echo "==> deploy key, restricted to one command"
install -m 700 -d /root/.ssh
touch /root/.ssh/authorized_keys
sed -i '/deploy@traffic-dashboard/d' /root/.ssh/authorized_keys
printf 'command="%s/deploy/host-deploy.sh",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty %s\n' \
  "$DIR" "$(cat "$DEPLOY_KEY_FILE")" >> /root/.ssh/authorized_keys

echo "==> nginx, port 80 first so the challenge can be served"
sed "s|\${PUBLIC_DOMAIN}|$DOMAIN|g" "$DIR/deploy/shared-host/nginx-acme.conf" \
  > /etc/nginx/sites-available/zz-traffic-acme
ln -sf /etc/nginx/sites-available/zz-traffic-acme /etc/nginx/sites-enabled/zz-traffic-acme
mkdir -p /var/www/certbot
nginx -t >/dev/null && systemctl reload nginx

echo "==> certificate"
if [ ! -d "$CERT_ROOT/live/$DOMAIN" ]; then
  certbot certonly --webroot -w /var/www/certbot -d "$DOMAIN" \
    --config-dir "$CERT_ROOT" --work-dir /var/lib/letsencrypt-traffic --logs-dir /var/log/letsencrypt-traffic \
    --non-interactive --agree-tos --register-unsafely-without-email
fi

cat > /etc/cron.d/traffic-dashboard-cert <<EOF
# Renews $DOMAIN only, from its own directories, so it never waits behind a
# host-wide renew that a single manual-DNS certificate can block forever.
17 4 * * * root certbot renew --quiet --config-dir $CERT_ROOT --work-dir /var/lib/letsencrypt-traffic --logs-dir /var/log/letsencrypt-traffic --deploy-hook "systemctl reload nginx"
EOF
chmod 644 /etc/cron.d/traffic-dashboard-cert

echo "==> nginx, HTTPS"
sed "s|\${PUBLIC_DOMAIN}|$DOMAIN|g" "$DIR/deploy/shared-host/nginx.conf" \
  > /etc/nginx/sites-available/zz-traffic
ln -sf /etc/nginx/sites-available/zz-traffic /etc/nginx/sites-enabled/zz-traffic
nginx -t >/dev/null && systemctl reload nginx

echo "==> stack"
cd "$DIR" && docker compose up -d --build

echo
echo "done — https://$DOMAIN"

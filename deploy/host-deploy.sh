#!/usr/bin/env bash
# The only thing the deploy key may run. Installed as a forced command in
# authorized_keys, so a key that leaks cannot open a shell, forward a port, or
# touch anything else on a host that also serves unrelated production.
#
# The commit arrives through SSH_ORIGINAL_COMMAND, which is attacker-controlled
# by definition, so it is matched against a full hex SHA before it reaches git.
set -euo pipefail

DIR=${DEPLOY_DIR:-/opt/traffic-dashboard}
HEALTH_ATTEMPTS=30
HEALTH_INTERVAL=4

requested=${SSH_ORIGINAL_COMMAND:-}

if [[ ! $requested =~ ^[0-9a-f]{40}$ ]]; then
  echo "expected a 40-character commit sha, refusing: ${requested:0:64}" >&2
  exit 64
fi

cd "$DIR"

previous=$(git rev-parse HEAD)
echo "at $previous, rolling forward to $requested"

git fetch --quiet origin
git reset --quiet --hard "$requested"
docker compose up -d --build

# API_PORT may be a bare port or a host-scoped one, so take whatever follows the
# last colon and always ask loopback.
port=$(sed -n 's/^API_PORT=//p' .env | awk -F: '{print $NF}')
port=${port:-3000}

# The health endpoint reports the database too, so this waits for the whole
# stack rather than for a process that has merely started.
for attempt in $(seq 1 "$HEALTH_ATTEMPTS"); do
  if curl -fsS --max-time 5 "http://127.0.0.1:$port/api/health" | grep -q '"database":"up"'; then
    echo "healthy after $attempt attempts"
    exit 0
  fi
  sleep "$HEALTH_INTERVAL"
done

echo "unhealthy after $((HEALTH_ATTEMPTS * HEALTH_INTERVAL))s, rolling back to $previous" >&2
git reset --quiet --hard "$previous"
docker compose up -d --build
exit 1

## Why

The repository is empty. Before any traffic-domain code is written, the toolchain has to be proven: a TypeScript API and a React app that build, test, and talk to Postgres and to each other, all started with a single command.

Mixing that proof with the first domain feature would confound two failures. When a chart shows nothing, the cause could be the SQL, the response shape, the container network, or CORS — and separating them afterwards costs more than proving the plumbing on its own. This change carries no traffic concepts at all: no schema, no aggregate endpoint, no chart.

## What Changes

- A pnpm workspace with `api/` (Node.js + TypeScript + Fastify) and `web/` (React + Vite + TypeScript), sharing one TypeScript base config, one linter, and one test runner.
- A migration runner wired to Postgres with an empty initial migration, so the mechanism is proven before it carries a schema.
- `GET /api/health` on the API: reports whether the process is up and whether it can reach the database, with distinct status codes for the two cases.
- A web shell that calls that endpoint and renders the result, exercising CORS and the browser-to-API hop.
- `docker-compose.yml` bringing up Postgres, the API, and the web app; migrations run on API startup.
- `.env.example` documenting the configuration the API requires, and `.gitignore`.
- One test per layer: an integration test for `/api/health` against a real Postgres, and a component test for the shell's connected and disconnected states.

Deliberately not in this change: the `traffic_events` schema, the seed, aggregate endpoints, both charts, filters, write endpoints, CI, and the README.

## Capabilities

### New Capabilities

- `service-health`: whether the system is running and its parts can reach each other — the API's readiness signal including database connectivity, and how the web shell surfaces it.

### Modified Capabilities

None. This is the first change in the repository.

## Impact

- **New code:** `api/`, `web/`, `migrations/`, `docker-compose.yml`, workspace root config.
- **Dependencies:** Node.js, TypeScript, Fastify, a Postgres driver, a migration runner, React, Vite, Vitest, Testcontainers.
- **Runtime:** Docker Compose becomes the supported way to run the project; `DATABASE_URL` becomes the API's required configuration.
- **Downstream:** The response envelope and error shape established by `/api/health` bind every later endpoint. Choosing them here, against a trivial payload, is cheaper than discovering them wrong once charts depend on them.

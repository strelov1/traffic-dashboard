# AGENTS.md

Guidance for AI agents working in this repository.

## Working principles

- **No overengineering, and no MVP shortcuts.** Hold the middle path: don't build infrastructure before there's a concrete need (note the seam for later instead), and don't ship quick-and-dirty or "for now" hacks. Build each feature correctly and idiomatically — neither gold-plated nor a placeholder.
- **Early stage — keep the architecture fluid.** Nothing here is load-bearing legacy yet. When something doesn't fit cleanly, reshape the affected part rather than bolting on a special case.
- **Every decision is defensible.** This codebase is read by reviewers, not just run. Prefer the choice you can justify out loud over the one that is merely fastest to type; when a trade-off is real, record it in the README or under `docs/` — an ADR if it is load-bearing — rather than in a comment.
- **Surgical changes.** Clean up what your change orphaned; leave pre-existing dead code alone. Prefer a library's intended API over a clever shim.
- **Never commit unreviewed work.** Only the human commits. Present the diff, wait for an explicit approval, and let them run `git commit`. Nothing reaches history that a human has not read.
- **English only.** All code, comments, identifiers, docs, and commits.

## What this is

A traffic-analytics dashboard. Vehicle detection data (country, vehicle type, time) is stored in a database, aggregated behind an HTTP API, and rendered as two interactive charts: **traffic by country** and **vehicle-type distribution**.

Stack: pnpm workspace, Node 22, ESM, TypeScript strict, type-checked ESLint. **API:** Fastify, `pg`, zod, node-pg-migrate, TimescaleDB (a hypertable plus the continuous aggregate `traffic_hourly_totals`, hourly buckets). **Web:** React 19, Vite, Recharts, zod. **Ops:** Docker Compose, Terraform, GitHub Actions.

## Layout

```
api/src/traffic/domain/   vehicle-type, detection, instant, period, totals
api/src/traffic/ports.ts  TrafficRepository — the contract
api/src/traffic/infra/    postgres-repository, seed
api/src/traffic/http/     ingest-routes, aggregate-routes, fields
api/src/platform/         config, database, migrate, server, health, shutdown
api/src/testing/          startMigratedPostgres, stubDatabase, trafficEvents
api/src/index.ts          the composition root
web/src/                  App, useAsync, useUrlFilter, filters, api/, components/
perf/ docs/ openspec/     k6 scripts, measurements and the ADR, one change each
```

**Dependency rule.** `domain/` knows nothing. `infra/` and `http/` both name `ports.ts` and never each other. Production code must not violate this; an integration test is a composition root and may name both.

Tests sit beside the code they cover: `*.test.ts` for unit, `*.integration.test.ts` for anything that starts a container.

## Commands

```bash
docker compose up --build   # the whole stack: db, api, web on :8080
pnpm verify                 # lint, typecheck, both suites — what CI runs
pnpm --filter @derq/api test:watch
```

Integration suites need Docker: they start a throwaway TimescaleDB with Testcontainers on the image Compose runs. Nothing is mocked at the database boundary.

## Conventions

- **Responses.** Lists answer `{"data": [...]}`, failures `{"error": "..."}`. Response schemas are declared to Fastify so a new column cannot leak into a payload; a 5xx never carries the underlying message.
- **Validation both ways.** Request schemas restate what the database enforces, because the database cannot explain itself to a caller. Rows are validated on the way out too: `query` takes the expected shape as an argument, not a type parameter.
- **Time.** Instants are absolute, periods are the half-open interval `[from, to)`, and a period is rounded outward to hour boundaries before it reaches SQL.
- **Tests must be able to fail.** Write the failing test first, then break the code it guards and watch it fail. Four tests that passed against a broken implementation were found in an audit; that is the bar.
- **Comments explain why, never what.** A decision without a reason beside it is a decision nobody can review.
- **Spelling.** British in prose (`materialised`, `behaviour`), and identifiers follow whatever the library or SQL already uses.

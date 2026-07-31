## Why

The scaffolding proved the plumbing but stores nothing. Every remaining requirement — both charts, the aggregate endpoints, the filters, the data updates, and the scaling argument — reads from one table that does not exist yet. Its grain and its columns bind all of them, and changing them later means a migration plus a rewrite of every query and every chart that depends on the shape.

This change introduces that table and fills it with enough data to be measured. The volume matters as much as the schema: on a thousand rows every query plan looks identical and the scaling section stays theoretical, while on millions the aggregate has a real plan, a real cost, and a real answer to "what breaks at 500 RPS".

## What Changes

- A `traffic_events` table storing one row per detected vehicle: when it passed, which country issued its plate, and what kind of vehicle it was.
- A repository module exposing the reads the endpoints will need, with row shapes validated as everywhere else.
- A seed that generates a configurable number of events with a plausible distribution — uneven across countries and vehicle types, and shaped by hour of day — so charts show something worth looking at and query plans behave like production.
- The seed runs at startup when the table is empty, so a clean `docker compose up` yields a populated database with no manual step.
- Query-plan evidence captured against the seeded volume, to be cited later in the scaling section rather than reasoned about abstractly.

Deliberately not in this change: the aggregate endpoints, the charts, filters, and the write path for updates. Each is its own increment.

## Capabilities

### New Capabilities

- `traffic-data`: what a traffic event is — its grain, the fields it carries, the constraints that keep it queryable — and how a database with no events becomes one worth querying.

### Modified Capabilities

None. `service-health` is unaffected: the health check does not read this table, and coupling it to a domain table would make a schema problem look like an outage.

## Impact

- **New code:** `api/migrations/`, a repository module and its suite, a seed module and its suite, a seed entry point.
- **Runtime:** first startup against an empty database now generates data, which takes noticeably longer than an empty migration. The row count is configurable so the cost is a choice, not a surprise.
- **Downstream:** the grain decided here is the ceiling on every later question. Per-detection rows can always be aggregated; pre-aggregated counts can never be taken apart.

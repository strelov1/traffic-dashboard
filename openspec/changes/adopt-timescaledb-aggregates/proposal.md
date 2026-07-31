## Why

The load test says the aggregates hold 150 requests per second and collapse by 200, with 78% failing at 500. The cause is measured: each request holds a connection while a sequential scan runs, the pool exhausts, and the rest time out waiting for one. Counting every row is what the query means, so the scan cannot be made cheap — it has to stop happening per request.

A spike measured a TimescaleDB continuous aggregate at **0.26 ms against 212 ms** for the same answer over four million rows. The data is a time series in the exact sense the tool is built for: append-only observations with a timestamp, aggregated by category. Adopting it makes the aggregate incremental rather than repeated, which is the property that keeps working as the table grows — a cache stops helping once a refresh scan no longer fits inside its own time to live.

The spike also found what it costs, and this change takes those costs on deliberately rather than discovering them later.

## What Changes

- Postgres is replaced by TimescaleDB, and `traffic_events` becomes a hypertable partitioned by `occurred_at`.
- The primary key becomes `(id, occurred_at)`: a hypertable requires the partitioning column in every unique index. `id` alone remains unique in practice, since it is still generated from one sequence.
- A continuous aggregate materialises daily totals per plate country and per vehicle type; both endpoints read from it and sum, instead of scanning the events.
- A refresh policy re-materialises a trailing window on a schedule, so detections that arrive late are counted. The current day is deliberately left unmaterialised, so real-time aggregation covers it and a detection recorded now is visible now.
- The load test is re-run and its numbers recorded beside the ones from before.

**BREAKING**: `PATCH /api/traffic/events/:id` no longer accepts `occurredAt`. TimescaleDB does not move a row between chunks, so changing the instant across a chunk boundary fails at the storage layer. Correcting a misclassification stays; rewriting when a camera saw something was never a domain operation.

## Capabilities

### Modified Capabilities

- `traffic-data`: storage becomes a hypertable with a composite key, and daily totals are maintained continuously rather than computed on demand.
- `traffic-api`: aggregate responses gain a stated freshness bound — data older than the real-time window is as fresh as the last refresh.
- `traffic-ingest`: the correction contract loses `occurredAt`.

## Impact

- **Infrastructure:** the database image becomes `timescale/timescaledb`, in Compose and in every integration test.
- **New code:** a migration creating the extension, the hypertable, the continuous aggregate and its policy; the aggregate reads change shape.
- **Behavioural:** a detection whose instant falls in an already-materialised window is not counted until that window is refreshed. The refresh policy bounds how late an event may arrive and still be counted, and that bound is part of the contract.
- **Downstream:** the endpoints stop being a linear load on the database, which is what the scaling section rests on.

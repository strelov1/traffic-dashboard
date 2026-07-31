## Context

`docs/performance/load-test.md` records where the system breaks and why; `docs/performance/aggregate-baseline.md` records the query plan behind it. A spike against a throwaway TimescaleDB measured the replacement and found both its speedup and its constraints. This change carries out the pivot with those findings as the design input.

## Goals / Non-Goals

**Goals:**

- Aggregate reads that do not scale with the size of the table.
- A detection recorded now visible now, despite the aggregate being materialised.
- A stated, bounded answer to "how late may an event arrive and still be counted".

**Non-Goals:**

- A cache. It would still help — it is the difference between a sub-millisecond query and none at all — but it belongs after this, measured against these numbers rather than the old ones.
- Compression and retention policies. Both are one line each and neither has a requirement behind it yet.
- Replacing the write path. Inserts are unchanged.

## Decisions

**Daily buckets, summed on read, rather than a bucket per query shape.** A continuous aggregate must group by a `time_bucket`; the spike confirmed the error is refused outright without one. A day is the coarsest bucket that still answers every question the project has or plans: totals over all time are a sum of days, and the filters in the next increment are a sum of the days they cover. Finer buckets would multiply the materialised rows for a resolution nothing asks for — 186 rows at a day, thousands at an hour.

**The current day is never materialised, and real-time aggregation serves it.** This is the decision that keeps the existing contract intact. The spike showed the hazard plainly: an event inserted below the materialisation watermark is invisible, and re-running the refresh reports "already up-to-date" without picking it up. Setting the refresh policy's end offset shorter than the bucket width means today's bucket is never complete, so it is never materialised, so real-time aggregation unions it live. A detection recorded a second ago is counted a second ago.

The cost is that the live half scans one day of events rather than reading one row — trivial at any volume this project reaches, and bounded by a day's traffic rather than by the whole history.

**A trailing refresh window, and it is the contract for late data.** The policy re-materialises the last several days on a schedule, so detections buffered by a camera and delivered late are still counted. Anything arriving outside that window is not, and never will be without a manual refresh. That is a real limit, so it is written into the specification as a bound rather than left as a surprise: the window is the maximum lateness the system tolerates.

**Composite primary key `(id, occurred_at)`, and `id` stays the public identifier.** A hypertable refuses a unique index that omits the partitioning column, so the key has to widen. Nothing else changes: `id` still comes from one identity sequence, so it is still unique, and `PATCH` and `DELETE` still address by it alone — the composite index has `id` as its leading column, so the lookup still uses it.

**`occurredAt` leaves the correction contract.** TimescaleDB does not relocate a row between chunks; the spike reproduced the failure exactly — `new row violates check constraint` from the chunk's own time bound. The alternatives are to delete and re-insert, which changes the id a caller is holding, or to catch the error and answer something invented. Removing the field is the honest option, and it costs nothing real: a correction fixes what the camera read, not when it looked.

**The extension and the hypertable arrive in a migration, not in an init script.** The project already guarantees that migrations complete before the server serves, and that guarantee is what makes the schema change safe. `create_hypertable` with data migration handles the existing rows; an init script would only run on an empty volume and would silently skip an existing database.

**Testcontainers switches image, not shape.** The integration suites already start a throwaway database and apply the project's own migrations; pointing them at `timescale/timescaledb` keeps every existing test honest, because they now exercise the storage the project actually ships.

## Risks / Trade-offs

- **The freshness contract is now something a reader has to know.** → It is specified and bounded rather than implicit, and the case that matters most — a detection recorded now — is deliberately exact rather than eventually consistent.
- **A detection arriving later than the refresh window is silently uncounted.** → The window is a stated maximum, chosen wide enough for a buffering camera. The alternative, refreshing the whole history on a schedule, reintroduces exactly the full scan this change removes.
- **The database is no longer stock Postgres, which is what the brief names.** → It is a Postgres extension, not a different engine: same SQL, same driver, same migrations, same operational model. The brief says PostgreSQL preferred, and this is PostgreSQL.
- **The aggregate is one more thing that can be wrong, and wrongness is quiet.** → The suites assert the endpoint's answer, not the aggregate's contents, so a materialisation that drifts from the events fails a test rather than a chart.

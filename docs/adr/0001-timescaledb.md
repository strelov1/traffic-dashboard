# 1. Store detections in a TimescaleDB hypertable and read maintained hourly totals

**Status:** accepted, 2026-07-31.

The measurements this record argues from are in
[`../performance/load-test.md`](../performance/load-test.md),
[`../performance/aggregate-baseline.md`](../performance/aggregate-baseline.md) and
[`../performance/filtered-aggregate.md`](../performance/filtered-aggregate.md).

## Context

The brief asks what happens at 5, 50 and 500 requests per second. The first
version of this system answered both charts by counting the events on every
request:

```sql
select plate_country, count(*) from traffic_events group by plate_country;
```

That is the honest first implementation, and it holds up until it doesn't. Each
tier below is a separate twenty-second run against `GET /api/traffic/by-country`
on 250 000 events, under an **open** load model — requests issued on schedule
regardless of how slow the last one was, because a closed model throttles itself
as the system slows and makes an overloaded service read as merely sluggish.

| Target RPS | p95 | failed |
|---|---|---|
| 5 | 49 ms | 0 % |
| 50 | 21 ms | 0 % |
| 100 | 286 ms | 0 % |
| 150 | 144 ms | 0 % |
| 200 | 2.18 s | 22 % |
| 500 | 2.15 s | **78 %** |

The knee sits between 150 and 200, and the two lowest tiers say nothing at all:
50 RPS passed at 21 ms with the implementation that fails four requests in five
at 500. A single-point load test would have called this system fine.

At 500 RPS the API logs named the cause without ambiguity:

```
Error: timeout exceeded when trying to connect
    at pg-pool/index.js:45:11
```

Requests were not failing on the query. They were failing to get a
**connection**. `pg` pools ten by default, and each aggregate held one for the
length of a sequential scan over every row; under concurrency those scans
contended for the same cores, service time grew, and ten stopped being enough.
p95 pinned at 2.15 s because `connectionTimeoutMillis` is 2 000 ms
(`api/src/platform/database.ts`) — that number is the pool giving up, not the
database answering, so p95 had stopped describing the query at all.

The plan underneath explains why more hardware was not the answer. At four
million rows the same aggregate is a `Parallel Seq Scan` taking 235 ms of
execution across two parallel workers and the leader — roughly 0.7 core-seconds
per request. Five
requests per second of uncached aggregate needs about 3.5 cores doing nothing
else, before the API or any other endpoint is accounted for.

## Decision

Keep the per-detection grain, and stop computing the answer per request.

- `traffic_events` becomes a **hypertable** partitioned by `occurred_at`
  (migration 0002). The primary key widens to `(id, occurred_at)` because a
  hypertable refuses a unique index that omits the partitioning column; `id`
  stays unique in fact and stays what a client addresses.
- `traffic_hourly_totals` is a **continuous aggregate** over the events, keyed
  `(hour, plate_country, vehicle_type)`, declared with
  `timescaledb.materialized_only = false` so a read is the materialised buckets
  unioned with a live scan of everything newer than the watermark (migration
  0004, which replaced the daily aggregate of 0003).
- The refresh policy re-materialises a trailing **seven days every five
  minutes**, stopping **one whole bucket short of now**.
- Both endpoints sum over the aggregate. The API rounds a requested period
  outward to hour boundaries before it reaches SQL, so a bound always lands on a
  bucket edge and the response states the period it actually covered.

Measured in place, same machine, same load:

| | before | after |
|---|---|---|
| p95 at 500 RPS | 2.15 s | **4.4 ms** |
| failures at 500 RPS | 78 % | **0 %** |
| ceiling | ~150 RPS | ~1360 RPS |

## Alternatives considered

**An index on `plate_country` or `vehicle_type`.** Rejected: it cannot help.
`count(*) ... group by` must read every row — that is what the query means, not
a property of this schema — so the planner keeps choosing the sequential scan and
the index is write cost buying nothing. The baseline plan confirms it: both
aggregates are a full scan, and `Buffers: shared hit=11725 read=14818` at four
million rows is a table being read, not an index being probed.

**A larger connection pool.** Rejected: it makes the failure worse, and it
mistakes the symptom for the cause. The pool is where the failure *surfaced*.
Service time was already CPU-bound — one aggregate is 0.7 core-seconds — so
raising concurrency past saturation buys latency, not throughput. A larger pool
would have removed the fast, visible timeout and replaced it with an unbounded
queue: the same failure, slower to see.

**A TTL cache in front of the counting query.** Rejected *as the answer to this
failure*, and deliberately kept on the roadmap for a different one.

A cache does not make the read cheap; it makes it rare. Every expiry still pays
the whole scan and holds a connection for its duration, and the scan grows
linearly with the table — 25 ms at 250 000 rows, 235 ms at four million. Once
the refresh scan no longer fits inside the TTL, requests arrive to find the
entry expired and a refresh already running: the system scans continuously and
serves answers stale by the length of a scan. A cache whose refresh does not fit
its TTL has stopped being a cache and become a scheduler for the query it was
supposed to avoid.

It would also have hidden the shape of the problem rather than solving it. What
this data wants is to be summarised — six numbers over slowly changing history —
and every feature since (period filters, the country drill-down, the freshness
guarantee) reads those maintained rows. A cache is still the right next step at
four million rows, where p95 at 500 RPS is 1.84 s, but as a layer above a read
that is already cheap and over a key space the contract bounds. The ordering is
the whole point: caching an expensive read hides an unbounded cost; caching a
cheap read bounds a fixed one.

**Totals maintained by the application in an ordinary table.** Rejected: it is
this decision with the maintenance moved into code we would own. Every write
would have to update N counters in the same transaction, backfill would be a
script, and the freshness problem would have to be solved twice — once on the
write path and once for anything that arrived by another route. Real-time
aggregation answers it once, in the place that already knows what has been
materialised.

## Consequences

**Freshness is bounded, and the bound is stated rather than implied.** The
bucket containing the present is never materialised, so a detection recorded now
is counted now. A detection that *arrives* late is counted when the policy next
covers its hour, and the policy's trailing seven days is therefore the maximum
lateness the system tolerates for an arrival. Later than that and it sits in
`traffic_events`, uncounted, until a refresh is requested for that period — the
total reads **lower** than the truth with no error anywhere, which is why tests
pin the policy's arguments.

**The live tail made the bucket width the real decision.** A spike measured a
continuous aggregate at 0.26 ms against 212 ms for the scan; in place, with a
**daily** bucket, the same read took 82 ms. The spike's live tail was empty, so
its number described a laboratory condition. Real-time aggregation scans
everything above the watermark on every request, and with a daily bucket that is
a whole day of detections:

| bucket | materialised rows | live tail | read at 4M |
|---|---|---|---|
| none (scan the events) | — | — | 186 ms |
| 1 day | 252 | ~133 000 events | 82 ms |
| 1 hour | 25 936 | ~5 500 events | **18 ms** |

A spike answers "does this work", not "how fast is it": its number is an upper
bound under laboratory conditions, and a design decision belongs to a measurement
taken in the assembled system. That is the more transferable lesson here, and it
cost a migration to learn.

A finer bucket trades a larger materialised side for a smaller live tail, and
the optimum sits where summing one and scanning the other cost about the same.
That optimum moves with the **write** rate, not the read rate, which is what
would force this record to be revisited: at a 24-hour bound the live tail is
already 95 % of the read, so a busier deployment reaches the point where an hour
is too wide long before it reaches the point where reads are too frequent.

**A correction or a removal has to refresh the hour it touched.** Real-time
aggregation only ever *adds* rows above the watermark; it cannot subtract a
deleted detection or reclassify a corrected one. Below the watermark the
materialised value is the whole answer, so a mutation there would go unnoticed
forever — and in the opposite direction to a late arrival: the total would read
**higher** than the truth. `reconcileBucket` therefore refreshes the hour a
mutation touched, unless that hour is the current one, because materialising the
current bucket would drag the watermark past detections recorded into that same
hour afterwards, counted then by neither side.

The seam is worth naming: `refresh_continuous_aggregate` cannot run inside a
transaction, so it follows the committed mutation. A crash between the two
leaves the total stale — repaired by the policy if the hour is inside its window,
not repaired if it is outside — and the mutation's own answer stands either way.
A 500 for a write that succeeded would be the worse lie.

**The failure mode at saturation changed shape.** Requests now queue and slow
down rather than fail, because a connection is held for milliseconds instead of
for the length of a scan.

**Costs accepted.** The database image is `timescale/timescaledb:2.29.0-pg17`
rather than stock Postgres, in every environment including the test suites —
Testcontainers starts that same image, so nothing is proved against an engine
the project does not run. The aggregate is a second copy of the data, about
26 000 rows per thirty days (720 hours × six countries × six classes). And the
migrations now carry policy arguments that no type and no query fails on when
they change, so a test asserts `start_offset`, `end_offset` and
`schedule_interval` directly.

## Where it goes next, and when

Thresholds rather than a list of technologies: each step is what the previous one
stops covering.

| When | What | Why then |
|---|---|---|
| 500 RPS at millions of rows — p95 is 1.84 s at 4M today | **Cache the response.** `Cache-Control` first, so a proxy or CDN answers repeats without reaching the API; then an in-process TTL cache with single-flight | The response is public and identical for everyone, and a dashboard read by people tolerates seconds of staleness |
| ~100M rows | Coarser aggregates layered on the hourly one, and compression on old chunks | The hourly materialised side grows linearly with retention |
| Sustained write load | Batch inserts, `COPY` over `INSERT`, a queue in front so bursts never reach the database | Writes cannot be cached. Nothing above helps them |
| Retention becomes a cost | Drop old chunks | Partitioned already; dropping a chunk is metadata, not a scan of millions of rows |
| Reads outgrow one machine | Read replicas, then a column store for analytics | Postgres reads whole rows to count one column; a column store does not |

Two things deliberately **not** on that list. **Microservices**: 500 RPS is served
by one process without effort, and splitting it would buy network hops,
distributed failure and four things to deploy in exchange for nothing measurable.
**Sharding**: the data is 210 MB at four million rows, and cross-shard
aggregation is a cost that would arrive immediately.

The first row is worth stating precisely, because half of it is already done.
Date-range filters exist, and the API rounds every requested range outward to
hour boundaries **before it reaches SQL**, stating the rounded period in the
response. A client can therefore produce hour-aligned keys and nothing finer, and
the dashboard's presets only ever produce four of them — the key space is bounded
by the contract rather than by a cache that would have had to round the same
range a second time.

The cache itself is still **not built**, deliberately rather than accidentally.
There is no measured need: on a million rows the unbounded read is 19.8 ms, not
the 1.84 s that put caching at the top of this table, and a cache added now would
sit exactly where the period predicate is and hide it. The measurement is in
[`../performance/filtered-aggregate.md`](../performance/filtered-aggregate.md),
including the part that contradicted the expectation — the events table was
already narrowed to one chunk by the continuous aggregate itself, so what a
period filter excludes is a chunk of the *aggregate's* hypertable.

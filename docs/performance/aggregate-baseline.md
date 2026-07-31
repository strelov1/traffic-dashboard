# Aggregate baseline

Measured before any index beyond the primary key exists, so that the scaling
section argues from numbers rather than from expectation. Reproduce with:

```bash
SEED_EVENTS=4000000 docker compose up -d --build
docker compose exec db psql -U derq -d derq \
  -c "explain (analyze, buffers) select plate_country, count(*) from traffic_events group by plate_country;"
```

Environment: `postgres:17-alpine` under Docker Compose on a developer laptop.
Timings are warm-cache, taken as the median of three consecutive runs.

## Results

| Rows | Query | Plan | Execution |
|---|---|---|---|
| 250 000 | group by `plate_country` | Parallel Seq Scan, 1 worker → Partial HashAggregate | **25 ms** |
| 4 000 000 | group by `plate_country` | Parallel Seq Scan, 2 workers → Partial HashAggregate | **235 ms** |
| 4 000 000 | group by `vehicle_type` | Parallel Seq Scan, 2 workers → Partial HashAggregate | **233 ms** |

Sixteen times the data costs roughly nine times the wall clock. The growth is
sub-linear only because Postgres recruited a second parallel worker on the way;
the work itself is linear, because every row must be read to be counted.

## What the plan says

Both aggregates are a full scan. No index changes that: the query touches every
row by definition, and an index on `plate_country` would only add a structure
to maintain on write while the planner keeps choosing the sequential scan. The
cost is proportional to table size and nothing else.

`Buffers: shared hit=11725 read=14818` at four million rows shows more than half
the table being read from disk rather than found in cache, on a table around
210 MB. Growing the buffer cache would move that ratio but not the shape.

## What it implies for load

At 235 ms of execution across three parallel workers, one aggregate request
occupies roughly 0.7 core-seconds. Five requests per second of *uncached*
aggregate therefore needs about 3.5 cores doing nothing else — before the API,
the connection pool, or any other endpoint is accounted for.

That is the concrete finding: on a four-million-row table, the naive aggregate
does not comfortably serve even the lowest tier in the brief. The answer is not
a bigger machine but the observation that this data changes slowly and the same
six numbers are recomputed on every request.

Two consequences follow, and they are the substance of the scaling section:

- **Reads are trivially cacheable.** The result is six rows that change only as
  new detections arrive. A short cache TTL turns 500 RPS of reads into a handful
  of database queries per second.
- **Writes are the real constraint.** They cannot be cached away, and the
  measurement above says nothing about them. Any claim about 500 RPS has to say
  which of the two it means.

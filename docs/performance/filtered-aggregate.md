# Filtered aggregate

`aggregate-baseline.md` measured the aggregate unbounded, before the hourly
continuous aggregate existed. This measures what a **period filter** costs
against the aggregate that ships, so the scaling section can say what a bounded
read buys rather than assume it. Reproduce with:

```bash
SEED_EVENTS=1000000 docker compose up -d --build

# Unbounded: what the dashboard asks for by default.
docker compose exec db psql -U derq -d derq -c "explain (analyze, buffers)
  select plate_country, sum(total)::bigint as total from traffic_hourly_totals
  group by plate_country order by total desc, plate_country asc;"

# Bounded: what the dashboard asks for with a period chosen.
docker compose exec db psql -U derq -d derq -c "explain (analyze, buffers)
  select plate_country, sum(total)::bigint as total from traffic_hourly_totals
  where hour >= now() - interval '7 days'
  group by plate_country order by total desc, plate_country asc;"
```

Environment: `timescale/timescaledb:2.29.0-pg17` under Docker Compose on a
developer laptop. One million events spread over thirty days — six chunks of
`traffic_events`, 25 884 rows in the materialised aggregate, two chunks of it.
Timings are warm-cache, the median of three consecutive runs.

## Results

| Read | Aggregate chunks scanned | Materialised rows read | Live-tail rows read | Execution |
|---|---|---|---|---|
| Unbounded | 2 of 2 | 25 884 | 1 881 | **19.8 ms** |
| `hour >= now() - 7 days` | 1 of 2 | 5 976 | 1 881 | **7.9 ms** |
| `hour >= now() - 24 hours` | 1 of 2 | 792 | 1 881 | **3.9 ms** |

A seven-day bound is 2.5× faster than unbounded; a one-day bound is 5.1×.

## What the plan says

The bound does exclude a partition, but **not the one the proposal expected**.

`traffic_hourly_totals` reads as a union of two sides: the materialised
hypertable below the watermark, and a live scan of `traffic_events` above it.
The unbounded plan already touches only **one** of the six `traffic_events`
chunks — the continuous aggregate's own `occurred_at >= watermark` predicate
excludes the other five before any filter is involved. Time partitioning of the
events table was therefore already being exploited; adopting the continuous
aggregate is what started that, not this change.

What the period filter narrows is the **aggregate's** hypertable. Unbounded, both
of its chunks are read whole:

```
->  Seq Scan on _hyper_3_7_chunk  (rows=13752)
->  Seq Scan on _hyper_3_8_chunk  (rows=12132)
```

Bounded, one chunk is excluded outright and the other is entered through its
`hour` index rather than scanned:

```
->  Index Scan using _hyper_3_7_chunk__materialized_hypertable_3_hour_idx (rows=5976)
```

Two effects, both from the same predicate: fewer chunks, and an index path
within the chunk that survives. No index was added for this — the aggregate's
own `hour` index is what the planner chose.

## The live tail is a floor the filter cannot lower

The live side is identical in all three plans: 1 881 rows, 441 shared buffers,
about 2 ms. It has to be. It is the current hour of detections, and every
period that reaches the present contains it.

That is the honest limit of this measurement. At a 24-hour bound the live tail
is 441 of 466 buffers — **95 % of the read** — and shrinking the period further
buys almost nothing. The three tiers converge on roughly 2 ms, not on zero.

The consequence for the load tiers: a bounded read is cheaper, but it is not
cheap in proportion to how narrow it is. Past about a day, the cost is the live
tail, which is governed by the write rate rather than by the filter.

## What it implies for a cache

The README's scaling section names arbitrary date ranges as the thing that
collapses a cache's hit rate. This change decides the key space in advance: the
API rounds every requested range outward to hour boundaries before it reaches
SQL, so the keys a client can produce are hour-aligned pairs rather than
millisecond-aligned ones, and the dashboard only ever emits four of them.

The cache itself is still not built. These numbers are why there is no hurry:
19.8 ms unbounded on a million rows is not the bottleneck the four-million-row
sequential scan in `aggregate-baseline.md` was. What has changed is that the key
space is now bounded by contract rather than by hope, which is the part that
would have been expensive to retrofit.

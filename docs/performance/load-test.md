# Load test

What the system actually serves, measured rather than estimated, before and
after the aggregates moved onto a TimescaleDB continuous aggregate.

```bash
docker compose up -d --build
RATE=500 k6 run perf/aggregate-load.js
```

Environment: Docker Compose on a developer laptop, no cache anywhere. Each tier
is a separate 20-second run against `GET /api/traffic/by-country`.

The load model is **open**: requests are issued on schedule regardless of how
slow the previous one was. A closed model — N virtual users looping — throttles
itself as the system slows, so an overloaded service looks merely slow. Only an
open model shows saturation as callers experience it.

## Before: counting the events per request

250 000 events, plain Postgres, no index beyond the primary key.

| Target RPS | p95 | failed |
|---|---|---|
| 5 | 49 ms | 0 % |
| 50 | 21 ms | 0 % |
| 100 | 286 ms | 0 % |
| 150 | 144 ms | 0 % |
| 200 | 2.18 s | 22 % |
| 500 | 2.15 s | 78 % |

The knee sat between 150 and 200. The API logs named the cause exactly:

```
Error: timeout exceeded when trying to connect
    at pg-pool/index.js:45:11
```

Requests were not failing on the query but on getting a **connection**. The pool
holds ten, and each aggregate held one for the length of a sequential scan;
under concurrency the scans contended for the same cores, service time grew, and
ten connections stopped being enough. p95 pinned at 2.1 s because that is
`connectionTimeoutMillis` converting an unbounded queue into a visible failure.

## After: reading maintained hourly totals

Same load, same machine, TimescaleDB with an hourly continuous aggregate.

At 250 000 events:

| Target RPS | p95 | failed | achieved |
|---|---|---|---|
| 5 | 23 ms | 0 % | 5 |
| 50 | 13 ms | 0 % | 50 |
| 200 | 6 ms | 0 % | 200 |
| 500 | **4.4 ms** | **0 %** | 500 |
| 1000 | 53 ms | 0 % | 1000 |
| 2000 | 954 ms | 0 % | 1362 |

The brief's top tier is met with room to spare, and the new ceiling is around
1360 requests per second. The failure mode also changed: at saturation requests
queue and slow down rather than fail, because a connection is now held for
milliseconds instead of the length of a scan.

At 4 000 000 events:

| Target RPS | p95 | failed | achieved |
|---|---|---|---|
| 200 | 84 ms | 0 % | 200 |
| 500 | 1.84 s | 0.75 % | 448 |
| 1000 | 1.98 s | 0.88 % | 577 |

Sixteen times the data still serves the brief's top tier, at a latency that
would not be shipped. This is where a cache belongs, and the measurements above
are what it should be judged against.

## The bucket width is the design decision

The spike measured a continuous aggregate at 0.26 ms against 212 ms for the
scan. In place, with a **daily** bucket, the same read took **82 ms** — a fifth
of the promised improvement.

The difference is real-time aggregation. Everything newer than the
materialisation watermark is scanned live on every request, and with a daily
bucket that live tail is a whole day of detections: 133 000 rows at this volume.
The spike's live tail was empty, so its number described a condition that does
not hold in production.

Narrowing the bucket to an hour shrinks the live tail to an hour of traffic
while keeping the materialised side small:

| Bucket | materialised rows | live tail | read at 4M |
|---|---|---|---|
| none (scan the events) | — | — | 186 ms |
| 1 day | 252 | ~133 000 events | 82 ms |
| 1 hour | 25 936 | ~5 500 events | **18 ms** |

Freshness is identical in both: the current bucket is served live either way, so
a detection recorded now is counted now. Only the cost changes.

The general shape: a finer bucket trades a larger materialised side for a
smaller live tail. The optimum is where summing the materialised rows and
scanning the live tail cost about the same, and it moves as traffic grows.

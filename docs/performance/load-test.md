# Load test

What the system as built actually serves, measured rather than estimated.
Reproduce with:

```bash
API_PORT=3399 docker compose up -d --build
RATE=50 k6 run perf/aggregate-load.js
```

Environment: Docker Compose on a developer laptop, `postgres:17-alpine`,
250 000 seeded events, no index beyond the primary key, no cache. Each tier is
a separate 20-second run against `GET /api/traffic/by-country`.

The load model is **open**: requests are issued on schedule regardless of how
slow the previous one was. A closed model — N virtual users looping — throttles
itself as the system slows, so an overloaded service looks merely slow. Only an
open model shows saturation as it is experienced by callers.

## Results

| Target RPS | p95 | failed | verdict |
|---|---|---|---|
| 5 | 49 ms | 0 % | comfortable |
| 50 | 21 ms | 0 % | comfortable |
| 100 | 286 ms | 0 % | degrading |
| 150 | 144 ms | 0 % | at the edge |
| 200 | 2.18 s | 22 % | saturated |
| 500 | 2.15 s | 78 % | collapsed |

The knee sits between 150 and 200 requests per second. Below it the endpoint is
fast and loses nothing; above it, latency pins at roughly two seconds and a
growing share of requests never complete.

## Why it fails where it does

The API logs name the cause exactly:

```
Error: timeout exceeded when trying to connect
    at pg-pool/index.js:45:11
```

Requests are not failing on the query. They are failing to get a **connection**:
the `pg` pool holds ten by default, and `connectionTimeoutMillis` is two
seconds — which is why p95 pins at 2.1 s rather than rising without bound. The
timeout is doing its job; it is converting an unbounded queue into a fast,
visible failure.

The pool exhausts because each query holds a connection longer under load. The
aggregate is a sequential scan over every row, so it is CPU-bound; as
concurrency rises the scans contend for the same cores, service time grows, and
ten connections stop being enough. Ten connections at the unloaded service time
of 15 ms would in principle carry roughly 660 RPS; they carry a fifth of that,
because service time is not a constant.

Two things follow, and they shape the scaling argument:

- **Raising the pool size alone would make this worse.** More connections
  against the same cores means more contention and slower scans, not more
  throughput. The pool is where the failure surfaces, not where it originates.
- **The query itself is the constraint, so the fix is to stop running it.** The
  answer is six rows that change slowly, recomputed in full on every request.

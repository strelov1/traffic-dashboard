# Traffic dashboard

Vehicle detections stored at their raw grain, aggregated by TimescaleDB, served
over HTTP, and drawn as two ranked charts.

**Live: <https://traffic.freehire.me>** — 250 000 seeded detections, behind
nginx on a single host. The frontend and the API share that one origin, so the
browser never makes a cross-origin request.

```
Browser ──► web (nginx, static bundle)
   │
   └──────► api (Fastify)  ──►  TimescaleDB
                                 ├─ traffic_events        one row per detection
                                 └─ traffic_hourly_totals  continuously maintained
```

## Run it

```bash
docker compose up --build
```

Then open <http://localhost:8080>. The API is on <http://localhost:3000>.

Ports 3000 and 8080 are the defaults. If either is taken, copy `.env.example` to
`.env` and change `API_PORT` / `WEB_PORT` — everything else follows, including
the origin the frontend is built against and the origin the API allows.

The first start creates the schema, converts the events table to a hypertable,
and generates 250 000 detections. It takes a few seconds. Restarting does not
re-seed: the seed runs only when the table is empty. `SEED_EVENTS` changes the
volume; `SEED_EVENTS=0` generates nothing.

### Without Docker

```bash
pnpm install
pnpm --filter @derq/api dev      # needs DATABASE_URL
pnpm --filter @derq/web dev
```

### Verify

```bash
pnpm verify        # lint, typecheck, then tests — 144 of them
```

Integration suites start a throwaway TimescaleDB with Testcontainers, so Docker
must be running. Nothing is mocked at the database boundary: the behaviour worth
testing there is the SQL.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | process and database reachability |
| GET | `/api/traffic/by-country` | totals per plate country, largest first |
| GET | `/api/traffic/by-vehicle-type` | totals per vehicle type, largest first |
| POST | `/api/traffic/events` | record a batch of detections |
| PATCH | `/api/traffic/events/:id` | correct a detection's classification |
| DELETE | `/api/traffic/events/:id` | remove a detection |

Lists answer `{"data": [...]}`, failures answer `{"error": "..."}`. A 5xx never
carries the underlying message: a driver failure names the host, the user, and
why authentication failed.

```bash
curl -X POST localhost:3000/api/traffic/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"plateCountry":"AE","vehicleType":"bus"}]}'
# {"data":{"recorded":1}}

curl -X POST localhost:3000/api/traffic/events \
  -H 'content-type: application/json' \
  -d '{"events":[{"plateCountry":"Oman","vehicleType":"truck"}]}'
# {"error":"body/events/0/plateCountry must match pattern \"^[A-Z]{2}$\""}
```

Request schemas restate what the database enforces rather than deferring to it.
The database is the last line of defence and cannot explain itself to a caller;
the schema is the first, and can.

## Architecture

**One row per detection.** `traffic_events` stores a vehicle passing a camera at
a moment: the instant, the country that issued its plate, its class. Not hourly
counts. Aggregation is one-way — per-detection rows can always become summaries,
summaries can never be taken apart — and every later question, from filters to
rollups, depends on the grain being kept.

**Country means the country that issued the plate**, not the country the camera
stands in. In the Gulf, cross-border traffic is the signal an operator actually
asks about.

**Constraints live in the database.** `plate_country` is `text` matching
`^[A-Z]{2}$` — not `char(2)`, which rejects a value that is too long but pads
one that is too short, so `A` would be stored as `A ` and appear in a chart as a
country of its own. `vehicle_type` is a `CHECK`, not an enum, so admitting a new
class stays a one-line migration.

**Rows are validated on the way out of the database, too.** `query` takes the
expected shape as an argument rather than a type parameter: a generic would be
an assertion TypeScript never checks, and a renamed column would reach the
caller as `undefined`. It also catches the driver returning `count(*)` as a
string, which is correct of it — a bigint above 2^53 would otherwise lose
precision — and wrong for anything that then adds to it.

**Responses are declared, not produced.** Fastify serialises from the response
schema, so a column added to the table cannot appear in a payload by accident.
Growing the schema is not the same as changing the API.

**Aggregates are maintained, not computed.** `traffic_hourly_totals` is a
TimescaleDB continuous aggregate; the endpoints sum over it. Why, and what it
cost, is the next section.

**Two ranked horizontal bar charts, one colour.** The brief permits a pie; six
slices ask the reader to compare angles, which people do badly, and discard the
ranking the data already carries. Bars turn it into lengths against a shared
baseline. Colouring per category would double-encode what bar length already
says — and a value ramp across categories with no natural order fails the
palette check outright, unable to hold both a legible lightness spread and
contrast against the surface. Light and dark are each chosen and validated
against their own surface rather than inverted.

## Scaling: 5 → 50 → 500 RPS

Everything below is measured on this machine with `k6`, not estimated.
Reproduce with `RATE=500 k6 run perf/aggregate-load.js`. Full numbers and plans
are in [docs/performance](docs/performance).

The load model is **open** — requests are issued on schedule regardless of how
slow the last one was. A closed model throttles itself as the system slows, so
an overloaded service reads as merely sluggish.

### 5 RPS — nothing is required

p95 23 ms, no failures. One API container, one database. Worth stating plainly:
at this tier the correct engineering decision is to add nothing.

### 50 RPS — still nothing

p95 13 ms, no failures. The first version of this project — counting every row
on every request — also passed this tier, at 21 ms. Load tiers below the knee
tell you almost nothing, which is why a single-point load test is misleading.

### 500 RPS — this is where the design was decided

The first version **failed 78 % of requests** here, with p95 pinned at 2.15 s.
The API logs named the cause exactly:

```
Error: timeout exceeded when trying to connect
    at pg-pool/index.js:45:11
```

Requests were not failing on the query. They were failing to get a
**connection**. Each aggregate held one for the length of a sequential scan over
every row; under concurrency the scans contended for the same cores, service
time grew, and ten pooled connections stopped being enough. p95 sat at 2.1 s
because that is `connectionTimeoutMillis` turning an unbounded queue into a
fast, visible failure.

Three things follow, and two of them are the usual answers being wrong:

- **An index cannot help.** `count(*) ... group by` must read every row; that is
  what the query means. The planner keeps choosing the sequential scan and the
  index only adds write cost.
- **A bigger pool makes it worse.** More concurrent scans on the same cores
  means slower scans, not more throughput. The pool is where the failure
  surfaces, not where it originates.
- **So stop running the query.** The answer is six numbers over data that
  changes slowly, recomputed in full on every request.

**What was done:** the events table became a TimescaleDB hypertable partitioned
by time, and hourly totals per country and vehicle type became a continuous
aggregate. The endpoints sum over maintained totals instead of counting events.

| | before | after |
|---|---|---|
| p95 at 500 RPS | 2.15 s | **4.4 ms** |
| failures at 500 RPS | 78 % | **0 %** |
| ceiling | ~150 RPS | ~1360 RPS |

The failure mode changed too. At saturation requests now queue and slow down
rather than fail, because a connection is held for milliseconds rather than for
the length of a scan.

### The number that was wrong, and why it matters

A spike measured the continuous aggregate at 0.26 ms against 212 ms for the
scan. In place, with a **daily** bucket, the same read took **82 ms**.

TimescaleDB's real-time aggregation scans everything newer than the
materialisation watermark on every request. With a daily bucket that live tail
is a whole day of detections — 133 000 rows at four million total. The spike's
live tail was empty, so its number described a laboratory condition.

Narrowing the bucket to an hour shrinks the live tail without giving up
freshness:

| bucket | materialised rows | live tail | read at 4M |
|---|---|---|---|
| none (scan the events) | — | — | 186 ms |
| 1 day | 252 | ~133 000 events | 82 ms |
| 1 hour | 25 936 | ~5 500 events | **18 ms** |

A finer bucket trades a larger materialised side for a smaller live tail. The
optimum is where summing one and scanning the other cost about the same, and it
moves as traffic grows.

**A spike answers "does this work", not "how fast is it."** Its number is an
upper bound under laboratory conditions; the design decision belongs to a
measurement taken in the assembled system.

### Where it goes next, and when

Thresholds rather than a list of technologies. Each step is what the previous
one stops covering.

| When | What | Why then |
|---|---|---|
| 500 RPS at millions of rows — p95 is 1.84 s at 4M today | **Cache the response.** `Cache-Control` first, so a proxy or CDN answers repeats without reaching the API; then an in-process TTL cache with single-flight | The response is public and identical for everyone, and a dashboard read by people tolerates seconds of staleness |
| Filters over arbitrary date ranges | Round the range to bucket boundaries before it becomes a cache key | Arbitrary ranges make the key space unbounded and the hit rate collapses |
| ~100M rows | Coarser aggregates layered on the hourly one, and compression on old chunks | The hourly materialised side grows linearly with retention |
| Sustained write load | Batch inserts, `COPY` over `INSERT`, a queue in front so bursts never reach the database | Writes cannot be cached. Nothing above helps them |
| Retention becomes a cost | Drop old chunks | Partitioned already; dropping a chunk is metadata, not a scan of millions of rows |
| Reads outgrow one machine | Read replicas, then a column store for analytics | Postgres reads whole rows to count one column; a column store does not |

Two things that are **not** on this list, deliberately:

- **Microservices.** 500 RPS is served by one process without effort. Splitting
  it would add network hops, distributed failure, and four things to deploy in
  exchange for nothing measurable.
- **Sharding.** The data is 210 MB at four million rows. Sharding solves a
  problem this system will not have for a very long time, and costs cross-shard
  aggregation immediately.

### What is not measured here

The load test exercises **reads**. Writes cannot be cached and were not part of
the tiers above; the write path is a batch insert and the honest position is
that its ceiling is unmeasured. That, and an unauthenticated write path, are the
first two things a real deployment would need.

## Freshness, and its bound

A detection recorded now is counted now: the current hour is never materialised
and is served live.

A detection that arrives **late** — buffered by a camera, delivered minutes or
hours after it happened — is counted when the refresh policy next covers its
hour. The policy re-materialises a trailing seven days every five minutes, so
seven days is the stated maximum lateness the system tolerates. Later than that
and it stays in `traffic_events`, uncounted, until a refresh is requested for
that period.

This is a real way to be wrong quietly: the number is simply lower than the
truth, with no error anywhere. Two tests pin the boundary, so changing the
bucket width or the offset fails a suite rather than a report.

## Deployment

Two tools, one boundary between them: Terraform describes the machine,
`docker-compose.yml` describes what runs on it. Neither describes the other, so
nothing is written down twice.

```
terraform/               hcloud server, firewall, ssh key, cloud-init
docker-compose.yml       the application
docker-compose.prod.yml  adds Caddy, which obtains and renews its own certificate
deploy/host-deploy.sh    the only command the deploy key may run
deploy/shared-host/      nginx, certificate and key setup for a host already in use
```

Two ways onto a machine. `terraform/` provisions a dedicated one, where Caddy
handles TLS and nothing else is needed. `deploy/shared-host/bootstrap.sh`
prepares a host that already runs nginx for something else — which is where the
live demo runs, so the script exists rather than that setup living only on that
server.

### Provisioning

```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars   # token, domain, public key
terraform init && terraform apply
```

Cloud-init installs Docker, clones this repository, and brings the stack up.
Point the domain's A record at the printed address and Caddy issues the
certificate on first request — no certbot, no cron, no manual DNS step.

State is local and apply is run by a person, deliberately. The infrastructure is
one server that changes rarely; what changes on every merge is the application.
Wiring `terraform apply` into CI would need remote state and would let a merge
replace a machine, which is not a trade worth making for a single host.

### Releases

Push to `main` → CI runs lint, typecheck, tests, and both image builds → Deploy
runs only if CI passed. It rolls the host forward to that commit, waits for
`/api/health` to report the database up, and rolls back to the previous commit
if it does not within two minutes.

The deploy key is restricted to a **forced command**: it can run
`deploy/host-deploy.sh` and nothing else — no shell, no port forwarding. The
commit arrives through `SSH_ORIGINAL_COMMAND`, which is attacker-controlled by
definition, and is matched against `^[0-9a-f]{40}$` before it reaches `git`.
That matters because the demo currently shares a host with unrelated production;
a key that leaks is a redeploy, not a machine.

Secrets: `DEPLOY_HOST`, `DEPLOY_USER`, `DEPLOY_SSH_KEY` in the repository's
Actions secrets. Terraform reads `hcloud_token` from `terraform.tfvars`, which
is not committed.

## Tests

142, across three levels.

- **Unit** — configuration, error rendering, the health route against a stub.
- **Integration** — everything touching SQL, against a real TimescaleDB started
  by Testcontainers. Mocking the driver would assert that the code calls a
  function, which proves nothing about the answer.
- **Wiring** — the built server against a real database. A route registered on
  the wrong path, or a repository never passed in, passes every stubbed suite.

The third level exists because of a real failure: every test was green and the
application was broken, because a path was hardcoded in the entrypoint and
nothing exercised the entrypoint.

## Repository

```
api/            Fastify, migrations, repository, ingest and aggregate routes
web/            React, Vite, the dashboard
perf/           k6 load scripts
docs/           measurements
openspec/       one change per increment: proposal, design, spec, tasks
```

`openspec/` is the record of how this was built. Each increment was proposed and
specified before it was written, and its spec is in `openspec/specs`. The
archived changes carry the reasoning, including the decisions that were made and
then measured to be wrong.

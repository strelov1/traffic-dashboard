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
pnpm verify        # lint, typecheck, then tests — 164 of them
```

Integration suites start a throwaway TimescaleDB with Testcontainers, so Docker
must be running. Nothing is mocked at the database boundary: the behaviour worth
testing there is the SQL.

## API

| Method | Path | |
|---|---|---|
| GET | `/api/health` | process and database reachability |
| GET | `/api/traffic/by-country` | totals per plate country, largest first; optional `from`, `to` |
| GET | `/api/traffic/by-vehicle-type` | totals per vehicle type, largest first; optional `from`, `to`, `country` |
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

### Narrowing an aggregate

Both aggregates take an optional period as `from` and `to`, read as the
half-open interval `[from, to)` so that adjacent periods tile a timeline without
an hour falling in two of them. Either bound may be omitted, and an omitted
bound is unbounded on that side — never a default the server picked.

Bounds carry an explicit zone offset, because the request must not depend on
whichever zone the server happens to run in. The totals are hourly, so a bound
partway through an hour cannot be honoured: the range is **rounded outward** to
hour boundaries in UTC before it reaches SQL, and the response says which period
it actually covered.

```bash
curl 'localhost:3000/api/traffic/by-country?from=2026-03-04T13:30:00Z'
# {"data":[...],"period":{"from":"2026-03-04T13:00:00.000Z"}}

curl 'localhost:3000/api/traffic/by-country?from=2026-03-04T12:00:00Z&to=2026-03-04T11:00:00Z'
# {"error":"from must not be later than to: from=2026-03-04T12:00:00Z, to=2026-03-04T11:00:00Z"}
```

Outward, never inward: the answer then covers at least what was asked for. A
range narrowed instead would under-report, and nothing in the response would
distinguish that from a quiet stretch of traffic.

`country` narrows the **vehicle-type** aggregate only. On the by-country chart it
would leave a single bar — a drill-down into how one country's traffic is
composed, which is the question the vehicle-type aggregate with a country
already answers. Sending it to `by-country` is a 400 rather than a silently
unfiltered answer.

What this costs is measured in [`docs/performance/filtered-aggregate.md`](docs/performance/filtered-aggregate.md):
a seven-day bound is 2.5× faster than unbounded, a one-day bound 5.1×, and past
about a day the cost is the live tail rather than the filter.

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

**Each panel owns its state, and its own retry.** A failed request blanks one
chart, never the page, and the panel that failed offers the retry — one control
for both would undo that. It is reachable on an ordinary first visit: Compose
starts `web` on a bare `depends_on: [api]`, and the API migrates and may seed
before it listens, so nginx serves the bundle while the API is still silent.
The retry is user-initiated, with no automatic re-request and so no backoff to
get wrong.

**The filter lives in the URL, and the period is a preset rather than a date
picker.** The URL is the state, read through `useSyncExternalStore`, rather than
a copy of it kept in step — with a copy, pressing back changes the address and
nothing else, and the controls end up disagreeing with the charts. Presets travel
as `?period=7d`, not as the instants they resolve to: a link that pinned
yesterday's instants would answer a question nobody asked when opened tomorrow.
A value the dashboard does not offer falls back to the default rather than
rendering an error, and the controls then show what is actually in effect.

**The country narrows one chart, and the headline follows both controls.** The
by-country chart is not narrowed by a country — reduced to one bar it answers a
different question — so it is keyed on the period alone and holds still while the
reader changes country. The headline is that country's entry in the by-country
aggregate already on hand, never a further request, and the filter in effect is
stated beside the number: a total that silently ignored the controls next to it
would be a claim the reader has no way to check.

**The dashboard writes as well as reads, and says what that costs.** A form
records one detection through the same `POST` a camera would use, and both
charts re-read once the API takes it: the detection lands in the hour that is
served live, so the figures move rather than the page merely reporting a
success. The plate country is free text that nothing in the browser validates —
a field that could not submit `Oman` could never show the API refusing `Oman` —
so what the reader gets back is the request schema's own words. The vehicle
classes are the set the API accepts, kept from drifting by a test that reads the
domain module rather than a copy of it. And the button sits on an
unauthenticated endpoint, which the page states beside it rather than leaving to
this file.

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
| ~~Filters over arbitrary date ranges~~ — **done**, see below | Round the range to bucket boundaries before it becomes a cache key | Arbitrary ranges make the key space unbounded and the hit rate collapses |
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

### The one row that is already collected

Date-range filters now exist, so the row above is worth stating precisely: the
API rounds every requested range outward to hour boundaries **before it reaches
SQL**, and states the rounded period in the response. A client can therefore
produce hour-aligned keys and nothing finer, and the dashboard's presets only
ever produce four of them. The key space was bounded by the contract rather than
by a cache that would have had to round the same range a second time.

The cache itself is still **not built**, and that is deliberate rather than
unfinished. There is no measured need: on a million rows the unbounded read is
19.8 ms, not the 1.84 s p95 that made caching the first row of this table. A
cache added now would also sit exactly where the new predicate is and hide it.
The measurement is in
[`docs/performance/filtered-aggregate.md`](docs/performance/filtered-aggregate.md),
including the part that contradicted the expectation: the events table was
already being narrowed to one chunk by the continuous aggregate itself, and what
the filter excludes is a chunk of the *aggregate's* hypertable.

### What is not measured here

The load test exercises **reads**. Writes cannot be cached and were not part of
the tiers above; the write path is a batch insert and the honest position is
that its ceiling is unmeasured. That, and an unauthenticated write path, are the
first two things a real deployment would need — and the dashboard's record
control now puts a button on the second one, which is why it says so there too.

The load test also exercises the **unbounded** read only. The filtered tiers in
`docs/performance/filtered-aggregate.md` are plan-level measurements of the
query, not end-to-end p95 under concurrency; the two are not interchangeable.

## Freshness, and its bound

A detection recorded now is counted now: the current hour is never materialised
and is served live.

A detection that arrives **late** — buffered by a camera, delivered minutes or
hours after it happened — is counted when the refresh policy next covers its
hour. The policy re-materialises a trailing seven days every five minutes, so
seven days is the stated maximum lateness the system tolerates for an
**arrival**. Later than that and it stays in `traffic_events`, uncounted, until
a refresh is requested for that period.

This is a real way to be wrong quietly: the number is lower than the truth, with
no error anywhere. Tests pin the boundary and the policy's own arguments, so
changing the bucket width or an offset fails a suite rather than a report.

**A correction or a removal has no such bound**, and it is worth being precise
about why the two differ. Real-time aggregation only ever *adds* rows newer than
the watermark; it cannot subtract a deleted detection or re-classify a corrected
one. Below the watermark the materialised value is the whole answer, so a
mutation there would have gone unnoticed forever — and in the opposite direction:
the total would read **higher** than the truth, not lower.

So a mutation refreshes the hour it touched, unless that hour is the current one.
The exception is not an optimisation: materialising the current bucket would move
the watermark past detections recorded into that same hour afterwards, counted
then by neither side. Deciding on "is this the current bucket" rather than on the
policy's seven days also keeps that number in the migration that declares it.

The cost is one refresh over a single hour per correction, on a path a human
drives. The seam: `refresh_continuous_aggregate` cannot run inside a transaction,
so it follows the committed mutation — a crash between the two leaves the total
stale, which the policy repairs if the hour is inside its window and does not if
it is outside. The mutation's own answer stands either way; a 500 for a write
that succeeded would be the worse lie.

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

298, across three levels.

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

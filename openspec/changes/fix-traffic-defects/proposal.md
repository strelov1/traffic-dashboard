## Why

A review of the finished system found defects that a reader can reproduce in a minute, on the two things the brief weights most.

**The charts disagree with the database after a correction.** `traffic_hourly_totals` is reconciled only by the refresh policy's trailing seven days. `updateEvent` and `deleteEvent` are plain DML, and nothing outside the seed ever calls `refresh_continuous_aggregate`. Correcting or removing a detection older than that window is applied to `traffic_events` and never to the totals. Measured against the shipped seed: after one delete and one correction, the dashboard read `car 124779 / bus 20685` while the table held `124777 / 20687`. The API answered `204` and `200`. There is no error anywhere — the number is simply wrong, permanently. Since the seed spans thirty days, most of the shipped data sits in that region.

The README bounds this in the wrong direction. "Freshness, and its bound" covers late *arrivals* and states the number runs low; for a correction or a removal it runs **high**. Two tests look like they cover it and do not — both build their event with `new Date()`, which lands in the current hour, which is never materialised and is served live, so they pass without touching the case.

**Two documented commands do nothing.** `perf/aggregate-load.js` defaults to port 3399 while Compose publishes 3000, so `RATE=500 k6 run perf/aggregate-load.js` — the command the README explicitly invites a reviewer to run — fails every request. And `SEED_EVENTS` is never passed into the api container, so `SEED_EVENTS=0` still writes 250 000 rows and the 4M-row performance reproduction cannot be run at all.

## What Changes

- **A mutation refreshes the bucket it touched**, when that bucket is strictly older than the current hour. Not "older than the policy window": that would duplicate the migration's number in code, and the current-hour guard is what actually matters — materialising the current hour would move the watermark and hide every detection recorded into that hour afterwards, which migration 0004 warns about and an existing test pins.
- `DELETE_EVENT` returns the instant alongside the id. It has to; the bucket cannot be computed from the id.
- **The freshness section is corrected**, not merely extended. Late arrivals keep their seven-day bound. Corrections and removals no longer have one.
- **A leap-second instant answers 400 instead of 500.** `23:59:60` is a legal RFC 3339 instant that ajv admits and `new Date` cannot represent; it currently reaches the driver as `NaN`. This closes the SEAM left in `domain/detection.ts` by the restructure.
- **The API shuts down.** `SIGTERM` and `SIGINT` close the server and drain the pool, instead of aborting in-flight requests. `Database.close` stops being dead code in production.
- **The one-time backfill leaves the seed's empty-table branch.** Today a database that is not seeded never gets one, so a bulk history load is counted until the policy first fires and then partly uncounted, with no error.
- `PATCH` declares its 200 response schema, like every other traffic route.
- `perf/aggregate-load.js` targets 3000; `SEED_EVENTS` is passed to the api service.
- **Four tests stop passing for the wrong reason:** the policy's offsets are asserted (nothing reads them today, though a comment and the README claim otherwise); the "broken migration" test actually runs the broken migration instead of tripping `checkOrder`; a route is driven through a rejecting repository; and the mutation boundary is pinned with events dated outside the live tail.

## Capabilities

### Modified Capabilities

- `traffic-data`: a correction or removal reconciles the maintained totals, and the stated lateness bound applies to arrivals only.
- `traffic-ingest`: an instant that is well-formed but unrepresentable is rejected with 400; `PATCH` declares its response.
- `service-health`: the process terminates gracefully on a signal.

## Impact

- **Behaviour:** mutations become slower by one `refresh_continuous_aggregate` over a single hour when the event is not in the current hour. Corrections are rare and human-initiated; correctness on a displayed number is worth more than the call.
- **Constraint:** `refresh_continuous_aggregate` cannot run inside a transaction block, so it is a separate statement after the mutation commits — which means a crash between the two leaves the aggregate stale. That is the pre-existing state, not a regression, and the policy still repairs anything inside its window.
- **Docs:** the freshness section changes meaning; the performance docs' reproduce blocks start working.
- **Not here:** the frontend defects (grid overflow below 360px, light-mode contrast, no retry) and the general documentation rework are separate changes. The retry path is shared with the two queued follow-ups and belongs with them.

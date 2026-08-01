## Context

The read path sums `traffic_hourly_totals`. That view is the union of two things: buckets materialised below the watermark, and raw events above it scanned live on every request (`materialized_only = false`).

Real-time aggregation only **adds** the live tail. It cannot subtract, and it cannot correct. So for any bucket already below the watermark, the materialised number is the answer, and the only thing that changes it is a refresh. The policy refreshes a trailing seven days every five minutes; nothing else ever does.

That makes the failure precise: `update`/`delete` against a row below the watermark changes `traffic_events` and leaves the totals untouched, and no request can tell.

## Goals / Non-Goals

**Goals:**

- A correction or removal is reflected in the totals by the time the mutation's response is written.
- The existing guarantee — a detection recorded now is counted now — survives unchanged, with a test that would fail if it did not.
- The lateness bound in the docs describes what the system does, in the right direction.
- Four tests that currently pass for the wrong reason are made to test what their names claim.

**Non-Goals:**

- No change to the read path, the bucket width, or the policy's arguments. The policy stays the mechanism for late *arrivals*; this change only adds a path for mutations.
- No retry, queue, or outbox around the refresh. A crash between the mutation and the refresh leaves the aggregate stale — which is exactly today's behaviour for every mutation, so nothing regresses, and building durable reconciliation for a correction path with no measured volume is the overengineering AGENTS.md forbids. The seam is noted, not built.
- No frontend work, and no general documentation rework.

## Decisions

**Refresh on "older than the current hour", not on "outside the policy window".**

The obvious rule — refresh only when the policy will not — needs the policy's `start_offset` in application code, duplicating the number that lives in migration 0004 and creating a second place to change it.

The rule chosen instead is a guard rather than a window: refresh the affected bucket unless it is the current one. Three things follow.

- It cannot break the live tail. Materialising the current hour moves the watermark to the end of that hour, and every detection recorded into that hour afterwards falls below it — counted by neither side. Migration 0004's comment names this as the reason `end_offset` is a whole bucket; the guard is the same reasoning applied to an on-demand refresh.
- It needs no knowledge of the policy. The condition is derived from the event's own instant.
- It makes corrections inside the seven-day window immediate rather than up to five minutes late. That is a redundant refresh, and it buys consistency between the response and the next read.

Cost: one `refresh_continuous_aggregate` over a one-hour range per mutation of a non-current event. Bounded and small, on a path a human drives.

**The refresh is a separate statement, not part of the mutation.** `refresh_continuous_aggregate` cannot run inside a transaction block. It therefore follows the committed mutation, and the window between them is a real gap. Stated here rather than hidden: the policy still repairs anything inside seven days, and outside it the exposure is one lost refresh on a crash — smaller than the current exposure, which is every mutation.

**`deleteEvent` returns the instant.** The bucket cannot be derived from an id, and reading the row before deleting it would be a second round trip with a race in between. `returning id, occurred_at` costs nothing.

**The instant invariant lands in `domain/detection.ts`.** That is the seam the restructure left, and the reason the file exists. `toEvent` is the only place untrusted input becomes an event, so a rejected instant is rejected once, for every ingress, rather than per route.

**The backfill moves out of the empty-table branch.** It consults the invalidation log, so a repeat boot is cheap; guarding it on emptiness is what makes a non-seeded database inconsistent.

## Risks / Trade-offs

**A refresh on the mutation path is a new failure mode → keep the mutation's outcome authoritative.** If the refresh fails, the row has already changed. The response must not claim otherwise. The mutation's status stands; the refresh failure is logged, and the policy repairs it if the bucket is inside the window. A 500 after a successful delete would be worse than a stale chart.

**"Older than the current hour" is evaluated where?** In SQL against `now()`, not in Node against the process clock — the database's clock is the one the bucket boundaries were computed with, and a skewed container clock would otherwise decide whether the current hour gets materialised.

**The four test fixes may reveal that something else was resting on the wrong behaviour.** That is the point of making them honest, and it is why they are separate tasks with their own RED.

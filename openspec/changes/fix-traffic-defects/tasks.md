## 1. Make the two inert commands work

- [x] 1.1 `perf/aggregate-load.js`: default `TARGET` to port 3000, matching what Compose publishes. Verify by running the README's command verbatim and seeing requests succeed.
- [x] 1.2 `docker-compose.yml`: pass `SEED_EVENTS` to the api service. Verify by booting with `SEED_EVENTS=0` and confirming the table is empty — it currently writes 250 000.

## 2. Pin the mutation defect before fixing it

- [x] 2.1 RED: a test that deletes an event dated outside the trailing window and asserts the totals drop. It must fail today — if it passes, it is using the current hour and is not testing the boundary.
- [x] 2.2 RED: the same for a correction, asserting one detection moves between classes.
- [x] 2.3 RED: a test that corrects an event in the current hour, then records another into that same hour, and asserts both are counted. This is the guard the fix must not break; watch it pass now, and keep it passing.

## 3. Reconcile the aggregate on mutation

- [x] 3.1 `DELETE_EVENT` returns `occurred_at` alongside the id, so the affected bucket is known without a second read.
- [x] 3.2 Add the refresh path: after a committed mutation, refresh the one-hour bucket containing the event unless that bucket is the current one. Decide "current" in SQL against the database's clock, not the process's.
- [x] 3.3 A failing refresh must not change the mutation's outcome — the row already changed. Log it and answer as the mutation dictates.
- [x] 3.4 Watch 2.1 and 2.2 go GREEN and 2.3 stay GREEN. Run the whole suite.

## 4. Close the instant seam

- [x] 4.1 RED: posting a detection with `occurredAt` of `23:59:60` answers 400 and records nothing. It answers 500 today.
- [x] 4.2 Reject the unrepresentable instant in `domain/detection.ts`, where `toEvent` constructs it — once, for every ingress. Remove the SEAM comment the restructure left.
- [x] 4.3 GREEN, and confirm a normal `occurredAt` still round-trips.

## 5. Stop the process properly

- [x] 5.1 RED: a test that a termination signal closes the server and the pool. If this cannot be driven honestly in-process, assert the wiring instead and say so in the test's name rather than pretending.
- [x] 5.2 Handle `SIGTERM` and `SIGINT` in `index.ts`: close the server, then the database. `Database.close` stops being dead code.
- [x] 5.3 GREEN. Verify against a container: `compose up`, `compose stop`, and no unexpected-EOF entries in the database log.

## 6. Backfill unconditionally

- [x] 6.1 RED: with an unseeded database, record events spanning more than the trailing window through the API, run the policy, and assert the totals still count them.
- [x] 6.2 Move the backfill out of the seed's empty-table branch so it runs at startup regardless.
- [x] 6.3 GREEN, and confirm a repeat boot stays cheap — the invalidation log is what makes that true, so assert the second run does not rewrite everything.

## 7. Make four tests test what they claim

- [x] 7.1 Assert the policy's `start_offset`, `end_offset` and `schedule_interval` from `timescaledb_information.jobs`, on a container that has not had its jobs deleted. Prove it has teeth by changing one offset and watching it fail. This is the test `testing/postgres.ts:29` and the README already claim exists.
- [x] 7.2 The "broken migration" test currently trips `checkOrder` and never runs the broken SQL. Give it its own container, and assert the rejection names the real cause rather than accepting any throw.
- [x] 7.3 Drive a read route through a rejecting repository: assert 500 and `{ error: 'Internal Server Error' }` with no driver text. Same for the write route.
- [x] 7.4 `PATCH` declares its 200 response schema; assert an undeclared stored field never reaches the body, matching the existing test for the aggregates.

## 8. Correct what the docs now claim

- [x] 8.1 Rewrite "Freshness, and its bound": the seven days bound arrivals only, corrections and removals are reconciled at any age, and the two error directions are opposite. This section currently states the bound backwards for mutations.
- [x] 8.2 Note the refresh-on-mutation cost where the write path is described, and the crash-window between mutation and refresh. It is a real seam and belongs in the README, not in a comment.

## 9. Verify

- [x] 9.1 `pnpm verify` — lint, typecheck, whole suite green.
- [x] 9.2 Reproduce the original defect end to end: boot the stack, delete and correct events older than the window, and confirm the endpoints now agree with `select count(*) group by`. This is the measurement that started the change.
- [x] 9.3 Run the README's k6 command verbatim and confirm it reports numbers rather than connection refused.
- [ ] 9.4 Invoke `simplify` on the diff, then re-run the suite.
- [ ] 9.5 Request code review; fix Critical and Important before marking the change done.

## Why

Two sentences in `openspec/specs/traffic-api/spec.md` describe a system that is not the one running. Both arrived with `add-dashboard-filters`, and the previous commit reported them rather than fixing them, because correcting a spec means a change with a delta and not an edit to a generated file.

**The empty period contradicts itself.** The refusal requirement says a period whose start equals its end "is an empty interval, and it is answered as an empty aggregate with the period echoed back". `toPeriod` floors `from` and ceils `to` unconditionally, so `from=to=2026-03-04T12:30:00Z` becomes `[12:00, 13:00)`: a whole hour of detections counted, under a period the client never sent. Both halves of the sentence are true only when the equal bounds already sit on an hour, and that is the only case the suite covers — `period.test.ts` and `aggregate-routes.test.ts` both use 12:00 and 13:00 exactly.

**The scaling requirement credits the wrong table.** It says "the events table is partitioned by time, and a bounded period SHALL let the query plan exclude the partitions outside it". `docs/performance/filtered-aggregate.md`, written by the same change, measured the opposite: the unbounded plan already touches one of six `traffic_events` chunks, because the continuous aggregate's own `occurred_at >= watermark` predicate excludes the other five before any filter is involved. What the period narrows is `traffic_hourly_totals`, the aggregate's own hypertable. The repository's own spike section says so plainly — "the bound does exclude a partition, but not the one the proposal expected" — and the requirement was never brought into line.

That requirement also carries a scenario, "A bounded period reads less than an unbounded one", that nothing in the repository asserts. It reads as covered and is not.

## What Changes

- The equal-bounds sentence is narrowed to what the code does, and gains the sub-hour case it never had. **The code does not change**: rounding stays one unconditional rule, and the argument for choosing that over the alternative is in `design.md`.
- The scaling requirement's second paragraph is rewritten from the measurement, quoting its numbers rather than new ones, and gains the live tail as the floor a period cannot lower.
- The unasserted scenario gets an assertion. `chunk-exclusion.test.ts` explains the statement the repository actually issues, bounded against unbounded, and counts the chunks each plan names — of the maintained totals, where the difference is, and of the events table, where there is none.

## Capabilities

### Modified Capabilities

- `traffic-api`: the equal-bounds rule states what rounding does to bounds inside an hour, and the scaling requirement names the partitions a period really excludes.

### New Capabilities

None. Nothing here changes what the API answers.

## Impact

- **API:** no source change. Two tests added to the existing files, one new integration file.
- **Specs:** two requirements modified in `traffic-api`, one scenario added to each.
- **Docs:** none. `docs/performance/filtered-aggregate.md` is the source this change defers to, and it is left exactly as it is.
- **Risk:** low, and it is the risk of narrowing a spec toward its implementation rather than the other way round. Named and argued in `design.md` instead of taken quietly.

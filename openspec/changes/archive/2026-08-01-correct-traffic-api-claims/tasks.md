## 1. The equal-bounds period

- [x] 1.1 `period.test.ts`: equal bounds inside an hour widen to that hour. Green on arrival, since this change does not move the code — so prove it discriminates instead, by special-casing `from === to` to return the bounds unrounded and watching it fail.
- [x] 1.2 `aggregate-routes.test.ts`: the same request through the built server states `[12:00, 13:00)` in `period` and asks storage for those bounds, not the ones sent. Broken the same way, and it fails the same way.
- [x] 1.3 Retitle the existing equal-bounds test to say "on the hour", which is the only case it ever covered.
- [x] 1.4 Narrow the requirement's third paragraph to both cases and add the sub-hour scenario. The rounding requirement is left alone: it already says rounding is unconditional, and it is now the only place that says it.

## 2. What a period actually excludes

- [x] 2.1 Read `docs/performance/filtered-aggregate.md` before writing anything, and reproduce the shape of its measurement on a throwaway container: chunk counts per hypertable, and the plans for a bounded and an unbounded read.
- [x] 2.2 `chunk-exclusion.test.ts`: capture the statement the repository issues through a recording `Database`, `explain` both against the container, and count the chunks each plan names — from `timescaledb_information.chunks` rather than a hardcoded prefix.
- [x] 2.3 Assert the bounded plan names fewer chunks of the maintained totals. Prove it: force `totalsQuery` to drop the `from` bound and watch 7 against 7 fail.
- [x] 2.4 Assert the events table is named one chunk deep in both plans while holding more than one chunk. Prove it: remove the refresh from the fixture and watch it read 57.
- [x] 2.5 Rewrite the requirement's second paragraph from the measurement's own numbers, add the live tail as the floor, and give the unasserted scenario the assertion 2.3 now provides.

## 3. Verify

- [x] 3.1 `openspec validate correct-traffic-api-claims --strict`.
- [x] 3.2 `pnpm verify` — lint, typecheck, whole suite. Report the new counts against the 195 API and 111 web this branched from.
- [x] 3.3 Archive, and confirm the two requirements in `openspec/specs/traffic-api/spec.md` were written by `openspec archive` rather than by hand.

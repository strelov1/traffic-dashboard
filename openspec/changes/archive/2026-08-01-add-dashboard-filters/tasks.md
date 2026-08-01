## 1. The period, as a domain value

- [x] 1.1 RED: unit tests for rounding a period — a sub-hour start floors, an end already on the hour stays, an end past the hour ceils, a bound at `+05:30` rounds to a UTC hour and not a local one, an inverted range throws naming both bounds, an equal start and end is a legal empty period, and a leap second is refused.
- [x] 1.2 Move `UnrepresentableInstant` and the instant check into `domain/instant.ts`, taking the field it guards so the message names `from`, `to` or `occurredAt`. `domain/detection.ts` uses it; its existing tests stay green.
- [x] 1.3 `domain/period.ts`: `Period`, `UNBOUNDED`, and the parser that validates order on the raw values and then rounds outward. GREEN, and break the ceiling by one hour to watch the boundary tests fail.

## 2. The filtered read

- [x] 2.1 RED, against Postgres: `totalsByCountry` and `totalsByVehicleType` for a bounded period count only the buckets inside it; an event exactly on the hour boundary is counted by the period that starts on it and not by the next one; two adjacent periods sum to the whole; a period entirely in the future and one entirely before the data are both empty.
- [x] 2.2 RED: `totalsByVehicleType` narrowed to a country counts only that country, and a country with no detections is an empty result rather than an error.
- [x] 2.3 `ports.ts`: `totalsByCountry(period)` and `totalsByVehicleType(period, plateCountry?)`, with the country's absence from the first one explained where it is declared.
- [x] 2.4 Compose the `where` in `postgres-repository.ts` from the bounds present, values still bound as `$n`. No `($1 is null or …)` — it cannot exclude a chunk. Existing call sites state `UNBOUNDED`.
- [x] 2.5 GREEN. Prove the tests discriminate: swap `hour < $to` for `hour <= $to` and watch the adjacent-period test fail; drop the country predicate and watch 2.2 fail.

## 3. The endpoints

- [x] 3.1 RED, through the built server: `from`/`to`/`country` are accepted; a malformed date-time, a date-time with no zone, a leap second, an inverted range and a malformed country are each `400` naming the field; `country` on the by-country route is refused.
- [x] 3.2 RED: the response envelope carries the rounded `period`, a request with no bounds states no bounds, and a sub-hour bound comes back rounded.
- [x] 3.3 Extract the shared field fragments (`plateCountry`, `vehicleType`, the instant) into `http/fields.ts`; ingest and aggregate routes both name them rather than repeating the pattern.
- [x] 3.4 Declare the query schema and the extended response schema in `aggregate-routes.ts`, parse the period through the domain, and map its refusals to `400` the way the ingest route already maps an unrepresentable instant.
- [x] 3.5 GREEN, whole api suite.

## 4. The controls

- [x] 4.1 RED: `useAsync` re-runs when its key changes, drops the response of the run a key change superseded, and does **not** re-run when the loader's identity changes but the key does not. The last one is what proves the key rather than identity drives it.
- [x] 4.2 Give `useAsync` a required key; hold the loader in a ref so a fresh closure alone never refetches.
- [x] 4.3 RED: `filters.ts` — parsing a query string, serialising it back, an unknown period falling back to the default, a malformed country ignored, and the two chart keys differing in exactly the way that keeps the country chart still when only the country changes.
- [x] 4.4 Implement `filters.ts` and `useUrlFilter.ts`: the filter is read from `location.search` through `useSyncExternalStore`, written with `pushState`, and `popstate` restores it.
- [x] 4.5 RED: the API client sends `from`, `to` and `country` as query parameters, omits what is absent, and still parses the envelope now that it carries a period.
- [x] 4.6 Implement the client's query parameters. Note at the seam why the covered period is parsed and not surfaced.

## 5. The dashboard

- [x] 5.1 RED: choosing a period re-reads both aggregates; choosing a country re-reads only the vehicle-type one; the headline follows the country; the filter in effect is stated beside the headline; the country list is drawn from the country aggregate and includes a country that came from the URL but is absent from the data.
- [x] 5.2 Build the controls component and wire the filter through `App`, `main.tsx` and the styles.
- [x] 5.3 GREEN, whole web suite. Break the vehicle-type key so it ignores the country, and watch the refetch test fail.

## 6. Measure, and say what was measured

- [x] 6.1 `EXPLAIN (analyze, buffers)` a bounded read against an unbounded one on the seeded container, and record chunks touched and execution time in `docs/performance/`. If the plan does not show fewer chunks, record that instead — the file states what was measured, never what was expected.
- [x] 6.2 README: the scaling table's "arbitrary date ranges" row now describes something that exists; say what the API accepts, that a range is rounded to the hour before it is a key, and that the cache itself is still not built.

## 7. Verify

- [x] 7.1 `pnpm verify` — lint, typecheck, whole suite green. Report the new test count.
- [x] 7.2 Drive the stack by hand: open a filtered link cold, change both controls, go back, and confirm the URL, the charts and the headline agree at every step.

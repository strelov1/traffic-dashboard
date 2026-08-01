## Context

Both aggregates read `traffic_hourly_totals`, keyed `(hour, plate_country, vehicle_type)`, and neither read narrows anything: no `where`, so every chunk of the hypertable is touched and the group spans all of history. The dashboard renders what it is given.

Three constraints shape what a filter can mean here.

- **The grain is an hour.** The materialised side stores one row per hour per category. A period boundary finer than an hour cannot be honoured by a read of that view; asking for it would mean either lying or falling back to the events table, which is the scan the aggregate exists to avoid.
- **The view is half materialised.** Everything below the watermark is stored; the current hour is scanned live. A predicate on `hour` has to be correct on both sides of that union, and the live side computes `hour` from `occurred_at` per row.
- **A range is a cache key.** The README's scaling table already names arbitrary ranges as the thing that collapses a cache's hit rate, and names rounding as the answer. Nothing caches yet, but the shape of the key is decided now, by whatever the API accepts.

## Goals / Non-Goals

**Goals:**

- Both aggregates take an optional period; the vehicle-type aggregate also takes a plate country.
- The period a request actually covers is stated in its response, because it is not always the period asked for.
- A malformed, unrepresentable or inverted range is a 400 that names the field, decided before any SQL runs.
- The dashboard's two controls live in the URL, and the headline agrees with them.
- Every boundary that could be off by one is pinned by a test that fails if it is: an event exactly on the hour, two adjacent ranges that must not double-count, an offset that is not UTC, an empty match, an inverted range.

**Non-Goals:**

- **No cache.** This change decides the key space; it does not build the cache. There is no measured need yet, and a cache added now would hide the very predicate this change is about.
- **No index.** The aggregate is small and prefix-ordered by `(hour, plate_country, vehicle_type)`. Whether an index helps is a question for a measurement, and the measurement is part of this change; adding one first would be guessing.
- **No country filter on the by-country chart.** It would leave one bar. That is a drill-down into a different question, and it is not this one.
- **No free date picker.** See the decision on presets below.
- **No detection form, no docs rework.** Separate changes.

## Decisions

**A period is a half-open interval `[from, to)`, and both bounds are optional.**

Closed at both ends is the intuitive reading and the wrong one: `[Jan 1, Feb 1]` and `[Feb 1, Mar 1]` then both contain the bucket at Feb 1 00:00, and any client tiling a timeline double-counts an hour at every seam. Half-open tiles exactly. It also matches how the bucket itself is defined — `time_bucket` assigns an event at 13:00:00.000 to the 13:00 bucket, not to the 12:00 one — so the interval arithmetic and the bucket arithmetic agree instead of differing by an hour at one end. The cost is that `to = 12:00` excludes the 12:00 hour, which is surprising exactly once and is stated in the spec.

Either bound may be omitted, and an omitted bound is unbounded on that side rather than defaulted to `now` or to the first event. A default would be a period the caller did not ask for and cannot see.

**The range is rounded outward, in the domain, before it reaches SQL.**

`from` floors to the hour, `to` ceils to the hour when it is not already on one. Outward, never inward: the answer then covers at least what was asked for, and an aggregate that quietly reports less than the requested window would be indistinguishable from a quiet period in the traffic.

Two motives, one mechanism. The aggregate cannot honour a sub-hour boundary at all, so rounding is what makes the answer true rather than approximately true. And a rounded range has at most one key per hour, which is the bounded key space the README's cache tier depends on — decided here, where the input is accepted, rather than later inside a cache that would have to round the same range a second time.

Rounding lives in `traffic/domain/period.ts`, beside `toEvent`. It is the same shape of rule: the one place untrusted input becomes a domain value, stated once for every ingress rather than per route. The bucket width is a fact about the published aggregate, which is why the domain may hold it; it is already restated in `infra` (`time_bucket('1 hour', …)`) and in migration 0004, and a mismatch between them is caught by an integration test rather than by a type.

**The rounded period is in the response.** A contract that silently widens its input has to say so, and `period` in the envelope is the cheapest possible way to say it: the client can render exactly what it was given. This is also what makes the rounding testable from the outside rather than only through a repository stub.

**Rounding is UTC, and the caller's offset is required, not assumed.** `format: 'date-time'` in ajv rejects a date-time with no zone designator, so a caller always states the offset and the server never guesses one. Rounding then happens on the instant, in UTC — `time_bucket('1 hour', …)` on a `timestamptz` buckets on UTC hour boundaries, so the two must agree. This is only invisible while every offset is a whole hour: at `+05:30`, flooring in the caller's local hour and flooring in UTC give answers thirty minutes apart, and a test uses that offset for exactly that reason.

**Validation of the range order happens on the raw values, before rounding.** `from > to` is a client mistake and is a 400 naming both fields. `from == to` is not: it is a legal empty interval, and it answers an empty aggregate with the period echoed back, which tells the caller more than an error would. Rounding cannot turn a valid range into an inverted one — flooring never moves `from` up, ceiling never moves `to` down — so checking first is checking the value the client actually sent, and the message can quote it.

**`UnrepresentableInstant` moves to `domain/instant.ts` and names its field.** `23:59:60` is a legal RFC 3339 instant that ajv accepts and `Date` cannot hold; the check already existed for `occurredAt` and is now needed for `from` and `to`. One check, three fields, and the message names which one — the alternative is the same eight lines copied into the period parser, with a hard-coded field name in the message.

**The filter is composed into the SQL, not written as `($1 is null or hour >= $1)`.**

The null-guard form is one static string and reads well, and it defeats the whole point: a predicate whose truth depends on whether a parameter is null cannot be used to exclude chunks at plan time, so the bounded read would touch every chunk anyway — the thing this change exists to demonstrate. The composed form appends a clause per bound that is present, with the values still bound as parameters. It is a `where` list and a values array, about ten lines, and it keeps `$n` placeholders throughout: no value is ever interpolated into SQL.

**The repository takes the period as a required argument.** Not optional-with-a-default: an unfiltered read is now a *choice*, and the failure mode of forgetting it — all-time totals rendered under a filtered heading — is a wrong answer that looks right. `UNBOUNDED` is exported so a caller that means all of history says so.

**`totalsByVehicleType` takes the country; `totalsByCountry` does not.** The asymmetry is the point, and the port is where it should be visible. A shared filter object accepted by both, with one of them ignoring a field, would make the deliberate choice look like an oversight — and would silently ignore a country a caller passed.

**The dashboard's period control offers presets, and the URL carries the preset rather than two instants.**

A free date picker would produce arbitrary instants, which the server rounds anyway, and would be a disproportionate amount of UI for a page with two bar charts. Presets (24 hours, 7 days, 30 days, all time) are the questions a traffic dashboard is actually asked.

The URL carries `?period=7d`, not the instants it resolves to. A relative preset is what the reader chose — "the last seven days" — and a link that pins yesterday's instants would answer a question nobody asked when it is opened tomorrow. The instants are computed at request time, which also means the browser's clock only ever produces a *request*; the boundary is decided by the server's rounding, and the response says what it decided.

**Each chart is keyed by what its own request depends on.** The by-country request depends on the period; the vehicle-type request depends on the period and the country. Keying both on the whole filter would reload the country chart whenever the country changed — a chart flashing "Loading…" to arrive at exactly the same bars. The keys are two functions in `filters.ts`, and a test asserts the country chart is not refetched when only the country changes.

**`useAsync` gains a key rather than relying on the loader's identity.** The hook already re-runs when `load` changes identity, and its comment said a parameterised request belongs in that identity. In practice that makes correctness depend on the caller's memoisation discipline: a `useCallback` with a missing dependency silently serves stale data, and a missing `useCallback` is an infinite request loop. Neither is caught by a type. A declared key makes the re-run condition data instead of identity, and the loader is read from a ref at run time so a re-render with a fresh closure never re-fetches by itself. The key is required — a hook whose default is "never re-key" would put the bug back for anyone who forgets it.

**The headline follows the country too, and reads it from data already fetched.** With a country selected, the headline is that country's entry in the by-country aggregate; otherwise it is the sum of them. No extra request, and no chance of the headline and the chart disagreeing because they were fetched at different moments. A caption states the filter in words, so the number is never presented without its scope.

**The dashboard does not render the covered period.** The API states it because a machine consumer cannot otherwise know what it received. A reader who asked for "last 7 days" and is shown "covering from 13:00 on the 24th" has been given a boundary they cannot act on and did not choose; the caption names the filter they picked. The seam is that `period` is parsed and discarded on the web side — noted in `api/traffic.ts` rather than built on.

## Risks / Trade-offs

**Outward rounding means the answer covers more than the request → say so in the response, and never round inward.** A reader who asks for "since 13:30" gets the 13:00 hour whole. That is at most one bucket of excess at each end, it is stated in `period`, and the alternative — dropping the partial hour — would under-report with nothing to indicate it.

**A predicate on `hour` must be pushed down to `occurred_at` on the live side, or the bounded read is only correct, not fast.** Correctness does not depend on it: the union produces the same rows either way. The performance claim does, so it is measured with `EXPLAIN` against the seeded container rather than asserted. If the plan does not show fewer chunks, the number recorded is the one that was measured and the claim is dropped.

**A country that matches nothing is indistinguishable from a country with no traffic → both are an empty aggregate, deliberately.** There is no list of valid countries anywhere in the system — the plate country is whatever a camera read, constrained only to two uppercase letters. A 404 for "unknown country" would require inventing that list, and would answer an error for the true statement "no traffic from there in this period".

**The URL is now part of the contract → parse it defensively.** An unknown `period` value or a malformed `country` in a hand-edited or stale link falls back to the default rather than rendering an error page; the controls then show what is actually in effect. The API remains the thing that rejects bad input, and it is the API's 400 that a reader sees if a bad value is somehow sent.

**The performance tiers in `docs/performance` were measured unfiltered.** They still describe the unfiltered read, which is still the default view. A filtered read is measured beside them rather than replacing them, and the file says which is which.

## Why

The charts answer one question — all traffic, all time — and the reader cannot ask a second one. The brief asks for **interactive** graphs; what ships is passive interactivity, a tooltip that reports what the bar already encodes. A filter is the difference between a chart the reader looks at and one the reader interrogates.

It is also the only remaining work that deepens the architecture rather than decorating it, and it collects a debt the README already names:

- **Time partitioning starts paying.** `traffic_events` is a hypertable partitioned by `occurred_at`, and today no query is bounded in time, so every read spans every chunk. A seven-day filter reads one chunk instead of thirty — the property the partitioning was chosen for, exercised for the first time.
- **It walks into the cache problem on purpose.** README already states that arbitrary date ranges make the key space unbounded and collapse the hit rate, and that the answer is rounding a range to bucket boundaries before it becomes a key. This change is where that stops being a plan.
- **It makes the freshness bound visible.** A range ending today is served partly from the live tail; a range ending last month is fully materialised. The two have different costs, and a filter is what lets anyone see that.

## What Changes

- Both aggregate endpoints accept an optional bounded period and an optional plate country, declared in the request schema the way every other input is, so a bad range is a 400 that names the field.
- A range is **rounded outward to bucket boundaries** before it reaches SQL. Two motives, one mechanism: the aggregate is hourly, so a sub-hour boundary cannot be honoured anyway, and an unrounded range is an unbounded cache key. The rounding is part of the contract and is stated in the response, not hidden.
- The country filter applies to the vehicle-type distribution. It deliberately does **not** apply to the by-country chart, where it would leave one bar — that is a drill-down, not a filter, and the two charts answer different questions.
- The dashboard gains two controls: a period and a country. Both are reflected in the URL, so a filtered view is a link.
- The headline total follows the filter. A total that ignored the controls beside it would be a lie the reader has no way to detect.

## Capabilities

### Modified Capabilities

- `traffic-api`: the aggregates take an optional period and country, state the period they actually covered after rounding, and reject a malformed or inverted range.
- `traffic-dashboard`: the reader can narrow both charts, the controls' state lives in the URL, and the headline reports the filtered total.

### New Capabilities

None. This narrows existing answers rather than adding a new one.

## Impact

- **API:** two route schemas gain parameters; the repository's two queries gain a `where` and a `group by` that no longer spans everything.
- **Database:** the hourly aggregate is already keyed by `(hour, plate_country, vehicle_type)`, so a bounded range and a country are both prefix-friendly. Whether an index is warranted is a question to answer by measuring, not by adding one first — the aggregate is small and the planner may not want it.
- **Web:** control state, URL synchronisation, and a refetch path — which `useAsync` does not currently have, since it fetches once and cannot be re-run.
- **Performance:** the tiers in docs/performance were measured against an unfiltered read. They stop describing the whole surface, and a filtered tier has to be measured beside them.
- **Risk:** this is the first change where a wrong answer is plausible rather than theoretical. Off-by-one at a bucket boundary, an inclusive end that double-counts an hour, and a timezone assumed rather than stated are all live. Each needs a test that would fail if it were wrong.

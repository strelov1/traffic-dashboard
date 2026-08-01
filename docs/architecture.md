# Architecture

Why the code looks the way it does. The one decision large enough to stand on
its own — storing detections in TimescaleDB and reading maintained totals — is
in [`adr/0001-timescaledb.md`](adr/0001-timescaledb.md).

## The data

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

## The API

**Responses are declared, not produced.** Fastify serialises from the response
schema, so a column added to the table cannot appear in a payload by accident.
Growing the schema is not the same as changing the API.

**Request schemas restate what the database enforces** rather than deferring to
it. The database is the last line of defence and cannot explain itself to a
caller; the schema is the first, and can.

**A 5xx never carries the underlying message.** A driver failure names the host,
the user, and why authentication failed.

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

Outward, never inward: the answer then covers at least what was asked for. A
range narrowed instead would under-report, and nothing in the response would
distinguish that from a quiet stretch of traffic.

`country` narrows the **vehicle-type** aggregate only. On the by-country chart it
would leave a single bar — a drill-down into how one country's traffic is
composed, which is the question the vehicle-type aggregate with a country
already answers. Sending it to `by-country` is a 400 rather than a silently
unfiltered answer.

What a bound costs is measured in
[`performance/filtered-aggregate.md`](performance/filtered-aggregate.md): a
seven-day bound is 2.5× faster than unbounded, a one-day bound 5.1×, and past
about a day the cost is the live tail rather than the filter.

## The dashboard

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
the README.

## Tests, and the three levels they sit at

- **Unit** — configuration, error rendering, the health route against a stub.
- **Integration** — everything touching SQL, against a real TimescaleDB started
  by Testcontainers on the image Compose runs. Mocking the driver would assert
  that the code calls a function, which proves nothing about the answer.
- **Wiring** — the built server against a real database. A route registered on
  the wrong path, or a repository never passed in, passes every stubbed suite.

The third level exists because of a real failure: every test was green and the
application was broken, because a path was hardcoded in the entrypoint and
nothing exercised the entrypoint.

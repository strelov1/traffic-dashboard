## Context

Two charts need two aggregates over `traffic_events`. The table has no index beyond its primary key, deliberately, and `docs/performance/aggregate-baseline.md` records why: both queries are full scans by definition, and an index would add write cost without changing the plan.

## Goals / Non-Goals

**Goals:**

- Two endpoints whose responses a chart can render without reshaping.
- Aggregation done by Postgres, so the query stays the thing under test.
- Response shapes that filters can extend without breaking a client already reading them.

**Non-Goals:**

- Caching. Its value is already measured; where it goes and what invalidates it belongs with the filters that change what is cached.
- Filters, pagination, indexes, and the charts themselves.

## Decisions

**Endpoint per aggregate, not one endpoint with a `groupBy` parameter.** A single `/api/traffic?groupBy=country` looks more general and costs more: the response type varies with the parameter, so a client cannot know the shape from the path, and the handler grows a switch that validation has to mirror. Two endpoints are two fixed contracts. If a third grouping ever appears, adding a route is smaller than the generality would have been.

**Domain names in the payload, not chart names.** `by-country` returns `plateCountry` and `total`, `by-vehicle-type` returns `vehicleType` and `total`. A shared `{ key, total }` shape would let one chart component serve both, which is a frontend convenience paid for by an API that no longer says what it returns. The mapping to a chart's axes is a frontend concern and lives there.

**Ordered largest first, in SQL.** Both charts rank categories, so the order is part of the answer rather than a client's job, and the sort happens where the data already is. The tie-break is the category name, so equal totals do not reorder between requests and a test can assert an exact array.

**An empty table answers `200` with an empty array.** Nothing failed and nothing is missing: there are no events, which is a fact about the data. A `404` would mean the aggregate does not exist, and a client would have to treat "no data yet" as an error path rather than as an empty chart.

**Response schemas declared to Fastify, not just validated in tests.** Fastify serialises from the schema, so a field added to a row by accident cannot leak into a response, and the documented shape and the emitted shape cannot drift. Input needs no schema yet — neither endpoint takes a parameter — and the schema arrives with the filters.

**Counts are returned as JSON numbers.** They come out of Postgres as bigint strings and are coerced at the repository boundary, as everywhere else. A chart cannot plot `"1234"`, and shipping the string to be parsed by the client moves a database quirk into the browser.

## Risks / Trade-offs

- **Every request runs a full scan, which the baseline measures at 235 ms on four million rows.** → Accepted for this increment and documented, not hidden. It is the motivation for the caching that follows, and the default seed keeps it at 25 ms for anyone running the project.
- **Two endpoints will become four if two more groupings appear.** → At that point the generality is justified by evidence rather than anticipated; until then, a switch statement guarded by a union type is the thing being avoided.
- **The payload names bind the frontend to the domain vocabulary.** → Intended. A chart that renames `plateCountry` to `label` at its own boundary stays honest about where the translation happens.

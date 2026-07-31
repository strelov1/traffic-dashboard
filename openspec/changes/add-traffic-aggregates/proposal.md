## Why

The events are stored and nothing can read them. The two required charts are aggregates over one table, and until an endpoint returns them the frontend has nothing to draw and the response shape stays undecided.

Both aggregates ship together because the second introduces no new seam: the same table, the same envelope, the same validation, the same handler shape. Splitting them would be ceremony.

## What Changes

- `GET /api/traffic/by-country` and `GET /api/traffic/by-vehicle-type`, each returning totals ordered largest first, in the `{"data": ...}` envelope.
- Aggregation in SQL, with the row shapes validated before they leave the repository.
- Responses declared by JSON schema, so Fastify serialises exactly the documented fields.

Not in this change: caching, filters, indexes, and the charts. The measurement in `docs/performance/aggregate-baseline.md` already says what caching would be worth; adding it before a filter exists would cache a shape that is about to change.

## Capabilities

### New Capabilities

- `traffic-api`: the HTTP contract for reading traffic — which aggregates are exposed, what their responses look like, how they order, and what they answer when there is nothing to aggregate.

### Modified Capabilities

None. `traffic-data` gains reads, but its requirements — grain, constraints, seeding — are unchanged.

## Impact

- **New code:** two repository reads, a routes module, their suites.
- **Downstream:** these response shapes are what the charts bind to, and what filters will extend. Naming them for the domain rather than for the chart keeps the API readable on its own.

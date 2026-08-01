## Why

The brief's third requirement is "enable data updates", and the system does: `POST`, `PATCH` and `DELETE` exist, are specified in `traffic-ingest`, and are covered by integration tests against a real database. But the only way to see any of it is `curl`. A reader who opens the dashboard sees two charts over data that never moves and has no reason to believe the write path exists.

This change adds nothing to the system. It makes something that already works visible, which is a different kind of value and worth being honest about: zero new capability, maximum visibility. It is cheap precisely because the hard part was built first.

Being explicit about the trade: a write control on an unauthenticated endpoint puts a button on a hole the README already admits. That is acceptable for a demonstration and would not be for a deployment, and this change should say so where a reader will see it rather than leave it implied.

## What Changes

- A small form on the dashboard: plate country, vehicle type, submit. It posts one detection to the endpoint that already exists.
- On success the charts and the headline re-read. The point of the form is the number moving; a form that submitted without visibly changing anything would demonstrate less than `curl` does.
- The form reports the API's own rejection rather than inventing its own message. The request schema already answers `body/events/0/plateCountry must match pattern "^[A-Z]{2}$"`, and surfacing that shows the validation layer doing its job.
- The vehicle-type control is populated from the same fixed set the API accepts, so the two cannot drift.
- The unauthenticated write path is stated at the form, briefly, rather than only in the README.

## Capabilities

### Modified Capabilities

- `traffic-dashboard`: the page gains a way to record a detection and re-reads both charts after one is recorded.

### New Capabilities

None. The endpoint, its schema, its error envelope and its tests already exist and do not change.

## Impact

- **Web:** one form component, a POST client function beside the two existing read functions, and a refetch path. That last one is shared with `add-dashboard-filters` — `useAsync` fetches once and has no way to re-run, so whichever change lands first owns extending it.
- **API:** none. No route, schema, or response changes.
- **Accessibility:** a form is where labelling, error association and focus management actually matter, more than anywhere else on this page. `aria-describedby` on the failure, focus moved to the message, and the result announced — otherwise the demonstration excludes the readers most likely to be checking.
- **Risk:** low. The failure mode is a form that reports success while the charts show the old numbers, which is the same aggregate-freshness question the write path already has — a detection recorded now lands in the live tail and is counted immediately, so this specific path is the one that does work today.

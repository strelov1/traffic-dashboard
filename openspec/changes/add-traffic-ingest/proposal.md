## Why

The database is read-only in practice: events arrive from a seed and nothing else can put them there, change them, or take them out. The brief asks the database to enable data updates, and the domain asks for the same thing more concretely — a detection pipeline records what cameras see, and vision systems misread plates and raise false positives, so recording, correcting, and removing are all real operations.

This is also the half of the load the measurements say nothing about. The aggregate baseline measured reads, and reads are cacheable; writes are not, and the scaling section cannot honestly discuss 500 RPS without a write path to point at.

## What Changes

- `POST /api/traffic/events` records a batch of detections in one statement and reports how many it wrote.
- `PATCH /api/traffic/events/:id` corrects a recorded detection — a misread plate country or a misclassified vehicle.
- `DELETE /api/traffic/events/:id` removes a detection that should not have been recorded.
- Request bodies are validated against the same rules the database enforces, so a bad field is a `400` naming it rather than a `500` from a constraint.

Not in this change: a form in the dashboard, authentication, and rate limiting. The first is a follow-up; the other two are not asked for anywhere in the brief and would be invented scope.

## Capabilities

### New Capabilities

- `traffic-ingest`: how detections are recorded, corrected, and removed — the request shapes, what is rejected, and what each outcome answers.

### Modified Capabilities

None. `traffic-data` already admits events arriving from outside the seed; its grain and constraints are unchanged.

## Impact

- **New code:** repository writes, an ingest routes module, their suites.
- **Downstream:** the aggregates now read a table that changes under them, which is the condition any later caching has to be correct about.

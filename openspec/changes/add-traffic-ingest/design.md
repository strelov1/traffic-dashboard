## Context

Until now every request has been a read, and the only validation on the way in was the database's own constraints — which nothing exercised, because nothing wrote. This change opens the write path, so input validation stops being hypothetical.

## Goals / Non-Goals

**Goals:**

- Record, correct, and remove detections, with each rejection naming what was wrong.
- Validation that mirrors the database's constraints, so a bad request is a `400` rather than a `500` from a violated check.
- A batch write, because that is the shape a detection pipeline actually produces.

**Non-Goals:**

- Authentication and rate limiting. Neither appears in the brief, and inventing an auth model would be scope with no requirement behind it. The README will say plainly that the write path is open.
- A form in the dashboard. It makes the feature visible to a reviewer and is a separate slice.
- Idempotency keys, upserts, and conflict handling. Nothing here has a natural key to conflict on.

## Decisions

**A batch POST, not one event per request.** Cameras produce detections continuously; a pipeline sends them in groups. A batch also makes the write path honest about throughput — the same `unnest` insert the seed uses handles a hundred events in one round trip, and the scaling section can talk about batching rather than about a per-event endpoint that would never be built this way. A batch of one is still a valid batch, so nothing is lost for a caller with a single event.

**Validated with a JSON schema declared to Fastify, not by hand in the handler.** The route already declares its response shape; declaring the request shape in the same place means the rejection is generated, consistent, and cannot drift from the documentation. Hand-written checks in a handler drift the moment a second endpoint appears.

**The request schema restates the database's rules rather than deferring to them.** `plateCountry` must match the ISO pattern and `vehicleType` must be one of the known classes, checked before the query runs. Letting the constraint reject it would work and would answer `500` with a message about a check constraint — a server error for a client's mistake, carrying database internals. The duplication is deliberate and small: the database is the last line of defence, the schema is the first, and only the first can explain itself to a caller.

**`occurredAt` is optional and defaults to now.** A pipeline sends the instant it observed; a caller poking the API by hand should not have to. Accepting the client's timestamp rather than stamping server-side is right for the domain — the detection happened when the camera saw it, not when the network delivered it.

**`PATCH` takes a partial event and rejects an empty one.** Correcting a plate should not require resending the vehicle type. An empty body is a `400` rather than a no-op success, because a caller who sent nothing meant something and should learn that it did not arrive.

**A missing id answers `404` on both `PATCH` and `DELETE`, and `DELETE` answers `204` with no body.** Deleting something that is already gone is not success: a caller with the wrong id should hear about it rather than believe the deletion worked.

**Writes return counts and the updated row, not the whole table.** `POST` answers `201` with how many it recorded; `PATCH` answers with the event as it now stands, so a caller can see what its correction produced without a follow-up read.

## Risks / Trade-offs

- **The write path is unauthenticated.** → Stated rather than hidden: nothing in the brief describes an actor or a permission model, and inventing one would be scope without a requirement. The README names it as the first thing a real deployment would add.
- **Validation rules exist in two places, the schema and the database constraint.** → Intended, and the cost is two lines that change together. The alternative — one place — means either the client gets a `500` for its own mistake, or the database accepts whatever the application believes.
- **A batch insert is all-or-nothing, so one bad event rejects ninety-nine good ones.** → Correct for a pipeline that can retry, and the rejection names the offending index. Partial success would need a per-item result shape, which is a real design with no requirement asking for it.

# traffic-ingest Specification

## Purpose

How detections are recorded, corrected, and removed: the request shapes, what is rejected, and what each outcome answers.

Validation here restates what the database enforces rather than deferring to it. The database is the last line of defence and cannot explain itself to a caller; this layer is the first, and can.
## Requirements
### Requirement: Detections are recorded in batches

The API SHALL expose `POST /api/traffic/events` accepting a batch of detections and recording them in one operation. It SHALL answer `201` reporting how many events it wrote. A batch containing one event is valid.

Each detection SHALL carry a plate country and a vehicle type. The instant is optional and defaults to the moment of the request, so a caller sending live observations need not restate it.

#### Scenario: A batch is recorded

- **WHEN** a client posts three detections
- **THEN** the API answers `201`, reports three recorded, and the aggregates count them

#### Scenario: The instant is omitted

- **WHEN** a client posts a detection without an instant
- **THEN** the event is recorded with the time of the request

### Requirement: A bad request is rejected before it reaches the database

Request bodies SHALL be validated against the same rules the database enforces. A plate country that is not an ISO alpha-2 code, a vehicle type outside the known set, a missing required field, or an empty batch SHALL answer `400` in the error envelope, never `500`.

An instant that is well-formed but that the runtime cannot represent SHALL also answer `400`. `23:59:60` is a legal RFC 3339 instant and Postgres normalises it without complaint, but JavaScript's `Date` cannot hold a leap second and yields an invalid value that reaches the driver as `NaN`. The request is not malformed; the rejection is the system stating a limit of its own, and it belongs where the instant is constructed rather than at each route.

#### Scenario: An unknown vehicle type

- **WHEN** a client posts a detection whose vehicle type is not a known class
- **THEN** the API answers `400` and records nothing

#### Scenario: A country name instead of a code

- **WHEN** a client posts a detection whose plate country is a country name
- **THEN** the API answers `400` and records nothing

#### Scenario: An empty batch

- **WHEN** a client posts an empty list of detections
- **THEN** the API answers `400`

#### Scenario: An instant the runtime cannot represent

- **WHEN** a client posts a detection whose instant is a leap second
- **THEN** the API answers `400` and records nothing, rather than failing in the driver

### Requirement: A batch is recorded whole or not at all

When any detection in a batch is rejected by the database, none of the batch SHALL be recorded, so a caller retrying a corrected batch cannot create duplicates of the events that had been valid.

#### Scenario: One event violates a constraint

- **WHEN** a batch reaches the database and one event violates a constraint
- **THEN** no event from that batch exists afterwards

### Requirement: A recorded detection can be corrected

The API SHALL expose `PATCH /api/traffic/events/:id` accepting any subset of the detection's **classification** — its plate country and its vehicle type — and applying only those. It SHALL answer `200` with the event as it now stands.

The instant SHALL NOT be correctable. Events are stored partitioned by time, and moving a row between partitions is not an operation the storage supports; a correction fixes what the camera read, not when it looked.

A body carrying no correctable field SHALL be rejected with `400` rather than treated as a successful no-op, since a caller who sent nothing intended something.

#### Scenario: A misread plate country is corrected

- **WHEN** a client patches a recorded event's plate country
- **THEN** the API answers `200`, the event carries the new country, and its other fields are unchanged

#### Scenario: An empty correction

- **WHEN** a client patches an event with a body carrying no fields
- **THEN** the API answers `400`

#### Scenario: An attempt to rewrite the instant

- **WHEN** a client patches an event with an instant
- **THEN** the API answers `400` rather than attempting a move the storage cannot perform

#### Scenario: An unknown event

- **WHEN** a client patches an id that does not exist
- **THEN** the API answers `404`

### Requirement: A detection can be removed

The API SHALL expose `DELETE /api/traffic/events/:id`, answering `204` with no body when the event existed and `404` when it did not. Deleting an absent event is not success: a caller holding a wrong id learns of it rather than believing the removal happened.

#### Scenario: A false positive is removed

- **WHEN** a client deletes a recorded event
- **THEN** the API answers `204` and the aggregates no longer count it

#### Scenario: An unknown event

- **WHEN** a client deletes an id that does not exist
- **THEN** the API answers `404`

### Requirement: Every traffic response is serialised from a declared schema

Each route under `/api/traffic` SHALL declare the shape of its success response, so that a column added to a table cannot reach a payload by accident. Growing the schema is not the same as changing the API.

`PATCH` is the one route that echoes a stored row back to the caller, which makes the declaration matter more there than anywhere else, not less.

#### Scenario: A correction echoes only declared fields

- **WHEN** a client corrects an event and the stored row carries a field the API does not publish
- **THEN** the response contains only the declared fields


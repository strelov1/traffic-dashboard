## ADDED Requirements

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

#### Scenario: An unknown vehicle type

- **WHEN** a client posts a detection whose vehicle type is not a known class
- **THEN** the API answers `400` and records nothing

#### Scenario: A country name instead of a code

- **WHEN** a client posts a detection whose plate country is a country name
- **THEN** the API answers `400` and records nothing

#### Scenario: An empty batch

- **WHEN** a client posts an empty list of detections
- **THEN** the API answers `400`

### Requirement: A batch is recorded whole or not at all

When any detection in a batch is rejected by the database, none of the batch SHALL be recorded, so a caller retrying a corrected batch cannot create duplicates of the events that had been valid.

#### Scenario: One event violates a constraint

- **WHEN** a batch reaches the database and one event violates a constraint
- **THEN** no event from that batch exists afterwards

### Requirement: A recorded detection can be corrected

The API SHALL expose `PATCH /api/traffic/events/:id` accepting any subset of the detection's fields and applying only those. It SHALL answer `200` with the event as it now stands.

A body carrying no fields SHALL be rejected with `400` rather than treated as a successful no-op, since a caller who sent nothing intended something.

#### Scenario: A misread plate country is corrected

- **WHEN** a client patches a recorded event's plate country
- **THEN** the API answers `200`, the event carries the new country, and its other fields are unchanged

#### Scenario: An empty correction

- **WHEN** a client patches an event with a body carrying no fields
- **THEN** the API answers `400`

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

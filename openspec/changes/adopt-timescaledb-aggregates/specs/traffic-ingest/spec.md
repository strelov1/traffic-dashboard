## MODIFIED Requirements

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

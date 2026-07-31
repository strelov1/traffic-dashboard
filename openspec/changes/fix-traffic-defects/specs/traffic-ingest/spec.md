## MODIFIED Requirements

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

## ADDED Requirements

### Requirement: Every traffic response is serialised from a declared schema

Each route under `/api/traffic` SHALL declare the shape of its success response, so that a column added to a table cannot reach a payload by accident. Growing the schema is not the same as changing the API.

`PATCH` is the one route that echoes a stored row back to the caller, which makes the declaration matter more there than anywhere else, not less.

#### Scenario: A correction echoes only declared fields

- **WHEN** a client corrects an event and the stored row carries a field the API does not publish
- **THEN** the response contains only the declared fields

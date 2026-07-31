## ADDED Requirements

### Requirement: A traffic event records one detected vehicle

The system SHALL store traffic as one row per detected vehicle in `traffic_events`, carrying the instant of the detection, the country that issued the vehicle's plate, and the vehicle's class. The grain MUST remain per-detection: aggregates are computed on read, never stored in place of the events they summarise.

Each event SHALL carry a surrogate identity. No combination of the recorded fields is unique, since two identical vehicles may pass within the same second.

#### Scenario: An event is recorded and read back

- **WHEN** an event is stored with an instant, a plate country, and a vehicle type
- **THEN** it is readable with all three values unchanged, under its own identity

#### Scenario: Two identical detections are distinct events

- **WHEN** two events are stored with the same instant, plate country, and vehicle type
- **THEN** both exist as separate rows with different identities

### Requirement: Plate country is stored as an ISO 3166-1 alpha-2 code

`plate_country` SHALL be exactly two characters and SHALL be rejected otherwise. Display names are resolved by the client, so the stored value stays a stable key rather than a spelling.

#### Scenario: A valid code is accepted

- **WHEN** an event is stored with plate country `AE`
- **THEN** the row is written

#### Scenario: A country name is rejected

- **WHEN** an event is stored with plate country `United Arab Emirates`
- **THEN** the write is rejected by the database rather than silently truncated

### Requirement: Vehicle type is constrained to a known set

`vehicle_type` SHALL be one of a fixed set of classes and SHALL be rejected otherwise, so that a typo becomes a failed write instead of an extra slice in the distribution chart. The constraint MUST be expressed so that admitting a new class is a one-line migration.

#### Scenario: A known class is accepted

- **WHEN** an event is stored with vehicle type `truck`
- **THEN** the row is written

#### Scenario: An unknown class is rejected

- **WHEN** an event is stored with vehicle type `hovercraft`
- **THEN** the write is rejected by the database

### Requirement: Detection time is stored as an absolute instant

`occurred_at` SHALL be stored with its time zone, so that events from cameras in different offsets remain comparable and orderable. A value written in one zone MUST read back as the same instant when read in another.

#### Scenario: An instant survives a zone change

- **WHEN** an event is written with an instant expressed in one time zone and read back with the session in another
- **THEN** the value denotes the same moment

### Requirement: A fresh database is seeded automatically

On startup, when `traffic_events` holds no rows, the system SHALL populate it before serving requests, and SHALL log how many rows it wrote. When the table already holds rows, the seed MUST do nothing, so that a restart neither duplicates data nor overwrites events that arrived through any other path.

The number of events SHALL be configurable, so that the cost of the first startup is a decision rather than a surprise.

#### Scenario: First startup against an empty database

- **WHEN** the system starts and `traffic_events` is empty
- **THEN** it writes the configured number of events and reports the count

#### Scenario: Restart against a populated database

- **WHEN** the system starts and `traffic_events` already holds rows
- **THEN** it writes nothing and the row count is unchanged

#### Scenario: Seed size is configured

- **WHEN** the configured event count is set to a specific number and the system starts against an empty database
- **THEN** exactly that many events exist

### Requirement: Seeded data is distributed unevenly

The seed SHALL produce a distribution that is skewed rather than uniform: one dominant plate country with a tail of others, cars outnumbering every other vehicle class, and detections concentrated in daytime hours. Uniform data would make every bar the same height and would let a query plan assume an even selectivity it will never have in production.

Seeded events SHALL span a range of dates rather than a single instant, so that a time filter has something to filter.

#### Scenario: Countries are not uniformly represented

- **WHEN** the seeded events are grouped by plate country
- **THEN** more than one country is present, and the largest group is materially larger than the smallest

#### Scenario: Vehicle types are not uniformly represented

- **WHEN** the seeded events are grouped by vehicle type
- **THEN** every allowed class is present, and cars are the most numerous

#### Scenario: Events span a date range

- **WHEN** the earliest and latest seeded events are compared
- **THEN** they fall on different days

### Requirement: Reads return validated rows

Every read of traffic data SHALL validate the shape of the rows it returns before handing them to a caller, so that a renamed column or a driver-side type surprise fails at the boundary rather than surfacing as a wrong number in a chart.

#### Scenario: A row that does not match the expected shape

- **WHEN** a read returns a row whose columns do not match the declared shape
- **THEN** the read fails with an error naming the mismatch, rather than returning the row

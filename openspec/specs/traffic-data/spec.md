# traffic-data Specification

## Purpose

What a traffic event is and what may be stored as one: the per-detection grain, the fields an event carries, the constraints that keep it queryable, and how an empty database becomes one worth querying.

Aggregation is a one-way operation, so this capability guards the grain. Everything read from it — both charts, the filters, the scaling work — can be derived from per-detection rows; none of it can be recovered from summaries stored in their place.
## Requirements
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

### Requirement: Events are partitioned by time

`traffic_events` SHALL be stored partitioned by `occurred_at`, so that a query bounded in time reads only the partitions it covers and old data can be detached as a unit rather than deleted row by row.

Because a partitioned table requires the partitioning column in every unique index, the primary key SHALL be `(id, occurred_at)`. `id` SHALL remain unique in fact — it is generated from a single identity sequence — and SHALL remain the identifier a client uses to address an event.

#### Scenario: An event is addressed by id alone

- **WHEN** a stored event is read, corrected, or removed by its id
- **THEN** exactly that event is affected, without its instant being supplied

### Requirement: Hourly totals are maintained continuously

The system SHALL maintain hourly totals per plate country and per vehicle type as a continuous aggregate over the events, refreshed on a schedule rather than computed per request. Totals over any period SHALL be derived by summing the hours it covers.

The bucket SHALL be an hour wide. A read of the aggregate is the materialised buckets plus a live scan of everything newer than the materialisation watermark, so the bucket width sets the size of that live scan: a daily bucket measured 82 ms against 18 ms for an hourly one at four million rows, because its live tail was a whole day of detections. Freshness is unaffected by the choice — the bucket containing the present is served live either way — which is what makes the width a cost decision rather than part of the contract.

#### Scenario: Totals match the events they summarise

- **WHEN** events are recorded and the totals are read
- **THEN** the totals equal what counting the events directly would produce

#### Scenario: A period selects whole hours

- **WHEN** totals are read for a period of one hour, and detections exist in the hours before, inside, and after it
- **THEN** only the detections inside that hour are counted, with an instant exactly on the opening bound counted and one exactly on the closing bound excluded

### Requirement: A detection recorded now is counted now

The window containing the present SHALL NOT be materialised, so that it is served live and an event recorded a moment ago is included immediately. Materialisation SHALL trail the present by less than the width of one bucket.

#### Scenario: An event is recorded and read back at once

- **WHEN** a detection is recorded and the aggregates are requested immediately afterwards
- **THEN** the new detection is included in the totals

### Requirement: Late detections are counted within a stated window

The refresh SHALL re-materialise a trailing window on a schedule, so a detection delivered after a delay is still counted. That window SHALL be the stated maximum lateness the system tolerates: a detection whose instant falls outside it is not counted until a refresh is requested for that period.

#### Scenario: A detection arrives late but within the window

- **WHEN** a detection whose instant falls inside the trailing refresh window is recorded, and the refresh runs
- **THEN** the totals include it


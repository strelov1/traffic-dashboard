## ADDED Requirements

### Requirement: Events are partitioned by time

`traffic_events` SHALL be stored partitioned by `occurred_at`, so that a query bounded in time reads only the partitions it covers and old data can be detached as a unit rather than deleted row by row.

Because a partitioned table requires the partitioning column in every unique index, the primary key SHALL be `(id, occurred_at)`. `id` SHALL remain unique in fact — it is generated from a single identity sequence — and SHALL remain the identifier a client uses to address an event.

#### Scenario: An event is addressed by id alone

- **WHEN** a stored event is read, corrected, or removed by its id
- **THEN** exactly that event is affected, without its instant being supplied

### Requirement: Daily totals are maintained continuously

The system SHALL maintain daily totals per plate country and per vehicle type as a continuous aggregate over the events, refreshed on a schedule rather than computed per request. Totals over any period SHALL be derived by summing the days it covers.

#### Scenario: Totals match the events they summarise

- **WHEN** events are recorded and the totals are read
- **THEN** the totals equal what counting the events directly would produce

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

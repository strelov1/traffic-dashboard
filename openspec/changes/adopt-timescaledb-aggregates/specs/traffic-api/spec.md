## ADDED Requirements

### Requirement: Aggregate responses do not scale with the size of the table

Both aggregates SHALL be answered from maintained totals rather than by counting events per request, so that response time is governed by the number of categories and the length of the period, not by how many events have ever been recorded.

#### Scenario: The table grows

- **WHEN** the number of recorded events increases by an order of magnitude
- **THEN** the time to answer an aggregate does not increase in proportion

### Requirement: Aggregates state how fresh they are

The freshness of an aggregate SHALL be a stated property rather than an accident of implementation: detections in the live window are included immediately, and detections older than it are included as of the last refresh.

#### Scenario: A detection recorded moments ago

- **WHEN** a detection is recorded and an aggregate is requested immediately
- **THEN** the response includes that detection

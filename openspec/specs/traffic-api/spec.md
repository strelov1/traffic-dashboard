# traffic-api Specification

## Purpose

The HTTP contract for reading traffic: which aggregates are exposed, what their responses look like, how they order, and what they answer when there is nothing to aggregate.

Responses are declared, not merely produced. A field that the contract does not name never leaves the process, so growing the table is not the same as changing the API.
## Requirements
### Requirement: Traffic totals are available per plate country

The API SHALL expose `GET /api/traffic/by-country` returning, for every plate country present in the data, the number of events recorded for it. The response SHALL use the `{"data": ...}` envelope and each entry SHALL carry the country code and the total.

#### Scenario: Events exist for several countries

- **WHEN** a client requests `GET /api/traffic/by-country` and events exist for more than one country
- **THEN** the response is `200` and `data` holds one entry per country, each with its code and its total

#### Scenario: Totals count every event for the country

- **WHEN** three events are recorded for one country and one for another
- **THEN** the entries report totals of three and one

### Requirement: Traffic totals are available per vehicle type

The API SHALL expose `GET /api/traffic/by-vehicle-type` returning, for every vehicle type present in the data, the number of events recorded for it, in the same envelope and with the same ordering rule.

#### Scenario: Events exist for several vehicle types

- **WHEN** a client requests `GET /api/traffic/by-vehicle-type` and events exist for more than one type
- **THEN** the response is `200` and `data` holds one entry per type, each with its type and its total

### Requirement: Aggregates are ordered largest first

Both aggregates SHALL return entries in descending order of total. Entries with equal totals SHALL be ordered by their category, so that the response is stable across requests and a client can render it without sorting.

#### Scenario: Unequal totals

- **WHEN** an aggregate is requested and the totals differ
- **THEN** the entry with the largest total comes first

#### Scenario: Equal totals

- **WHEN** two categories have the same total
- **THEN** they appear in a consistent order across repeated requests

### Requirement: An empty dataset is an empty aggregate

When no events are recorded, both aggregates SHALL respond `200` with an empty `data` array. Absence of data is a fact about the data, not a failure, and a client SHALL NOT have to treat an empty chart as an error.

#### Scenario: No events recorded

- **WHEN** an aggregate is requested against an empty table
- **THEN** the response is `200` with `data` as an empty array

### Requirement: Totals are numbers, and responses carry only documented fields

Totals SHALL be JSON numbers rather than strings, despite the database returning counts as bigint strings. Responses SHALL carry only the fields the contract documents, so that a column added to the table cannot appear in a payload by accident.

#### Scenario: A total is usable as a number

- **WHEN** an aggregate entry is read by a client
- **THEN** its total is a JSON number

#### Scenario: An undocumented field is not emitted

- **WHEN** a row carries a field the response contract does not declare
- **THEN** that field is absent from the response body


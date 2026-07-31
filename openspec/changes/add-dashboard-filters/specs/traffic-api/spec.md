## ADDED Requirements

### Requirement: A period is a half-open interval, rounded outward to bucket boundaries

A requested period SHALL be read as the half-open interval `[from, to)`: an instant equal to `from` falls inside the period, an instant equal to `to` falls outside it. Adjacent periods therefore tile a timeline without any hour being counted twice.

Because the maintained totals have an hourly grain, a boundary finer than an hour cannot be honoured. Before the period reaches the query, `from` SHALL be moved back to the start of the hour containing it and `to` SHALL be moved forward to the start of the next hour unless it already sits on one. Rounding SHALL be outward on both ends: the answer covers at least the period requested, never less, so that a narrowed answer can never be mistaken for a quiet stretch of traffic.

Either bound MAY be omitted, and an omitted bound SHALL mean unbounded on that side rather than a default supplied by the server.

The rounded period SHALL be stated in the response, alongside the data, so that a client is told the period it actually received rather than left to assume it got the one it asked for.

#### Scenario: A sub-hour start is widened to the hour containing it

- **WHEN** an aggregate is requested from an instant partway through an hour
- **THEN** the whole of that hour is counted, and the response states the period as beginning at the start of that hour

#### Scenario: An end already on the hour is not widened

- **WHEN** an aggregate is requested with an end exactly on an hour boundary
- **THEN** the hour beginning at that instant is not counted, and the response states that end unchanged

#### Scenario: Adjacent periods do not double-count

- **WHEN** two adjacent periods that meet at one instant are requested in turn
- **THEN** their totals sum to the total for the period spanning both, with no event counted twice

#### Scenario: An event exactly on a bucket boundary

- **WHEN** an event occurred exactly at the start of an hour, and a period beginning at that instant is requested
- **THEN** the event is counted; and when a period beginning at the following hour is requested, it is not

### Requirement: Period bounds are absolute instants, and the zone is the caller's to state

Both bounds SHALL be given as date-times carrying an explicit zone offset. A date-time without one SHALL be rejected, so no request can depend on a server-side default zone.

Rounding to bucket boundaries SHALL be performed on the instant in UTC, which is the zone the maintained totals are bucketed in. A bound expressed in a zone whose offset is not a whole number of hours therefore rounds to a UTC hour boundary, not to a local one.

#### Scenario: A bound carries a half-hour offset

- **WHEN** a period bound is given in a zone offset by a half hour, at an instant partway through a UTC hour
- **THEN** the period is rounded to the surrounding UTC hour boundary, and the response states it as such

#### Scenario: A bound omits its zone

- **WHEN** a period bound is given as a date-time with no zone offset
- **THEN** the response is `400` and names the field

### Requirement: A malformed or inverted period is refused before it reaches the query

A period bound that is not a valid date-time, or is a date-time this runtime cannot represent as an instant, SHALL be answered `400` naming the field at fault. A period whose start is later than its end SHALL be answered `400` naming both bounds.

Inversion SHALL be judged on the values the client sent, before rounding, so the message can quote them and so no request is rejected on the basis of a boundary the server moved.

A period whose start equals its end SHALL NOT be an error. It is an empty interval, and it is answered as an empty aggregate with the period echoed back.

#### Scenario: The start is later than the end

- **WHEN** an aggregate is requested with a start later than its end
- **THEN** the response is `400` and the message names the two bounds

#### Scenario: A bound is not an instant this runtime can hold

- **WHEN** a period bound is a leap second, which is a valid date-time but not a representable instant
- **THEN** the response is `400` naming the field, and no query is run

#### Scenario: The start equals the end

- **WHEN** an aggregate is requested with a start equal to its end
- **THEN** the response is `200` with an empty `data` array and the period echoed back

### Requirement: The vehicle-type aggregate can be narrowed to one plate country

`GET /api/traffic/by-vehicle-type` SHALL accept an optional plate country, and when given, count only detections carrying a plate from that country. The country SHALL be validated as the ingest path validates it, so a malformed value is a `400` naming the field rather than an empty answer.

`GET /api/traffic/by-country` SHALL NOT accept this parameter. Narrowing that aggregate to one country would leave a single entry, which answers a different question — how one country's traffic is composed — and that question is what the vehicle-type aggregate with a country is for.

#### Scenario: A country is given

- **WHEN** the vehicle-type aggregate is requested for one plate country
- **THEN** only detections carrying that country's plates are counted

#### Scenario: A country is not offered on the by-country aggregate

- **WHEN** a client sends a plate country to `GET /api/traffic/by-country`
- **THEN** the request is refused rather than silently answered with an unfiltered aggregate

#### Scenario: A malformed country

- **WHEN** the vehicle-type aggregate is requested with a country that is not two uppercase letters
- **THEN** the response is `400` and names the field

## MODIFIED Requirements

### Requirement: Traffic totals are available per plate country

The API SHALL expose `GET /api/traffic/by-country` returning, for every plate country present in the data, the number of events recorded for it. The response SHALL use the `{"data": ...}` envelope and each entry SHALL carry the country code and the total.

The endpoint SHALL accept an optional period, given as `from` and `to`, and count only detections whose instant falls inside it. The envelope SHALL also carry `period`, stating the period the response actually covers after rounding; when neither bound was given, it states that no bound was applied.

#### Scenario: Events exist for several countries

- **WHEN** a client requests `GET /api/traffic/by-country` and events exist for more than one country
- **THEN** the response is `200` and `data` holds one entry per country, each with its code and its total

#### Scenario: Totals count every event for the country

- **WHEN** three events are recorded for one country and one for another
- **THEN** the entries report totals of three and one

#### Scenario: A period is given

- **WHEN** a client requests the aggregate for a period covering some of the recorded events
- **THEN** only the events inside that period are counted, and the response states the period covered

#### Scenario: No period is given

- **WHEN** a client requests the aggregate with neither bound
- **THEN** every recorded event is counted, and the response states a period with no bounds

### Requirement: Traffic totals are available per vehicle type

The API SHALL expose `GET /api/traffic/by-vehicle-type` returning, for every vehicle type present in the data, the number of events recorded for it, in the same envelope and with the same ordering rule.

The endpoint SHALL accept the same optional period as the by-country aggregate, with the same rounding and the same statement of the period covered.

#### Scenario: Events exist for several vehicle types

- **WHEN** a client requests `GET /api/traffic/by-vehicle-type` and events exist for more than one type
- **THEN** the response is `200` and `data` holds one entry per type, each with its type and its total

#### Scenario: A period is given

- **WHEN** a client requests the aggregate for a period covering some of the recorded events
- **THEN** only the events inside that period are counted, and the response states the period covered

### Requirement: An empty dataset is an empty aggregate

When no events are recorded, both aggregates SHALL respond `200` with an empty `data` array. Absence of data is a fact about the data, not a failure, and a client SHALL NOT have to treat an empty chart as an error.

A filter that matches nothing SHALL be answered the same way. A period entirely in the future, a period entirely before the first recorded event, and a country from which nothing has been detected are all statements about the data rather than faults in the request, and each SHALL be `200` with an empty `data` array and the period stated as usual.

#### Scenario: No events recorded

- **WHEN** an aggregate is requested against an empty table
- **THEN** the response is `200` with `data` as an empty array

#### Scenario: A period entirely in the future

- **WHEN** an aggregate is requested for a period beginning after the present
- **THEN** the response is `200` with `data` as an empty array

#### Scenario: A period entirely before any data

- **WHEN** an aggregate is requested for a period ending before the earliest recorded event
- **THEN** the response is `200` with `data` as an empty array

#### Scenario: A country with no detections

- **WHEN** the vehicle-type aggregate is requested for a country that has never been detected
- **THEN** the response is `200` with `data` as an empty array, not an error

### Requirement: Aggregate responses do not scale with the size of the table

Both aggregates SHALL be answered from maintained totals rather than by counting events per request, so that response time is governed by the number of categories and the length of the period, not by how many events have ever been recorded.

A period SHALL narrow the work rather than only the answer: the events table is partitioned by time, and a bounded period SHALL let the query plan exclude the partitions outside it instead of reading them and discarding the rows.

#### Scenario: The table grows

- **WHEN** the number of recorded events increases by an order of magnitude
- **THEN** the time to answer an aggregate does not increase in proportion

#### Scenario: A bounded period reads less than an unbounded one

- **WHEN** the plan for a bounded read is compared with the plan for the same aggregate unbounded
- **THEN** the bounded read touches fewer partitions

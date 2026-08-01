## MODIFIED Requirements

### Requirement: Aggregate responses do not scale with the size of the table

Both aggregates SHALL be answered from maintained totals rather than by counting events per request, so that response time is governed by the number of categories and the length of the period, not by how many events have ever been recorded.

A period SHALL narrow the work rather than only the answer, and the partitions it excludes SHALL be understood as the maintained totals' own rather than the events table's. `traffic_events` is already read one chunk deep whatever period is asked for: the continuous aggregate's `occurred_at >= watermark` predicate excludes the rest before any filter is involved, measured at one of six chunks on an unbounded read over a million events. What a bounded period narrows is `traffic_hourly_totals` — two of its two chunks read whole unbounded, one of two under a seven-day bound, and the chunk that survives entered through its own `hour` index rather than scanned. Time partitioning of the events table is exploited by adopting the aggregate, not by bounding a request.

The live tail SHALL be understood as the floor a period cannot lower. It is the current hour of detections, recomputed on every read, and every period reaching the present contains it: at a one-day bound it is 95 % of the buffers read. A bounded read is therefore cheaper — 19.8 ms unbounded against 7.9 ms at seven days — without being cheap in proportion to how narrow it is.

#### Scenario: The table grows

- **WHEN** the number of recorded events increases by an order of magnitude
- **THEN** the time to answer an aggregate does not increase in proportion

#### Scenario: A bounded period reads less than an unbounded one

- **WHEN** the plan for a bounded read is compared with the plan for the same aggregate unbounded
- **THEN** the bounded plan names fewer chunks of the maintained totals than the unbounded one

#### Scenario: The events table is read one chunk deep either way

- **WHEN** either of those two plans is inspected for the chunks it names of the events table
- **THEN** each names exactly one, however many chunks that table has

### Requirement: A malformed or inverted period is refused before it reaches the query

A period bound that is not a valid date-time, or is a date-time this runtime cannot represent as an instant, SHALL be answered `400` naming the field at fault. A period whose start is later than its end SHALL be answered `400` naming both bounds.

Inversion SHALL be judged on the values the client sent, before rounding, so the message can quote them and so no request is rejected on the basis of a boundary the server moved.

A period whose start equals its end SHALL NOT be an error: inversion is the only ordering fault, and equal bounds are not inverted. Such a period SHALL then be rounded like any other, with no exception made for it. Equal bounds already on an hour boundary describe an empty interval and stay where they were written, so the response is an empty aggregate with those bounds stated back. Equal bounds inside an hour widen outward to the hour containing them, so the response covers that whole hour, and the period it states is what tells the client that it did.

#### Scenario: The start is later than the end

- **WHEN** an aggregate is requested with a start later than its end
- **THEN** the response is `400` and the message names the two bounds

#### Scenario: A bound is not an instant this runtime can hold

- **WHEN** a period bound is a leap second, which is a valid date-time but not a representable instant
- **THEN** the response is `400` naming the field, and no query is run

#### Scenario: The start equals the end

- **WHEN** an aggregate is requested with a start equal to its end, both on an hour boundary
- **THEN** the response is `200` with an empty `data` array and those bounds stated back unchanged

#### Scenario: The start equals the end partway through an hour

- **WHEN** an aggregate is requested with a start equal to its end, both inside the same hour
- **THEN** the hour containing them is counted whole, and the response states that hour rather than the bounds that were sent

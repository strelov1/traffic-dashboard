## RENAMED Requirements

- FROM: `### Requirement: Daily totals are maintained continuously`
- TO: `### Requirement: Hourly totals are maintained continuously`

## MODIFIED Requirements

### Requirement: Hourly totals are maintained continuously

The system SHALL maintain hourly totals per plate country and per vehicle type as a continuous aggregate over the events, refreshed on a schedule rather than computed per request. Totals over any period SHALL be derived by summing the hours it covers.

The bucket SHALL be an hour wide. A read of the aggregate is the materialised buckets plus a live scan of everything newer than the materialisation watermark, so the bucket width sets the size of that live scan: a daily bucket measured 82 ms against 18 ms for an hourly one at four million rows, because its live tail was a whole day of detections. Freshness is unaffected by the choice — the bucket containing the present is served live either way — which is what makes the width a cost decision rather than part of the contract.

#### Scenario: Totals match the events they summarise

- **WHEN** events are recorded and the totals are read
- **THEN** the totals equal what counting the events directly would produce

#### Scenario: A period selects whole hours

- **WHEN** totals are read for a period of one hour, and detections exist in the hours before, inside, and after it
- **THEN** only the detections inside that hour are counted, with an instant exactly on the opening bound counted and one exactly on the closing bound excluded

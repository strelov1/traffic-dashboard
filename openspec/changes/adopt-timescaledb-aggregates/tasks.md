## 1. Storage

- [x] 1.1 Point Compose and the integration suites at `timescale/timescaledb`, and confirm every existing test still passes unchanged
- [x] 1.2 Add the migration: create the extension, widen the primary key to `(id, occurred_at)`, and convert the table to a hypertable, migrating the rows already there
- [x] 1.3 Prove an event is still addressed by id alone after the key widens

## 2. Continuous aggregate

- [x] 2.1 Add the migration creating hourly totals per plate country and per vehicle type as a continuous aggregate
- [x] 2.2 Add the refresh policy, with the end offset one whole bucket so the current day is never materialised
- [x] 2.3 Prove a detection recorded now is counted now, and that totals equal what counting the events directly would give

## 3. Reads

- [x] 3.1 Read both aggregates from the daily totals, summing over the period, ordered as before
- [x] 3.2 Prove the endpoint contract is unchanged: same shape, same order, same tie-break, same empty answer

## 4. Correction contract

- [x] 4.1 Remove `occurredAt` from the correction schema and answer `400` when it is sent
- [x] 4.2 Prove correcting a classification still works and leaves the other fields alone

## 5. Measurement

- [x] 5.1 Re-run the load test at every tier and record the numbers beside the previous ones
- [x] 5.2 Record the query plan for the new read path against the same four million rows

## 6. Bucket width, found by measuring

- [x] 6.1 Narrow the bucket from a day to an hour: real-time aggregation scans everything newer than the watermark on every request, so a daily bucket left a whole day of detections in the live tail and cost 82 ms where the spike had promised 0.26 ms

## 1. Schema

- [x] 1.1 Add the migration creating `traffic_events` with an identity key, `occurred_at timestamptz`, `plate_country text` matching an ISO alpha-2 pattern, and `vehicle_type text`, all not null
- [x] 1.2 Constrain `vehicle_type` to the known classes and prove that an unknown class is rejected by the database
- [x] 1.3 Prove that a plate country longer than two characters is rejected rather than truncated, and that an instant survives a session zone change

## 2. Reads

- [x] 2.1 Add the traffic repository with an insert used by tests and the seed, and a count, both validated against declared row shapes
- [x] 2.2 Cover the validation boundary: the count is coerced from the bigint string the driver returns, and a mismatched shape fails naming it (generic case in `db.test.ts`)

## 3. Seed

- [x] 3.1 Generate events in a single SQL statement over `generate_series`, with a configurable count
- [x] 3.2 Skew the distribution: one dominant plate country with a tail, cars outnumbering other classes, spread across a range of dates
- [x] 3.3 Seed only when the table is empty, log the number of rows written, and prove a restart neither duplicates nor overwrites

## 4. Startup

- [x] 4.1 Run the seed after migrations and before the server listens, and read the event count from configuration with a documented default
- [x] 4.2 Record the configuration in `.env.example` and verify a clean `docker compose up` reaches a populated database

## 5. Measurement

- [x] 5.1 Capture `EXPLAIN ANALYZE` for the country and vehicle-type aggregates against the seeded volume, with no index beyond the primary key, and record the output for the scaling section

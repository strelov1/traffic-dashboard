-- Up Migration

create table traffic_events (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null,
  -- A pattern rather than char(2): a fixed width rejects a value that is too
  -- long but pads one that is too short, so 'A' would be stored as 'A ' and
  -- appear in a chart as a country of its own.
  plate_country text not null constraint traffic_events_plate_country_check
    check (plate_country ~ '^[A-Z]{2}$'),
  -- A CHECK rather than an enum: admitting a new class stays a one-line
  -- migration instead of an ALTER TYPE.
  vehicle_type text not null constraint traffic_events_vehicle_type_check
    check (vehicle_type in ('car', 'van', 'truck', 'bus', 'motorcycle', 'bicycle'))
);

comment on table traffic_events is
  'One row per detected vehicle. Aggregates are computed on read; this grain is never replaced by summaries.';

-- Down Migration

drop table traffic_events;

-- Up Migration

create extension if not exists timescaledb;

-- A hypertable refuses any unique index that omits the partitioning column, so
-- the key widens. id still comes from one identity sequence, so it stays unique
-- in fact and stays the identifier a client addresses.
alter table traffic_events drop constraint traffic_events_pkey;
alter table traffic_events add primary key (id, occurred_at);

-- migrate_data moves the rows already stored into chunks. Without it the call
-- refuses to convert a non-empty table.
select create_hypertable(
  'traffic_events',
  by_range('occurred_at'),
  migrate_data => true
);

-- Down Migration

select 1;

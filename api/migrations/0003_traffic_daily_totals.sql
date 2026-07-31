-- Up Migration

-- One aggregate serves both endpoints: totals per country are a sum over
-- vehicle types, and vice versa. A day is the coarsest bucket that still
-- answers every period the project asks for.
--
-- materialized_only = false turns on real-time aggregation: the materialised
-- part is unioned with a live query over everything newer than the watermark.
-- With the refresh policy's end offset shorter than a day, the current day is
-- never complete and therefore never materialised, so a detection recorded a
-- moment ago is counted a moment ago.
create materialized view traffic_daily_totals
with (timescaledb.continuous, timescaledb.materialized_only = false) as
  select
    time_bucket('1 day', occurred_at) as day,
    plate_country,
    vehicle_type,
    count(*) as total
  from traffic_events
  group by day, plate_country, vehicle_type
with no data;

-- The trailing window is the contract for late data: a detection whose instant
-- falls inside it is picked up by the next refresh; one older than it is not
-- counted until a refresh is requested for that period.
--
-- end_offset is one whole bucket, not less. A refresh window is expanded to
-- bucket boundaries, so an offset shorter than a day would materialise today's
-- incomplete bucket and hide every detection recorded since.
select add_continuous_aggregate_policy(
  'traffic_daily_totals',
  start_offset => interval '7 days',
  end_offset => interval '1 day',
  schedule_interval => interval '30 minutes'
);

-- Down Migration

select 1;

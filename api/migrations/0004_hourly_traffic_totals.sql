-- Up Migration

-- Daily buckets were measured at 82 ms on four million rows, against 186 ms for
-- scanning the events outright — a fifth of the improvement the spike promised.
-- The cause is real-time aggregation: everything newer than the watermark is
-- scanned live on every request, and with a daily bucket that live tail is a
-- whole day of detections. At this volume it was 133 000 rows per request.
--
-- An hourly bucket shrinks the live tail to one hour of traffic while keeping
-- the materialised side small: thirty days is roughly 26 000 rows, which sums
-- in a few milliseconds. Freshness is unchanged — the current bucket is still
-- served live, so a detection recorded now is still counted now.

drop materialized view traffic_daily_totals;

create materialized view traffic_hourly_totals
with (timescaledb.continuous, timescaledb.materialized_only = false) as
  select
    time_bucket('1 hour', occurred_at) as hour,
    plate_country,
    vehicle_type,
    count(*) as total
  from traffic_events
  group by hour, plate_country, vehicle_type
with no data;

-- end_offset is one whole bucket: a refresh window is expanded to bucket
-- boundaries, so a shorter offset would materialise the current hour and hide
-- every detection recorded since. schedule_interval is well under the bucket,
-- so the live tail stays close to one hour rather than drifting toward two.
select add_continuous_aggregate_policy(
  'traffic_hourly_totals',
  start_offset => interval '7 days',
  end_offset => interval '1 hour',
  schedule_interval => interval '5 minutes'
);

-- Down Migration

select 1;

## ADDED Requirements

### Requirement: A correction or removal reconciles the maintained totals

When a stored event is corrected or removed, the maintained totals SHALL agree with the events by the time the response is written.

Real-time aggregation only adds rows newer than the materialisation watermark; it can neither subtract a removed event nor re-classify a corrected one. For any bucket below the watermark the materialised value is the whole answer, so a mutation there SHALL trigger a refresh of the bucket it touched.

The bucket containing the present SHALL NOT be refreshed by this path. Materialising it would move the watermark past detections recorded into that same hour afterwards, which neither side would then count — the guarantee that a detection recorded now is counted now takes precedence, and that bucket needs no refresh because it is served live.

Whether a bucket is current SHALL be decided by the database's clock, which is the clock its boundaries were computed with.

The mutation's outcome SHALL stand even if the refresh fails. The row has already changed, and reporting failure for a write that succeeded would be a worse answer than a stale total that the refresh policy may still repair.

#### Scenario: A detection older than the refresh window is removed

- **WHEN** a client deletes an event whose instant falls outside the policy's trailing window
- **THEN** the totals no longer count it, without waiting for any scheduled refresh

#### Scenario: A detection older than the refresh window is reclassified

- **WHEN** a client corrects the vehicle type of an event whose instant falls outside the policy's trailing window
- **THEN** the totals move one detection from the old class to the new one

#### Scenario: A detection in the current hour is corrected

- **WHEN** a client corrects an event recorded moments ago, and a further detection is recorded into the same hour afterwards
- **THEN** both are counted, because the current bucket was never materialised

## MODIFIED Requirements

### Requirement: Late detections are counted within a stated window

The refresh SHALL re-materialise a trailing window on a schedule, so a detection **delivered** after a delay is still counted. That window SHALL be the stated maximum lateness the system tolerates for an arrival: a detection whose instant falls outside it is not counted until a refresh is requested for that period.

This bound SHALL be stated as applying to arrivals only. A correction or a removal is reconciled when it happens, at any age, and is not subject to it. The two error directions differ and SHALL NOT be described as one: an uncounted late arrival leaves the total below the truth, whereas an unreconciled removal would leave it above.

The policy's `start_offset`, `end_offset` and `schedule_interval` SHALL be asserted by a test, since they are the whole of this contract and no type or query fails when they change.

#### Scenario: A detection arrives late but within the window

- **WHEN** a detection whose instant falls inside the trailing refresh window is recorded, and the refresh runs
- **THEN** the totals include it

#### Scenario: The policy is registered with the stated arguments

- **WHEN** the registered continuous-aggregate policy is read from the database
- **THEN** its trailing window, its offset from the present, and its schedule match the stated bound

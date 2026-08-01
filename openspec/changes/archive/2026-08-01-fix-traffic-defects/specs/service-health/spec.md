## ADDED Requirements

### Requirement: The API stops serving before it exits

On `SIGTERM` or `SIGINT` the API SHALL stop accepting connections, allow requests already in flight to finish, and release its database connections before the process exits.

The container runs the process as PID 1 with no init, so without a handler the default action terminates it at once: open responses are cut mid-write and every pooled connection closes as an unexpected end-of-file the database logs. Every `compose down`, restart, and container replacement does this today.

#### Scenario: A signal arrives while a request is in flight

- **WHEN** the process receives a termination signal while serving a request
- **THEN** that request is answered, no new connection is accepted, and the pool is closed before exit

### Requirement: An unseeded database still has usable totals

The one-time backfill of the continuous aggregate SHALL NOT be conditional on the seed having run.

The aggregate is created with no data, and until it is refreshed once the watermark sits at its minimum, so every row is served live and the totals look correct. When the policy first fires it moves the watermark forward, and everything older than the trailing window becomes neither materialised nor live. A database populated by any route other than the seed is therefore correct at first and quietly wrong minutes later.

#### Scenario: History is loaded into an unseeded database

- **WHEN** events spanning more than the trailing refresh window are recorded through the API into a database the seed did not populate, and the refresh policy then runs
- **THEN** the totals still count them

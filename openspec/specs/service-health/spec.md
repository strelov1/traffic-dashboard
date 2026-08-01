# service-health Specification

## Purpose

Whether the system is running and its parts can reach each other: the API's readiness signal including database connectivity, and the startup and configuration guarantees that make a single command enough to bring the stack up.

The browser-facing half of this capability was the connectivity shell, removed when the dashboard replaced it. Reachability is now visible through the dashboard's own per-chart states, specified in `traffic-dashboard`.

This capability carries no traffic-domain behaviour. It exists so that a failure anywhere else can be told apart from the plumbing being down.
## Requirements
### Requirement: API reports readiness with database connectivity

The API SHALL expose `GET /api/health` reporting two independent facts: that the process is serving requests, and whether it can reach the database. The response body SHALL use the `{"data": ...}` envelope, because a health check that answers is a successful report regardless of what it reports; the verdict is carried by the HTTP status code, not by the envelope.

The check MUST reach the database on each request rather than returning a cached verdict, since a stale "up" is the failure this endpoint exists to prevent.

#### Scenario: Database reachable

- **WHEN** a client requests `GET /api/health` and the API can execute a query
- **THEN** the API responds `200` with `{"data": {"status": "ok", "database": "up"}}`

#### Scenario: Database unreachable

- **WHEN** a client requests `GET /api/health` and the database refuses or times out the connection
- **THEN** the API responds `503` with `{"data": {"status": "degraded", "database": "down"}}`

#### Scenario: Connectivity is re-checked per request

- **WHEN** a client requests `GET /api/health` twice and the database becomes unreachable between the two requests
- **THEN** the first response reports `"database": "up"` and the second reports `"database": "down"`

### Requirement: Unhandled failures use the error envelope

The API SHALL render any unhandled failure as `{"error": "<message>"}` with a 5xx status, and SHALL NOT leak stack traces or driver internals into the response body. Unknown routes SHALL respond `404` in the same shape.

#### Scenario: Unknown route

- **WHEN** a client requests a path the API does not serve
- **THEN** the API responds `404` with a body matching `{"error": "<message>"}`

### Requirement: Migrations complete before the API serves requests

The API SHALL apply pending migrations at startup and SHALL NOT accept requests until they have completed. When the database is not yet accepting connections, startup MUST retry rather than exit, so that container start order is not a source of failure. If migrations fail for any reason other than connection readiness, the process MUST exit non-zero rather than serve with an unknown schema.

#### Scenario: Database accepts connections after the API starts

- **WHEN** the API starts while the database is still initialising
- **THEN** startup retries the connection, applies migrations once the database is ready, and only then begins serving

#### Scenario: Migration fails

- **WHEN** a migration raises an error that is not a connection failure
- **THEN** the process exits non-zero and does not serve requests

### Requirement: Browser may call the API across the origin boundary

The API SHALL accept cross-origin requests from the web application's origin, configured explicitly in the application rather than delegated to a reverse proxy, so that the same configuration holds whether the project runs under Docker Compose or as two development servers.

#### Scenario: Request from the web origin

- **WHEN** the browser issues `GET /api/health` from the web application's origin
- **THEN** the response carries headers permitting that origin to read it

### Requirement: The system starts with a single command

A machine with only Docker installed SHALL be able to bring up the database, the API, and the web application with one command, with the API gated on database readiness. No manual migration or seeding step SHALL be required.

#### Scenario: Clean machine

- **WHEN** an operator runs the documented startup command in a clean checkout
- **THEN** all three services reach a running state and `GET /api/health` reports `"database": "up"`

### Requirement: Required configuration is documented and validated

The API SHALL read its database connection from `DATABASE_URL` and SHALL fail at startup with an explicit message naming the missing variable when it is absent, rather than failing later with a driver-level error. The repository MUST carry an `.env.example` listing every variable the API requires.

#### Scenario: Configuration missing

- **WHEN** the API starts without `DATABASE_URL` set
- **THEN** it exits non-zero with a message naming `DATABASE_URL`

### Requirement: The migration runner resolves the migrations the API ships with

The directory the API hands to the migration runner SHALL resolve to the migration files packaged with the build, and a test SHALL assert this by applying it and checking the resulting schema.

The path is computed from the calling module's own location, so it is a function of where that module sits in the tree, and the type checker cannot see it change. A path that names nothing fails loudly, because the runner reads the directory and raises `ENOENT`. A path that names an existing directory holding no migrations does not: that is a successful run over an empty set, against a schema with no tables.

An assertion that the run merely resolved therefore SHALL NOT be treated as covering this requirement — only an assertion about the schema afterwards distinguishes the two.

The sources and the compiled output are covered by the same assertion only for as long as they place the module at the same depth. That is a property of the build configuration rather than of this code, and it is not asserted here.

#### Scenario: The exported directory names the shipped migrations

- **WHEN** the constant the entrypoint passes to the migration runner is read
- **THEN** it points at a directory containing the project's migration files, including the one that creates `traffic_events`

#### Scenario: A module holding the constant is relocated

- **WHEN** the module that computes the migrations directory is moved to a different depth in the source tree
- **THEN** a test fails, rather than the API starting against a schema with no tables

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


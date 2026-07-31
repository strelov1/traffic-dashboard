## ADDED Requirements

### Requirement: The migration runner resolves the migrations the API ships with

The directory the API hands to the migration runner SHALL resolve to the migration files packaged with the build, from any module location and in both the compiled output and the sources.

The path is computed from the calling module's own location, so it is a function of where that module sits in the tree. Moving the module changes the path, and neither the type checker nor any suite that passes an explicit directory can observe the break: the failure appears only when the process starts against a real database, as an empty migration set applied successfully to an unmigrated schema. That is the failure this repository's wiring tests exist for — everything green, the application broken.

Applying an empty migration set SHALL NOT be treated as success by anything that can detect it.

#### Scenario: The exported directory names the shipped migrations

- **WHEN** the constant the entrypoint passes to the migration runner is read
- **THEN** it points at a directory containing the project's migration files, including the one that creates `traffic_events`

#### Scenario: A module holding the constant is relocated

- **WHEN** the module that computes the migrations directory is moved to a different depth in the source tree
- **THEN** a test fails, rather than the API starting against a schema with no tables

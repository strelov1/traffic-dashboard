## ADDED Requirements

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

## Why

Two files in `api/src/traffic` carry more than one concern each, and a review found a defect that lives exactly on the seam.

`repository.ts` holds the domain types (`TrafficEvent`, `CategoryTotal`, the vehicle-type union), the SQL, and the zod schemas that validate driver rows. A reader who wants to know what a detection *is* has to read the SQL to find out. `ingest-routes.ts` holds the HTTP schemas and also `toEvent`, which turns a request field into a domain instant — so the rule "a detection's instant must be a real instant" ended up in the transport layer, where nothing asserts it and nothing looks for it. A leap-second `occurredAt` passes the HTTP schema, becomes `Invalid Date`, and reaches the driver as `NaN`.

The layering is not the fix for that defect; it is what makes the fix have an obvious home. Today there is no file the invariant belongs in.

Nothing here changes behaviour. The point is that the next change — which does change behaviour — lands in one place instead of three.

## What Changes

- `api/src/traffic` gains three directories with one direction of dependency: `domain` knows nothing, `infra` and `http` both know `domain` and the port, and neither knows the other.
- `ports.ts` takes over `TrafficRepository`. The contract is already a declared type, so nothing about it changes — but it currently sits in the same module as the SQL, which puts every statement in the transport layer's import graph. Afterwards `http` names the port and never the adapter.
- The domain types move out of `repository.ts` into `domain/`: `vehicle-type.ts`, `detection.ts` (`TrafficEvent` and `StoredTrafficEvent`), `totals.ts` (`CountryTotal` and `VehicleTypeTotal`). `repository.ts` becomes `infra/postgres-repository.ts` and keeps only SQL and row validation.
- `toEvent` moves out of `ingest-routes.ts` into `domain/detection.ts`, unchanged. The invariant it is missing is named in design.md as a seam and left for the next change, so this one stays a pure move.
- The files that are not about traffic — `config.ts`, `db.ts`, `migrate.ts`, `server.ts`, `health.ts` — move to `platform/`. They are the things a second feature would reuse verbatim, and calling that out is cheaper than discovering it when a second feature arrives.
- `index.ts` stays the composition root and is the only file that names both `platform` and `traffic`.
- Test files move with the code they test. No test is rewritten; the suite must stay at 144 green.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `service-health`: gains one requirement, that the migration runner resolves the migrations the API ships with. It is not new behaviour — it is behaviour that was always required and never stated, and this change is what makes it breakable. Everything else in `openspec/specs/` describes behaviour preserved exactly, and the suite is the evidence: a pure move that breaks a requirement fails a test.

## Impact

- **Code:** every file under `api/src` moves or is renamed; import paths change throughout. `git log --follow` and `git diff -M` keep the history readable.
- **Behaviour:** none. Identical routes, identical SQL, identical responses.
- **Build:** `tsconfig.build.json`, `vitest.config.ts` and `api/Dockerfile` reference `src/` as a whole and need no change. `MIGRATIONS_DIRECTORY` in `migrate.ts` resolves relative to the file, so moving it to `platform/` changes that path and is the one thing here that can break at runtime rather than at compile time.
- **Risk:** low but not zero. TypeScript catches a wrong import; it does not catch a wrong runtime path, and the wiring tests exist because that class of failure has happened in this repository before.

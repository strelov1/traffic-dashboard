## 1. Strengthen the net before leaning on it

- [x] 1.1 Strengthen `migrate.test.ts:69` from `resolves.toBeUndefined()` to asserting the outcome: after applying `MIGRATIONS_DIRECTORY`, `traffic_events` exists. Demonstrate the new assertion has teeth by pointing it at an empty directory once and watching it fail, then point it back.
- [x] 1.2 Run the suite. 144 green, no production file touched.

## 2. Extract the domain

- [x] 2.1 Create `traffic/domain/vehicle-type.ts` from `traffic/vehicle-types.ts`, unchanged. Update importers.
- [x] 2.2 Create `traffic/domain/detection.ts` holding `TrafficEvent` and `StoredTrafficEvent`, plus the `toEvent` mapping moved verbatim from `ingest-routes.ts` — it is the only place untrusted input becomes a domain event, so it is where the missing instant invariant belongs. Mark that seam in a comment; add no validation here. Keep the name `TrafficEvent`: `http` already uses `Detection` for the wire shape, and reusing it for the domain shape would blur exactly the boundary this change draws.
- [x] 2.3 Create `traffic/domain/totals.ts` holding `CountryTotal` and `VehicleTypeTotal`. (There is no `CategoryTotal` on this side — that is the web's shape.)
- [x] 2.4 Run the suite. Green, with no test assertion edited.

## 3. Invert the repository dependency

- [x] 3.1 Create `traffic/ports.ts` and move `TrafficRepository` into it verbatim. The type is already declared; what changes is which module owns it.
- [x] 3.2 Point every consumer — the two route modules, `seed.ts`, and the tests that name the contract — at `ports.ts` instead of the repository module.
- [x] 3.3 Keep the adapter's `: TrafficRepository` annotation, now satisfied against the port, so a drifted signature is an error at the implementation.
- [x] 3.4 Run the suite. Green. Confirm no *production* file under `http/` imports anything under `infra/`. The two integration tests there are composition roots and legitimately name both, which is why the rule is about production code.

## 4. Move the adapters and the transport

- [x] 4.1 Move `traffic/repository.ts` to `traffic/infra/postgres-repository.ts`, keeping only SQL and row validation.
- [x] 4.2 Move `traffic/seed.ts` to `traffic/infra/seed.ts`.
- [x] 4.3 Move `traffic/ingest-routes.ts` and `traffic/aggregate-routes.ts` to `traffic/http/`.
- [x] 4.4 Move each test file next to the code it now tests. Import paths only — no assertion changes.
- [x] 4.5 Run the suite. Green.

## 5. Separate the platform

- [x] 5.1 Move `config.ts`, `db.ts` (as `database.ts`), `server.ts` and `health.ts` to `platform/`, with their tests.
- [x] 5.2 Move `migrate.ts` to `platform/`. Watch task 1.1's test go RED on the relative path, then correct `MIGRATIONS_DIRECTORY` to the new depth and watch it go GREEN. This is the change's one real risk and the reason the test was written first.
- [x] 5.3 Update `index.ts` to the new paths. It stays the composition root and the only file naming both `platform` and `traffic`.
- [x] 5.4 Run the suite. Green.

## 6. Verify the move was a move

- [x] 6.1 `pnpm verify` — lint, typecheck, 144 green.
- [x] 6.2 `git diff -M --stat` — confirm renames are detected and that the only files with changed bodies are `ports.ts`, the two route files, `index.ts`, `migrate.ts` and the new domain files.
- [x] 6.3 `git diff -M` over every `*.test.ts` — confirm import lines only. Any changed assertion means the move was not a move.
- [x] 6.4 `docker compose up --build`, then confirm the schema was actually created and both aggregate endpoints answer. The migrations path cannot be trusted to unit tests alone; this is what task 1.1 is a proxy for.
- [x] 6.5 Invoke `simplify` on the diff, then re-run the suite.
- [x] 6.6 Request code review on the diff; fix Critical and Important before marking the change done.

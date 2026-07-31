## 1. Pin the one thing a move can break silently

- [ ] 1.1 Write a failing-first test asserting `MIGRATIONS_DIRECTORY` resolves to a directory containing `0001_create_traffic_events.sql`. It passes before any move; it is the control that catches the move, so it must exist first.
- [ ] 1.2 Run the suite. 145 green, and no production file has been touched yet.

## 2. Extract the domain

- [ ] 2.1 Create `traffic/domain/vehicle-type.ts` from `traffic/vehicle-types.ts`, unchanged. Update importers.
- [ ] 2.2 Create `traffic/domain/detection.ts` holding `TrafficEvent` (renamed `Detection` at its new home) and the `toEvent` mapping moved verbatim from `ingest-routes.ts`, with a comment marking the `Invalid Date` seam that `fix-traffic-defects` closes. No new validation.
- [ ] 2.3 Create `traffic/domain/category-total.ts` holding `CategoryTotal`.
- [ ] 2.4 Run the suite. Green, with no test assertion edited.

## 3. Invert the repository dependency

- [ ] 3.1 Create `traffic/ports.ts` declaring `TrafficRepository` as an interface over the domain types, replacing the `ReturnType<typeof createTrafficRepository>` inference.
- [ ] 3.2 Point `aggregate-routes.ts` and `ingest-routes.ts` at `ports.ts` instead of the concrete repository module.
- [ ] 3.3 Make the Postgres implementation satisfy the interface explicitly, so a drifted signature is an error at the adapter rather than a silent change of contract.
- [ ] 3.4 Run the suite. Green. Confirm no file under `http/` imports anything under `infra/`.

## 4. Move the adapters and the transport

- [ ] 4.1 Move `traffic/repository.ts` to `traffic/infra/postgres-repository.ts`, keeping only SQL and row validation.
- [ ] 4.2 Move `traffic/seed.ts` to `traffic/infra/seed.ts`.
- [ ] 4.3 Move `traffic/ingest-routes.ts` and `traffic/aggregate-routes.ts` to `traffic/http/`.
- [ ] 4.4 Move each test file next to the code it now tests. Import paths only — no assertion changes.
- [ ] 4.5 Run the suite. Green.

## 5. Separate the platform

- [ ] 5.1 Move `config.ts`, `db.ts` (as `database.ts`), `server.ts` and `health.ts` to `platform/`, with their tests.
- [ ] 5.2 Move `migrate.ts` to `platform/`. Watch task 1.1's test go RED on the relative path, then correct `MIGRATIONS_DIRECTORY` to the new depth and watch it go GREEN. This is the change's one real risk and the reason the test was written first.
- [ ] 5.3 Update `index.ts` to the new paths. It stays the composition root and the only file naming both `platform` and `traffic`.
- [ ] 5.4 Run the suite. Green.

## 6. Verify the move was a move

- [ ] 6.1 `pnpm verify` — lint, typecheck, 145 green.
- [ ] 6.2 `git diff -M --stat` — confirm renames are detected and that the only files with changed bodies are `ports.ts`, the two route files, `index.ts`, `migrate.ts` and the new domain files.
- [ ] 6.3 `git diff -M` over every `*.test.ts` — confirm import lines only. Any changed assertion means the move was not a move.
- [ ] 6.4 `docker compose up --build`, then confirm the schema was actually created and both aggregate endpoints answer. The migrations path cannot be trusted to unit tests alone; this is what task 1.1 is a proxy for.
- [ ] 6.5 Invoke `simplify` on the diff, then re-run the suite.
- [ ] 6.6 Request code review on the diff; fix Critical and Important before marking the change done.

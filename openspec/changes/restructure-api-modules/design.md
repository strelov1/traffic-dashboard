## Context

`api/src` is flat apart from one `traffic/` directory. At 780 production lines across 14 files that is not yet a problem of size; it is a problem of which file answers which question.

Three specific tangles:

- `repository.ts` (139 lines) declares `TrafficEvent`, `CategoryTotal` and the row schemas, and also holds every SQL statement. It is the file you read to learn the domain and the file you read to learn the storage.
- `ingest-routes.ts` (144 lines) declares the HTTP schemas and also `toEvent`, which maps a wire field to a domain instant. That mapping is where a domain rule belongs and where nobody looks for one.
- `TrafficRepository` is a type inferred from `createTrafficRepository`'s return. `aggregate-routes.ts` and `ingest-routes.ts` import it from the concrete Postgres module, so the transport layer depends on the adapter to know its own contract.

The last one is the load-bearing problem. Everything else is tidying.

## Goals / Non-Goals

**Goals:**

- One direction of dependency inside `traffic/`: `domain` ← `ports` ← {`infra`, `http`}, with `infra` and `http` unaware of each other.
- A file that answers "what is a detection" without SQL in it.
- A named home for the invariant the next change adds, so that change is one file rather than a hunt.
- Separate what is about traffic from what any second feature would reuse.
- The suite stays at 144 green, unmodified except for import paths.

**Non-Goals:**

- No behaviour change. Not one response, status code, or query differs.
- No new validation. The leap-second defect is named here and fixed in `fix-traffic-defects`. Fixing it inside a "pure move" would make the move unreviewable — a reviewer could no longer trust that a green suite proves nothing changed.
- No use-case layer. There is no orchestration between the route and the repository worth a file of its own; inventing one would be the overengineering AGENTS.md forbids.
- No `web/` changes.

## Decisions

**Vertical slice, not four horizontal layers.** The canonical `domain/ application/ infrastructure/ interface/` split at the top of `src` was considered and rejected. It scatters one feature across four distant directories to buy isolation between features that do not exist yet. Slicing by feature first and layering inside the slice gives the same dependency discipline and keeps everything about traffic in one place. If a second feature arrives it gets its own slice, and `platform/` is already the shared floor. This is the layout that stays honest at 780 lines and at 8000.

**`ports.ts` at the slice root, not inside `domain/`.** The port is a statement about what this application needs from storage, which is an application concern, not a domain one. Putting it at the slice root also makes the dependency arrow visible in the tree: one file both `infra` and `http` point at.

**`TrafficRepository` becomes a declared interface.** Today it is `ReturnType<typeof createTrafficRepository>`. Inverting it means the adapter must satisfy a contract the slice states, so a signature drifting in `infra` is a compile error at the implementation rather than a silent change of what `http` believes. It also makes `stub-database.ts`-style test doubles type-check against the contract instead of against whatever Postgres happens to return.

**`platform/` rather than leaving the shared files at `src/` root.** Both work. Naming it makes the reuse boundary explicit and stops `src/` root from being the place where unclassified files accumulate — which is how it got this way.

**Test files move next to the code they test**, matching the existing convention (`traffic/repository.test.ts` sits beside `traffic/repository.ts`). `testing/` stays at `src/` root: it is used by both slices' tests and by `platform`'s.

**`domain/detection.ts` receives `toEvent` verbatim**, `Invalid Date` bug included, with a comment marking it as the seam the next change closes. Moving a known defect into the file where it belongs, and saying so, is more honest than fixing it inside a change whose whole claim is that nothing changed.

## Risks / Trade-offs

**`MIGRATIONS_DIRECTORY` breaks silently → covered by a test written first.** `migrate.ts:6` is `fileURLToPath(new URL('../migrations', import.meta.url))`, resolved against the file's own location at runtime — in `dist/` as much as in `src/`. Moving the file to `platform/` turns `dist/migrate.js → api/migrations` into `dist/platform/migrate.js → dist/migrations`, which does not exist. TypeScript cannot see it; `migrate.test.ts` cannot see it either, because every test passes an explicit fixture directory. This is the exact failure class the repository's third test level was created for: green tests, broken application. Task 1 therefore writes a test asserting `MIGRATIONS_DIRECTORY` contains `0001_create_traffic_events.sql` — RED before the move is corrected, GREEN after — and that test outlives this change.

**A "pure move" that is not pure → the suite is the control.** The mitigation is procedural: no task in this change may edit a test's assertions. Import paths only. If a test needs its expectations changed, the move was not a move, and that is the signal to stop.

**Rename noise buries a real edit in review → `git diff -M` and one commit per coherent move.** Renames are detected; the reviewable content is the handful of files whose bodies actually change (`ports.ts`, the two route files' imports, `index.ts`, `migrate.ts`'s path).

**Churn cost against a working system.** Real, and worth stating plainly: this change delivers no user-visible value. It is justified by the two changes queued behind it, both of which touch the files being separated. Doing it after them would mean doing their work twice.

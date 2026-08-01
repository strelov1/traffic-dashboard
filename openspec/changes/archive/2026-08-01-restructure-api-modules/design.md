## Context

`api/src` is flat apart from one `traffic/` directory. At 780 production lines across 14 files that is not yet a problem of size; it is a problem of which file answers which question.

Three specific tangles:

- `repository.ts` (139 lines) declares `TrafficEvent`, `CountryTotal`, `VehicleTypeTotal` and the row schemas, and also holds every SQL statement. It is the file you read to learn the domain and the file you read to learn the storage.
- `ingest-routes.ts` (144 lines) declares the HTTP schemas and also `toEvent`, which maps a wire field to a domain instant. That mapping is where a domain rule belongs and where nobody looks for one.
- `TrafficRepository` is declared explicitly (`repository.ts:24-31`) and `createTrafficRepository` is annotated with it, so the *type* dependency already points the right way. What does not is the *module* dependency: the contract is co-located with the Postgres implementation, so `aggregate-routes.ts` and `ingest-routes.ts` reach into the adapter's module to learn their own contract, and every SQL statement in that file is in their import graph.

None of these is load-bearing on its own, and it is worth saying so rather than inflating the case: the contract's type already points the right way, and the tangles cost readability rather than correctness. What the change buys is that the transport's import graph stops containing the SQL, and that the invariant the next change adds has a file to land in. It is tidying, done deliberately ahead of two changes that both touch these files.

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

**`TrafficRepository` moves, it does not change.** The contract is already a declared type rather than an inferred one, so this is a module boundary rather than a type-system fix: after the move `http` imports the contract from `ports.ts` and never names the adapter's module, which is what makes "`infra` and `http` do not know each other" checkable by reading imports instead of by trusting a convention.

**`platform/` rather than leaving the shared files at `src/` root.** Both work. Naming it makes the reuse boundary explicit and stops `src/` root from being the place where unclassified files accumulate — which is how it got this way.

**Test files move next to the code they test**, matching the existing convention (`traffic/repository.test.ts` sits beside `traffic/repository.ts`). `testing/` stays at `src/` root: it is used by both slices' tests and by `platform`'s.

**`domain/detection.ts` receives `toEvent` verbatim**, `Invalid Date` bug included, with a comment marking it as the seam the next change closes. Moving a known defect into the file where it belongs, and saying so, is more honest than fixing it inside a change whose whole claim is that nothing changed.

## Risks / Trade-offs

**`MIGRATIONS_DIRECTORY` breaks on the move → already caught, but by a weaker assertion than it should be.** `migrate.ts:6` is `fileURLToPath(new URL('../migrations', import.meta.url))`, resolved against the file's own location at runtime — in `dist/` as much as in `src/`. Moving the file to `platform/` turns `dist/migrate.js → api/migrations` into `dist/platform/migrate.js → dist/migrations`.

That path does not exist, and `node-pg-migrate` reads the directory with `readdir` (`dist/legacy/migration.js:40`), which throws `ENOENT`. So `migrate.test.ts:69` — "applies the project's own migrations directory" — does fail on the move. The safety net is real.

What that test does not cover is the neighbouring case: it asserts only `resolves.toBeUndefined()`, and `migrate.test.ts:60` establishes that an **existing but empty** directory is a success. A path that lands on a real directory with no migrations in it therefore reports success against a schema with no tables. The assertion is one step weaker than its own name claims.

Task 1 strengthens it to assert the outcome rather than the absence of a throw: after applying `MIGRATIONS_DIRECTORY`, `traffic_events` exists. Its teeth are demonstrated by pointing the same assertion at an empty directory once and watching it fail. That closes the empty-set hole, makes the test's name true, and leaves a stronger net in place for task 5.2 than the one this change inherited.

**A "pure move" that is not pure → the suite is the control.** The mitigation is procedural: no task in this change may edit a test's assertions. Import paths only. If a test needs its expectations changed, the move was not a move, and that is the signal to stop.

**Rename noise buries a real edit in review → `git diff -M` and one commit per coherent move.** Renames are detected; the reviewable content is the handful of files whose bodies actually change (`ports.ts`, the two route files' imports, `index.ts`, `migrate.ts`'s path).

**Churn cost against a working system.** Real, and worth stating plainly: this change delivers no user-visible value. It is justified by the two changes queued behind it, both of which touch the files being separated. Doing it after them would mean doing their work twice.

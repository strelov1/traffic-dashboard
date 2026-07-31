## Context

Empty repository, greenfield. This change picks the runtime, the build and test tooling, and the HTTP response envelope. Those choices propagate: every later endpoint inherits the envelope, every later test inherits the runner, and every later dependency is installed into the workspace layout decided here.

The work is assessed by a reviewer who reads the code once. That favours a small number of well-understood parts over a clever assembly, and it makes the rationale for each choice part of the deliverable.

## Goals / Non-Goals

**Goals:**

- Prove every seam once, against a payload with no domain meaning: process boots, migrations run, API reaches Postgres, browser reaches API across an origin boundary.
- Establish the response envelope, the error shape, and the test idiom that later increments extend rather than revisit.
- One command brings the whole system up on a machine that has only Docker.

**Non-Goals:**

- Any traffic concept — schema, seed, aggregation, charts. The next change introduces all of them.
- Authentication, rate limiting, observability. Nothing in the assessment asks for them.
- An ORM. Deferred rather than rejected, but the queries this project is judged on are aggregations, and a query builder would hide them.

## Decisions

**One pnpm workspace, not two repositories or two unrelated package manifests.** `api/` and `web/` share a TypeScript base config, a linter, and a test runner, so there is one way to run the tests and one place to change a rule. Two repositories would double the setup a reviewer has to perform before seeing anything run.

**Fastify over Express.** First-class TypeScript types, and JSON schema declarations that validate input and serialise output from one definition — exactly the repetitive part of an API layer. Express would need that assembled from middleware by hand. The choice matters more later, when endpoints take query filters, than it does for a health check.

**Response envelope `{"data": ...}`, errors `{"error": "message"}`.** Decided here, against a payload where nothing is at stake, because it binds every later endpoint. The envelope leaves room to add `meta` for pagination and applied filters without breaking a client that already reads `data`; a bare top-level object does not.

**`/api/health` distinguishes "process up" from "database reachable", and returns 503 when the database is unreachable.** Collapsing the two into a single boolean makes the endpoint useless for the thing it exists to diagnose. The distinction also gives the web shell two states worth rendering, which is what makes the frontend test meaningful rather than a smoke test.

**An empty initial migration, run on API startup.** The runner is the part that fails in unfamiliar ways — ordering, connection timing, a container that is up before Postgres accepts connections. Proving it while it carries nothing means that when the `traffic_events` migration arrives, a failure is unambiguously about the schema.

**Postgres reached with `pg` and plain SQL, no ORM.** Consistent with the non-goal above and with what the project is assessed on. Drizzle was weighed and set aside: its payoff scales with the size of the schema, and this one is a single table read by two aggregates, while its cost — a generated migration pipeline, a second way to express queries, and a DSL between the reviewer and the `GROUP BY` — is fixed.

**Row shapes are validated at runtime with Zod, passed as an argument rather than a type parameter.** Declining an ORM gives up the guarantee that a query's result matches the type the caller claims: `query<{ total: number }>(...)` is an assertion TypeScript never checks, so a renamed column reaches the caller as `undefined` with everything still compiling. Making the shape a required argument means an unvalidated query cannot be written at all, which is the property that a merely-available validator never has. The check costs one parse per query against result sets that are already bounded by aggregation.

**Integration tests against real Postgres via Testcontainers; no mocked database.** The health check's whole purpose is to report on a real connection, so a mocked driver would assert that the code calls a function and prove nothing. Testcontainers starts a throwaway Postgres per run, requiring Docker — already a prerequisite for running the project at all.

**Vitest on both sides, with Testing Library for the web.** One runner, one config idiom, one command in CI later. Testing Library pushes the component test toward what the user sees, which keeps it useful when the shell's markup changes.

**CORS configured explicitly in the API rather than delegated to a proxy.** The same configuration then works whether the reviewer runs Compose or the two dev servers directly, and the origin boundary is visible in the code instead of buried in infrastructure.

## Risks / Trade-offs

- **A scaffolding change produces no user-visible feature, so it can read as time spent on nothing.** → It ends with a running system whose health is observable in a browser, and the increment after it is short precisely because the plumbing is already proven.
- **Testcontainers makes the test suite depend on a running Docker daemon.** → Acceptable, since Docker is already required to run the project; the alternative is a suite that passes while the connection handling is wrong.
- **The response envelope is decided before any real payload exists, so a later requirement could fit it badly.** → It is a shape with room to grow (`data` plus optional `meta`), and the cost of getting it wrong is a coordinated edit across a handful of endpoints, not a rewrite.
- **The API container can start before Postgres accepts connections, making startup order a source of flaky first runs.** → Compose health checks gate the API on Postgres readiness, and the migration step retries; both are exercised the first time the stack comes up.

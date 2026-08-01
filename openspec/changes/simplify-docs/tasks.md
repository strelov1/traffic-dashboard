## 1. The storage decision, standalone

- [x] 1.1 Write `docs/adr/0001-timescaledb.md`. Context: the 500 RPS run that failed 78 % of requests, the pool exhaustion the logs named, and p95 pinned at `connectionTimeoutMillis` rather than at any query time.
- [x] 1.2 Decision: the events table as a hypertable, hourly totals as a continuous aggregate, endpoints summing maintained totals.
- [x] 1.3 Alternatives, each with the reason it is wrong for this failure rather than wrong in general: an index (`count(*) ... group by` reads every row by definition), a bigger pool (more concurrent scans on the same cores), a cache (stops helping once the refresh scan no longer fits inside the TTL — and is still on the roadmap above a cheap read, which the section must not blur).
- [x] 1.4 Consequences: the freshness bound and its two directions, the live tail that made the bucket width the real decision, the mutation-refresh path and its seam, and what would force the decision to be revisited.

## 2. Relocate the argument

- [x] 2.1 `docs/architecture.md`: the data-model, contract and dashboard reasoning the README currently carries — the grain, what a country means, constraints in the database, rows validated on the way out, declared responses, the period contract and outward rounding, bars over a pie, per-panel state and retry, the filter in the URL, the record form.
- [x] 2.2 `docs/deployment.md`: Terraform and Compose as one boundary, provisioning, releases, the forced command on the deploy key, and where the secrets live.
- [x] 2.3 Diff the old README against the new one plus the three documents, and account for every paragraph as kept, moved, or dropped as redundant. A relocation that quietly loses a paragraph is the failure mode of this change.

## 3. The README

- [x] 3.1 Replace the ASCII block with a Mermaid diagram: browser, nginx and the static bundle, the Fastify API, and TimescaleDB holding `traffic_events` and `traffic_hourly_totals` — with the materialised side and the live tail drawn separately and the refresh policy as the edge that moves the line between them.
- [x] 3.2 Cut hard: what this is, how to run it, the API table with the curl examples, the architecture in brief, the scaling answer in brief, freshness, deployment, layout — each cut section keeping one sentence that carries the link to where it went. Target was roughly 140 lines; it landed at 181 from 455, of which 56 are fenced blocks (the diagram, and the commands a reader runs). Reaching 140 would have meant dropping one of the six things worth keeping, so the count gave way rather than the content.
- [x] 3.3 Check the rendered Mermaid parses rather than assuming it does.

## 4. The drift a review found

- [x] 4.1 `openspec/specs/traffic-data/spec.md`: rewrite the daily-totals requirement as hourly, matching migration 0004 and the tests that already pin the bucket boundaries. Leave the ARCHIVED changes alone — they carry decisions later measured to be wrong, on purpose.
- [x] 4.2 `docs/performance/aggregate-baseline.md`: label it the pre-TimescaleDB baseline and name the state it was taken at — `postgres:17-alpine` with only migration 0001 applied, at the commit that added the table.
- [x] 4.3 `AGENTS.md`: fill Stack, Layout, Commands and Conventions from what exists, including the dependency rule production code must not violate.

## 5. Every claim is executed, not reviewed

- [x] 5.1 Bring the stack up from an empty volume with the command the README prints, and time it against the claim that it takes a few seconds. Confirm the seed writes the stated default and that a restart skips it.
- [x] 5.2 Run every curl example as written and compare the printed output byte for byte, including the two refusals.
- [x] 5.3 Exercise each row of the endpoint table, including `PATCH` and `DELETE` and the 404 a second delete answers.
- [x] 5.4 Confirm the published ports, the health endpoint, and that the dashboard is served on 8080.
- [x] 5.5 Replace the test count with the number `pnpm verify` actually reports, and say where the two halves come from.

## 6. Verify

- [x] 6.1 `openspec validate simplify-docs --strict`.
- [x] 6.2 `pnpm verify` — lint, typecheck, whole suite green. No source file changed, so a failure here means something was touched that should not have been.

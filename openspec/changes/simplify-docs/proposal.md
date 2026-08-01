## Why

The README is the first artefact a reviewer opens, and it has grown by accretion to 455 lines. Every increment appended its own argument, so the instructions a reader needs in the first minute — what this is, how to run it, what the endpoints answer — are interleaved with the reasoning behind decisions that were settled weeks ago. The reasoning is worth keeping; carrying all of it above the fold is what makes the file hard to read.

The same accretion has left claims behind the code. The verify line says the suite is 164 tests where it is 298. `openspec/specs/traffic-data/spec.md` still specifies **daily** buckets, which migration 0004 replaced with hourly and a test now pins. `docs/performance/aggregate-baseline.md` names `postgres:17-alpine` while Compose runs `timescale/timescaledb:2.29.0-pg17` — true when written, misleading now that it reads as a description of the current stack. `AGENTS.md` carries four `_TBD_` placeholders in the file that forbids placeholders.

## What Changes

- **The README is compressed from 455 lines to 181**, keeping what this is, how to run it, the API table, the architecture, the scaling answer in brief, and the freshness bound. Nothing is deleted: every relocated paragraph lands in `docs/` and is linked from the sentence that summarises it.
- **The ASCII block becomes a Mermaid diagram** showing the browser, the static bundle behind nginx, the Fastify API, and TimescaleDB — with the materialised side and the live tail drawn as the two things they are, because that split is the idea the whole design rests on and a box labelled "TimescaleDB" hides it.
- **`docs/adr/0001-timescaledb.md`** makes the storage decision standalone: the 500 RPS failure that forced it, the decision, the alternatives and why each is wrong for this failure, and the consequences the system now lives with.
- **`docs/architecture.md` and `docs/deployment.md`** receive the argument the README no longer carries — the data model and contract decisions, the dashboard decisions, and provisioning and releases.
- **The drift is corrected.** The `traffic-data` spec says hourly. The baseline measurement is labelled as pre-TimescaleDB and names the commit and migration state it was taken at. `AGENTS.md` states the stack, layout, commands and conventions that now exist.
- **Every surviving claim is checked against a running stack** rather than carried forward on trust: the ports, the commands, each row of the endpoint table, each curl example and its printed output, and the test count.

## Capabilities

### New Capabilities

None. No behaviour changes; this change moves and corrects the description of behaviour that already ships.

### Modified Capabilities

- `traffic-data`: the maintained-totals requirement specifies hourly buckets rather than daily, matching migration 0004 and the tests that already pin it. The requirement's text is what changes, not the system.

## Impact

- **Docs:** `README.md` rewritten; `docs/adr/0001-timescaledb.md`, `docs/architecture.md` and `docs/deployment.md` added; `docs/performance/aggregate-baseline.md` re-headed; `AGENTS.md` completed.
- **Specs:** one requirement in `traffic-data`. The ARCHIVED changes are left exactly as they are — they record decisions that were later measured to be wrong, and editing them would erase the measurement.
- **Code:** none. No source file changes, so `pnpm verify` is a regression check here rather than the thing being driven.
- **Risk:** the failure mode of a documentation change is a claim that reads well and is false. The mitigation is that the claims are executed, not reviewed — the stack is brought up from an empty volume and each command in the README is run as written.

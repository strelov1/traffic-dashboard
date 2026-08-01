## Context

Both defects are the same kind: a sentence written from what a change expected, left standing after the change measured something else. Neither is a bug a client could hit — the API answers today exactly what it answered yesterday — so the whole question is which side of the contradiction gives way, and why.

The repository has a rule about this already, in `docs/performance/aggregate-baseline.md`: a claim that measurement overtook is kept with a note saying so, "because deleting it would erase the record of a corrected belief". The specs are not that kind of document. `openspec/specs/` is the contract, read as what runs; a spec that records a belief the code refutes is not a corrected belief, it is a wrong contract.

## Goals / Non-Goals

**Goals:**

- One of the two readings of an equal-bounds period becomes the stated one, and a test pins it that fails under the other.
- The scaling requirement says what the plan says, in the plan's own numbers.
- Every scenario under these two requirements is asserted by something.

**Non-Goals:**

- **No re-measurement.** `filtered-aggregate.md` is reproducible and its numbers are quoted, not refreshed. Re-running k6 or `EXPLAIN (analyze)` today would produce different timings with no better provenance — the same reason `simplify-docs` gave for leaving them alone.
- **No timing assertions.** A suite that fails when a laptop is busy is worse than no suite.
- **Not touching the other five specs**, or the archived changes that produced them.

## Decisions

**Finding 1: the requirement gives way, not `toPeriod`.**

Two resolutions were open. Narrow the sentence to what the code does (a), or special-case `from === to` so the interval stays empty and the bounds echo back unrounded (b). (b) is what `add-dashboard-filters`' design.md plainly intended — "it is a legal empty interval, and it answers an empty aggregate with the period echoed back" — so choosing (a) is choosing against the recorded intent, and needs to be worth it. Four reasons it is:

- **It keeps rounding a rule with no exceptions.** Every consumer of a `Period` is entitled to assume its bounds sit on bucket boundaries. `postgres-repository.ts` says so where it composes the predicate: "Bounds arrive already on bucket boundaries; see `toPeriod`." Under (b) that comment acquires a silent exception, and the one period that reaches SQL off a boundary is the one nobody writes a test for.
- **It keeps the cache-key argument true.** `filtered-aggregate.md` closes on the thing this API bought by rounding at the edge: "the keys a client can produce are hour-aligned pairs rather than millisecond-aligned ones". Under (b) a client can mint unboundedly many distinct keys by sending `from=to=<any instant>`. Each answers empty and none is expensive, but the claim as written stops holding — and reopening a contradiction with that document while this change exists to close another one would be a poor trade.
- **It keeps the answer monotone in the window requested.** Under (b), `from=12:30&to=12:31` counts a whole hour and `from=12:30&to=12:30` counts nothing: shrinking a window by one minute drops the answer from an hour of traffic to zero, at exactly one point, invisibly. Under (a) a wider request never answers less.
- **`period` in the envelope keeps one meaning.** It is documented as "the period the response actually covers". Under (a) it always is. Under (b), for equal bounds alone, it would mean "the period you asked for" — a zero-width window the hourly totals cannot express, handed to a client to render.

What (a) costs, stated rather than hidden: `from=to=12:30` answers an hour of detections for a request whose interval contains no instants. That is surprising, and it is the same surprise `from=12:30&to=12:31` already delivers. The contract has one mechanism for it and this change leans on it — the response states `[12:00, 13:00)`, so the client is told what it got rather than left to assume.

**Finding 2: the requirement is rewritten from the measurement, and the events table is named as the thing a period does *not* narrow.**

The measurement is not in doubt: it is reproducible from the commands at the top of `filtered-aggregate.md`, and re-running the shape of it on a test container reproduced it exactly — one events chunk in the plan out of 57 present, whether or not a period was given. So the requirement is what is wrong, and the correction is not a softening. A period still narrows the work; it narrows a different table than the sentence claimed, and saying which one is the difference between a requirement a reader can check and one that sounds right.

The live tail is added because it is the honest bound on the claim. A requirement titled "responses do not scale with the size of the table" that omits the floor invites the reading that a narrow enough period costs nothing, and the measurement says the three tiers converge on roughly 2 ms rather than on zero.

**The unasserted scenario gets a test, and the test explains the repository's own statement.**

`add-dashboard-filters`' design decided the performance claim would be "measured with `EXPLAIN` against the seeded container rather than asserted". That was right about timings and too broad. Which chunks a plan names is not a timing: it is structural, deterministic on any container, and it is precisely what the requirement claims. The part that stays a measurement is the milliseconds.

`chunk-exclusion.test.ts` builds its plans from the statement `createTrafficRepository` issues, captured through a recording `Database`, rather than from SQL copied into the test. A copied `select` would keep passing after `totalsQuery` stopped composing a bound at all, which is the one regression worth catching here. Chunk names come from `timescaledb_information.chunks` rather than a hardcoded `_hyper_3_` prefix, so the test does not depend on how many hypertables the migrations happened to create first.

Two assertions, and each was broken to prove it discriminates. Forcing `totalsQuery` to drop the `from` bound makes the bounded plan name all seven aggregate chunks instead of one — 7 against 7, the comparison fails. Removing the refresh from the fixture leaves the watermark at `-infinity`, every bucket computed live, and the events table named 57 chunks deep instead of 1. The second is the more valuable of the two: it is what makes the corrected sentence checkable rather than merely written down.

## Risks / Trade-offs

**Narrowing a spec toward its code is how a spec stops being a check on the code.** The guard is that (a) was argued on its merits above and not on its being free — it would have been chosen if the code had said the opposite, and the alternative is spelled out here so a later reader can disagree with the reasoning rather than guess at it. This is also the reason the change is a delta and not an edit to `openspec/specs/`.

**A plan-shape assertion is coupled to a planner.** A TimescaleDB or Postgres upgrade could change which chunks a plan names, and this test would fail on an upgrade that broke nothing a client sees. That is the point: the requirement is about the plan, so a plan that stopped behaving this way is news, and a red test is how it should arrive. The assertions are relative — fewer, and exactly one — rather than pinned to seven, so ordinary variation in chunk counts does not touch them.

**One more container in the suite, about nine seconds.** Deliberate: the alternative was folding the plans into `continuous-aggregate.test.ts`, whose fixture truncates and refreshes between tests and whose subject is freshness. Four hundred days of events for a plan comparison would have made that file about two things.

## Left open

The repository comment defending the composed `where` says a null-guarded predicate "cannot exclude a chunk". The spike run for this change found `where ($1::timestamptz is null or hour >= $1::timestamptz)` producing a plan identical to the composed form — node-pg's first executions are custom-planned, so the parameter is a constant and the guard folds away before the planner sees it. The claim is presumably about generic plans, which a prepared statement reaches after five executions, and it is not what the comment says. Not corrected here: it is a third finding, in a third file, and it needs its own measurement rather than a guess appended to this one.

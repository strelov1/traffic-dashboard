## Context

Every increment so far has added its argument to the README, and each addition was locally correct: a decision that took a measurement to settle should be written down where a reader will find it. The result is that the file now answers "why is the bucket an hour wide" three paragraphs before it finishes answering "how do I start this".

A reviewer's first ten minutes and a reviewer's third hour want different documents. The first wants instructions and a map; the second wants the argument, in full, with the numbers that settled it. One file cannot be both without being long enough that the first reader never reaches the second half.

Two of the claims in that file are also no longer true, which is the more serious problem. A README whose commands work is evidence; a README with a stale number in it invites the reader to check the rest, and they are right to.

## Goals / Non-Goals

**Goals:**

- A README a reviewer can read start to finish, keeping what this is, how to run it, the endpoints, the architecture, the scaling answer and the freshness bound. Roughly 140 lines is the target; where the two conflict, the six things above win and the count is reported rather than met.
- Every paragraph removed from the README exists somewhere in `docs/`, reachable from the sentence that replaced it.
- The storage decision readable on its own, without the README around it.
- A diagram that shows the one thing the design rests on: an aggregate read is a sum of materialised hours plus a live scan of the current one.
- Every claim that survives is executed before it ships.

**Non-Goals:**

- No behaviour change, no source change. If this change needs one, it has gone wrong.
- No re-measurement. The performance numbers were taken under conditions the docs state; re-running them on a different day would produce different numbers with no better provenance, and the argument does not turn on the third significant figure.
- No edit to the ARCHIVED changes. They carry decisions later measured to be wrong — the daily bucket most of all — and correcting them would delete the record this project is partly about.
- No documentation framework, no `docs/` index page, no link checker. Four files linked from one README do not need infrastructure.

## Decisions

**What stays in the README is what a reader needs before they can form a question.** Instructions, the endpoint table, the shape of the system, the headline numbers, and the bound on freshness — because a dashboard that can be silently behind is something a reader must be told without having to ask. What leaves is everything that answers a question the reader has already had: why `text` rather than `char(2)`, why bars rather than a pie, why the URL holds the filter. Each of those keeps one summary sentence in the README with the link on it, so the argument is discoverable rather than merely archived.

**Three destinations, split by the question they answer, not by size.**

- `docs/adr/0001-timescaledb.md` — why the data is stored and read the way it is. This one decision is the load-bearing one: it is what the "5 to 50 to 500 RPS" question was actually answered with, and it is the first thing a reviewer will interrogate. An ADR is the form that survives being read cold, and numbering it 0001 states that more are expected without creating them.
- `docs/architecture.md` — the data model, the API contract, and the dashboard. Decisions that are individually small and collectively the reason the code looks the way it does.
- `docs/deployment.md` — provisioning and releases. Operational, and read by a different person on a different day.

A single `docs/design.md` would have been one file to link, and would have recreated the problem one level down.

**The diagram is Mermaid, and it draws the union rather than the database.** GitHub renders Mermaid in place, so the diagram stays text a diff can show and a reviewer can correct — the reason the ASCII block was there in the first place. What the ASCII block could not show is the part worth showing: `traffic_hourly_totals` is not a table the API reads, it is a union of materialised hours below the watermark with a live scan of everything above it. Every number in the scaling section — the 4.4 ms, the 82 ms that killed the daily bucket, the freshness guarantee — follows from that split, so the diagram names both sides and the refresh policy that moves the line between them.

**The spec correction is a rename plus a modification, and both are needed.** "Daily totals are maintained continuously" is wrong in its title and in its body: totals over a period are derived by summing the hours it covers, not the days. `RENAMED` alone would leave the body claiming days; `MODIFIED` alone would leave a requirement whose name contradicts its text. The delta carries both, and the requirement's substance — a maintained aggregate rather than a per-request count — is unchanged, which is why this is a correction and not a new decision.

**The baseline measurement is relabelled, not deleted or re-run.** `aggregate-baseline.md` measured `postgres:17-alpine` with only migration 0001 applied, at commit `a60ccfa`, and that is exactly what makes it useful: it is the evidence for the ADR's context, the "before" the whole decision argues from. Naming the commit and the migration state turns a stale environment line into a dated one, which is what a baseline is.

**`AGENTS.md` is filled rather than trimmed.** The four `_TBD_` headings were placed when the stack was undecided; the stack has been decided for weeks. An agent opening that file needs the layout and the dependency rule more than it needs the working principles, so deleting the headings would be the cheaper fix and the wrong one.

**No test is added, and this is where a documentation change has to be honest.** The discipline this repository holds is that an assertion must be able to fail. A test that read the README and compared a number to something would be asserting against a copy, and the two copies that matter here — the endpoint table and the curl output — cannot be checked by a unit test without rebuilding the request path a test already exercises. What this change can do instead is execute every claim: bring the stack up from an empty volume, run each command as written, and compare each printed output byte for byte. That is recorded in `tasks.md` as the verification, and it caught the test count being 298 rather than 164.

## Risks / Trade-offs

**Relocation can become deletion by accident.** The mitigation is mechanical rather than careful: the old README is diffed against the new one plus the three new documents, and every paragraph is accounted for as kept, moved, or deliberately dropped as redundant with a neighbour.

**A link is a thing that can rot, and there are now a dozen between these files.** Accepted deliberately over one long file. The links are relative paths inside this repository, so a rename that breaks one breaks it visibly on GitHub, and there is no link checker because four files do not justify one.

**Numbers now live in two places — the README's summary table and the document it links.** The README keeps only the figures the argument turns on (the 78 % failure, the 4.4 ms, the ceiling) and every other number stays in `docs/performance` alone. A summary that restated the whole table would be the next thing to drift, which is the defect this change exists to remove.

**The ADR states a decision that a later measurement could overturn**, which is precisely what happened to the daily bucket. The Consequences section therefore names what would have to change for the decision to be revisited — the live tail growing with the write rate — rather than presenting the current bucket width as settled.

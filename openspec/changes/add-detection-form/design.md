## Context

`POST /api/traffic/events` has existed since `add-traffic-ingest`: schema-validated, integration-tested against a real database, and reachable only by `curl`. The dashboard reads two aggregates and never writes.

The read side has already grown everything a write needs. `useAsync` returns a `reload` because a failed chart had to be recoverable in place, and it re-runs on a key because the filters had to change what a chart asks for. "Both charts re-read after a detection is recorded" is therefore a call, not a mechanism to build.

What is genuinely new is a form, and a form is the one place on this page where labelling, error association and focus management decide whether the page is usable at all rather than merely tidy.

## Goals / Non-Goals

**Goals:**

- One detection recorded from the page, with both charts and the headline showing the new number without a reload.
- The API's own rejection is what the reader sees, in the API's own words.
- The vehicle-type options and the set the API accepts cannot drift apart without a test failing.
- The form is operable by keyboard and screen reader: controls tied to labels, a refusal associated with the field it is about, focus moved to the outcome, the outcome announced.
- The unauthenticated write is stated where someone using it will read it.

**Non-Goals:**

- No API change. No new route, no schema change, no response change. If this change needs one, it has gone wrong.
- No correction or removal from the page. `PATCH` and `DELETE` address a row by id, and a chart of totals never shows one; reaching them would mean a table of events, which is a different page with a different argument behind it.
- No optimistic update. The number the page shows keeps coming from the aggregate, which is the only way the form demonstrates anything.
- No batch control. The endpoint takes a list; the form sends a list of one, because the thing being demonstrated is that a detection moves a chart.

## Decisions

**The plate country is typed, and nothing on this side checks it.**

The two controls are deliberately asymmetric. The vehicle type is chosen from a list, so it cannot be wrong; the country is free text with no `pattern`, no `required`, and no parse before the request, so it can be.

That is the point. The proposal asks for the API's rejection to be visible, and a field that refuses to submit `Oman` can never show it. Mirroring `^[A-Z]{2}$` in the browser would also put a fourth copy of that rule beside the database's `CHECK`, the request schema and `filters.ts` — and the copy that fires first would be the one nobody could see failing.

The API stays the authority either way. The cost is one round trip to learn what a regular expression could have said locally, on a form a human submits by hand.

**The vehicle-type list is copied into `web/`, and a test fails when the copy drifts.**

The web package cannot import `api/src/traffic/domain/vehicle-type.ts`: separate workspaces, and that module is server code. Three ways to keep one list:

- A shared workspace package. A build target, a `package.json` and a tsconfig for a frozen array of six strings.
- An endpoint publishing the enum. The proposal says the API does not change, and this would spend a request at runtime learning something fixed at build time.
- Duplicate the list where the client needs it, and assert in a test that it still equals the API's.

The third. `styles.test.ts` already reads `styles.css` rather than a copy of its values, on the same reasoning: the assertion is about what ships. The drift test reads the domain module's source and compares the two lists, so adding a class to the API fails CI at the moment it is added — which is when the drift is cheap to fix, and the only moment it matters.

**No instant control.** `toEvent` defaults `occurredAt` to the server's clock, and the current hour is never materialised — it is scanned live — so a detection recorded now is counted by the next read. A control that let the reader date a detection to last March would answer `201` and change nothing on screen, which is precisely the failure this change exists to avoid.

**Re-reading is the existing `reload`, called twice.** Both charts re-run their loader, the headline follows the country aggregate it is derived from, and no new state is introduced. `useAsync` already drops a superseded run, so a re-read that overlaps a filter change cannot overwrite the newer one.

**Focus moves on a failure; a success is announced where the reader already is.**

The outcome is one region, mounted from the first render — a live region added to the DOM at the same moment as its text is not reliably announced — carrying `role="status"` and `tabIndex={-1}`.

- Refused: focus moves to the region. A message that only sat there would be silent for a screen-reader user and invisible to a magnified one, whose viewport is on the submit button.
- Recorded: focus stays on the button and the live region announces it. Moving focus would make recording a second detection cost a journey back through the form, and there is nothing to correct.

Focus is moved from an effect that depends on the outcome, not inline after `await`. The outcome is a fresh object per submission, so two identical refusals in a row each move focus, and the effect runs after the region's text has been committed rather than before.

**Only a refusal marks the field.** The client throws `DetectionRejected` for a `4xx` carrying the API's own message, and an ordinary `Error` otherwise. The line is the status, not the presence of a message: a `500` answers `{"error":"Internal Server Error"}` too, and that is the API declining to explain itself rather than a verdict on the request. `aria-invalid` and `aria-describedby` are attached to the country input for a refusal only.

A request that never completed says so in the same region, but leaves the field alone: nothing about the value is known then, and marking it invalid would be a guess rendered as a fact. The country is also the only field a refusal can be about — the vehicle type comes from the set the API accepts — which is what makes associating the message with that input honest rather than a convenient place to hang it.

**A submission in flight is ignored rather than disabling the button.** Disabling the control that currently has focus drops focus to `body`, so a keyboard reader is returned to the top of the page for having pressed Enter. The handler returns early instead, and the region says the detection is being recorded.

**The write is the first request this dashboard makes that a browser preflights.** `content-type: application/json` is not a simple request, so a `POST` from the page asks `OPTIONS` first — a path the two reads never took. Nothing in the API changes for it (`@fastify/cors` already answers the preflight and reflects the requested header), but nothing asserted it either, and a `CORS` configuration that tightened `allowedHeaders` would break the write with no test to say so. `cors.test.ts` gains that assertion. It is green on the first run, which is stated here rather than dressed up as a red test: it exists because a new caller now depends on it.

**The form sits inside `main`, below the grid rather than in it.** The grid is `auto-fit`; a third child would resolve to three tracks at the desktop width and shrink both charts at exactly the size where they read best.

## Risks / Trade-offs

**A write control on an unauthenticated endpoint.** This is the trade the proposal names, and the change does not soften it: the note sits at the button, not only in the README. A demonstration that hid the hole would be worse than the hole. Anything real needs the endpoint authenticated before it needs this form.

**The rejection is a JSON pointer into a batch the reader did not know they sent.** `body/events/0/plateCountry must match pattern "^[A-Z]{2}$"` is not a sentence written for a person. Replacing it with a friendlier one would hide the layer this change exists to expose, and would then have to be kept in step with a schema it no longer quotes. For this audience the pointer is the evidence, so it ships verbatim.

**With a country chosen, recording a different country moves nothing the reader is watching.** Correct rather than broken: the vehicle-type chart is narrowed to the country they picked, and the headline counts that country. The by-country chart still gains the bar. Pre-filling the form from the filter would fix the appearance by tying a write control to a read filter, so that narrowing a chart silently changed what the next submission records — a worse trade than the confusion it removes.

**The drift test reaches into another package's source.** Moving or renaming `domain/vehicle-type.ts` fails a web test, which is a coupling with a cost. The message names the file so the failure explains itself, and it is the cheaper half of the trade: the alternative is that the API grows a vehicle class and the dashboard silently keeps offering five.

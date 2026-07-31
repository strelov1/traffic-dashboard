## 1. The write client

- [x] 1.1 RED: `recordDetection` posts one detection as a batch of one to `/api/traffic/events`, resolves on `201`, throws the API's own message on a refusal, and throws something distinguishable when there is no verdict to show.
- [x] 1.2 RED: `VEHICLE_TYPES` in the web client equals the set `api/src/traffic/domain/vehicle-type.ts` declares. Read that file rather than a copy of its values, the way `styles.test.ts` reads the stylesheet. Prove it discriminates by dropping a class from one side.
- [x] 1.3 Implement `recordDetection` and `DetectionRejected` beside the two read functions, and the vehicle-type list with a note at it saying where the other copy lives.
- [x] 1.4 GREEN. Prove each assertion discriminates: send an instant, drop the response parse, call a 500 a refusal, and watch the matching test fail.

## 2. The form

- [x] 2.1 RED: submitting sends the chosen country and type; the vehicle-type control offers exactly `VEHICLE_TYPES`; both controls are found by their visible label.
- [x] 2.2 RED, accessibility: a refusal shows the API's message, associates it with the plate-country input through `aria-describedby`, marks that input invalid, and leaves focus on the message. A transport failure reports itself in the same region and leaves `aria-invalid` off. A success is announced by the live region with focus still on the button. Each of these must fail with the attribute removed — an `aria-describedby` test that passes without the attribute is the kind this codebase was audited for.
- [x] 2.3 RED: a second submit while one is in flight sends one detection, not two.
- [x] 2.4 Build `components/DetectionForm.tsx`: `record` and `onRecorded` as props, matching how the loaders are injected. The outcome region is mounted from the first render, and focus moves from an effect on the outcome so the message is committed before it is focused.
- [x] 2.5 GREEN. Break the focus move, drop each ARIA attribute, uppercase the country, invent a message in place of the API's, and remove the in-flight guard — each breaks the test that guards it and nothing else.

## 3. On the page

- [x] 3.1 RED: recording re-reads both aggregates and the headline moves; a refused detection re-reads neither.
- [x] 3.2 Wire the form into `App` below the grid, and compose `recordDetection` in `main.tsx` beside the loaders.
- [x] 3.3 State at the form that the write path is unauthenticated, with a test that the page says so.
- [x] 3.4 Style the form to the existing tokens, and put `--failed` under the AA check in `styles.test.ts` — it is text, and the refusal is now the second place it is drawn. Prove the new check has teeth by lightening the token.
- [x] 3.5 GREEN, whole web suite. Break the re-read and watch both page-level tests fail.

## 4. The request the browser actually sends

- [x] 4.1 `content-type: application/json` makes the write the first preflighted request this dashboard sends. Assert in `cors.test.ts` that the preflight for `POST /api/traffic/events` is answered and allows the header. It passes on the first run — say so rather than dressing it as a RED — and prove it discriminates by narrowing `allowedHeaders`.

## 5. Say what shipped

- [x] 5.1 README: the dashboard now writes as well as reads. Say what the form sends, that the reader sees the API's own rejection, and that the endpoint behind the button is unauthenticated — the section that already admits it should point at the button.
- [x] 5.2 Correct the test count in the README, which the last two changes left behind, to the number this change ends with.

## 6. Verify

- [x] 6.1 `pnpm verify` — lint, typecheck, whole suite green. Report the new test count.
- [x] 6.2 Drive the stack by hand: record a detection and watch the headline and both charts move; submit a country the API refuses and read its message; tab through the form with the pointer unused.

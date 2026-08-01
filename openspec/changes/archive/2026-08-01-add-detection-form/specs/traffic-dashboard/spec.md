## ADDED Requirements

### Requirement: The reader can record a detection from the dashboard

The dashboard SHALL offer a form of a plate country, a vehicle type and a submit control, which records exactly one detection through the ingest endpoint the API already publishes.

The vehicle-type options SHALL be the set the API accepts, and a test SHALL fail if the two ever differ — a control offering a class the API refuses, or omitting one it added, is a defect the page cannot show by itself.

No instant is sent. A detection recorded now falls in the hour that is served live, so it is counted by the next read; a detection dated into the past would be recorded successfully and change nothing on screen.

#### Scenario: A detection is recorded

- **WHEN** the reader chooses a country and a vehicle type and submits
- **THEN** one detection with those values is sent to the ingest endpoint

#### Scenario: The recorded detection shows up in the figures

- **WHEN** a detection is recorded
- **THEN** both charts and the headline re-read their aggregates, rather than the page reporting a success over unchanged numbers

#### Scenario: The vehicle-type options match the API

- **WHEN** the vehicle-type control is rendered
- **THEN** its options are exactly the vehicle classes the API accepts

### Requirement: A refused detection is reported in the API's own words

The form SHALL NOT validate the plate country before sending it. A value the API refuses SHALL be sent, and the message the API answered with SHALL be shown unaltered, so that a reader sees the validation layer stating its own rule rather than a sentence the page invented.

A request that never received an answer SHALL be reported in the same place, distinguished from a refusal in that nothing is claimed about the value the reader typed.

#### Scenario: The API refuses the plate country

- **WHEN** the reader submits a plate country that is not an ISO alpha-2 code
- **THEN** the request is sent, and the API's own message naming the field and the pattern is shown

#### Scenario: A refusal leaves the figures alone

- **WHEN** a detection is refused
- **THEN** neither chart is re-read, and no success is reported

#### Scenario: The API cannot be reached

- **WHEN** the request fails without an answer from the API
- **THEN** the form reports the failure and does not mark the reader's value as invalid

### Requirement: The form is operable and its outcome is announced

Both controls SHALL be tied to visible labels. The outcome of a submission SHALL be announced without the reader having to go looking for it: a refusal SHALL be associated with the field it is about through `aria-describedby`, and focus SHALL move to the message; a success SHALL be announced through a live region while focus stays where the reader left it, so that a second detection costs one keystroke.

Only a refusal from the API SHALL mark a control invalid. A submission already in flight SHALL be ignored rather than disabling the focused control, which would drop focus to the top of the page.

#### Scenario: The controls are labelled

- **WHEN** the form is rendered
- **THEN** the country and vehicle-type controls are each reachable by their visible label

#### Scenario: A refusal reaches the reader

- **WHEN** a detection is refused
- **THEN** the message is associated with the plate-country field, that field is marked invalid, and focus is on the message

#### Scenario: A success is announced in place

- **WHEN** a detection is recorded
- **THEN** the outcome is announced by a live region and focus stays on the submit control

#### Scenario: Submitted twice in a row

- **WHEN** the reader submits again while a submission is still in flight
- **THEN** only one detection is sent

### Requirement: The page states that recording is unauthenticated

The dashboard SHALL state, at the form, that anyone who can reach the API can record a detection. The README says so about the deployment; a button on the page makes it something a reader meets rather than something they have to be told.

#### Scenario: The trade is visible where it is taken

- **WHEN** the form is rendered
- **THEN** it states that the write path is unauthenticated

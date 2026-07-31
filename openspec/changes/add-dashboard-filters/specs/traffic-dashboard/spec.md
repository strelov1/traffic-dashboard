## ADDED Requirements

### Requirement: The reader can narrow the dashboard to a period

The dashboard SHALL offer a period control covering the last day, the last week, the last month, and all time, with all time as the default. Choosing a period SHALL re-read both aggregates for it.

The periods offered are relative to the present rather than a pair of instants the reader picks. A traffic dashboard is asked "what has been happening lately", and a date picker would produce arbitrary bounds that the API rounds to the hour regardless.

#### Scenario: A period is chosen

- **WHEN** the reader chooses the last week
- **THEN** both charts re-read their aggregate for that period, and both show the totals for it

#### Scenario: No period is chosen

- **WHEN** the dashboard is opened without a period
- **THEN** both charts show all recorded traffic, and the control reads as all time

### Requirement: The reader can narrow the vehicle-type chart to one plate country

The dashboard SHALL offer a country control listing the countries present in the current period, plus an option for all countries. Choosing one SHALL narrow the vehicle-type chart to that country.

The country chart SHALL NOT be narrowed by it, and SHALL NOT be re-read when only the country changes: a chart of every country reduced to one country is a single bar, which answers a different question and would cost a request to render the same picture.

#### Scenario: A country is chosen

- **WHEN** the reader chooses a country
- **THEN** the vehicle-type chart shows only that country's traffic, and the country chart is unchanged

#### Scenario: The country chart is not re-read for a country

- **WHEN** the reader changes only the country
- **THEN** the by-country aggregate is not requested again

#### Scenario: A country with no traffic in the period

- **WHEN** the chosen country has no detections in the chosen period
- **THEN** the vehicle-type chart states that no traffic is recorded, rather than reporting a failure

### Requirement: The controls' state lives in the URL

The chosen period and country SHALL be reflected in the page's query string, and SHALL be read back from it on load, so that a filtered view can be linked, bookmarked and shared. Navigating back SHALL restore the previous selection rather than leaving the URL and the controls disagreeing.

The period is carried as the reader's choice — the last week — rather than as the instants it resolves to, so a link opened tomorrow answers the question that was shared rather than repeating yesterday's window.

A query string that cannot be understood SHALL fall back to the default selection rather than render an error, and the controls SHALL then show what is actually in effect.

#### Scenario: A selection is linked

- **WHEN** the reader chooses a period and a country
- **THEN** the query string carries both, and opening that URL again reproduces the same view

#### Scenario: The reader navigates back

- **WHEN** the reader changes a control and then goes back
- **THEN** the controls and both charts return to the previous selection

#### Scenario: An unreadable query string

- **WHEN** the dashboard is opened with a period value it does not offer
- **THEN** it shows the default selection rather than an error

## MODIFIED Requirements

### Requirement: A headline total leads the page

The dashboard SHALL show the total number of recorded events above the charts, derived from the data already fetched rather than from an additional request.

The headline SHALL follow the controls beside it. With a period chosen it counts that period; with a country chosen it counts that country, taken from the country aggregate already on hand rather than from a further request. The filter in effect SHALL be stated next to the number, so the figure is never shown without its scope — a total that silently ignored the controls would be a claim the reader has no way to check.

#### Scenario: Total reflects the aggregate

- **WHEN** country totals of 3 and 1 are returned
- **THEN** the headline total reads 4

#### Scenario: Total follows the country

- **WHEN** country totals of 3 and 1 are returned and the reader chooses the country with 1
- **THEN** the headline total reads 1

#### Scenario: The scope is stated

- **WHEN** a period or a country is in effect
- **THEN** the headline names it alongside the number

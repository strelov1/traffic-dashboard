import { useEffect, useRef, useState } from 'react'

import { DetectionRejected, VEHICLE_TYPES, type Detection, type VehicleType } from '../api/traffic'

type Props = {
  record: (detection: Detection) => Promise<void>
  /** Called once the API confirms the write, so the page can re-read. */
  onRecorded: () => void
}

type Outcome =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'recorded'; detection: Detection }
  /** `refused` is the API's verdict on the value; anything else is not. */
  | { status: 'failed'; reason: string; refused: boolean }

const MESSAGE_ID = 'detection-outcome'

/**
 * Records one detection through the endpoint the API already publishes, and
 * tells the page to re-read when it lands. The point is the number moving: a
 * form that reported success over unchanged charts would demonstrate less than
 * `curl` does.
 *
 * The two controls are deliberately asymmetric. The vehicle type is picked from
 * the set the API accepts, so it cannot be refused; the country is free text
 * that nothing here checks, so it can — and the refusal the reader then sees is
 * the API's own words about its own rule, which is the thing worth showing.
 */
export function DetectionForm({ record, onRecorded }: Props) {
  const [plateCountry, setPlateCountry] = useState('')
  const [vehicleType, setVehicleType] = useState<VehicleType>('car')
  const [outcome, setOutcome] = useState<Outcome>({ status: 'idle' })
  const messageRef = useRef<HTMLParagraphElement>(null)

  // Focus is moved from an effect rather than after the await, so the message
  // is committed before it is focused. The outcome is a fresh object per
  // submission, so a second identical refusal moves focus again — which is the
  // only report a live region whose text has not changed can give.
  useEffect(() => {
    if (outcome.status === 'failed') {
      messageRef.current?.focus()
    }
  }, [outcome])

  async function submit(): Promise<void> {
    // Ignored rather than disabling the button: disabling the control that has
    // focus drops the reader back to the top of the page for pressing Enter.
    if (outcome.status === 'submitting') {
      return
    }

    const detection = { plateCountry, vehicleType }

    setOutcome({ status: 'submitting' })

    try {
      await record(detection)
      setOutcome({ status: 'recorded', detection })
      onRecorded()
    } catch (error: unknown) {
      setOutcome({
        status: 'failed',
        reason: error instanceof Error ? error.message : 'unknown',
        refused: error instanceof DetectionRejected,
      })
    }
  }

  const refused = outcome.status === 'failed' && outcome.refused

  return (
    <section className="panel form" aria-labelledby="record-heading">
      <h2 id="record-heading">Record a detection</h2>

      <form
        className="form__controls"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        <div className="control">
          <label className="control__label" htmlFor="plate-country">
            Plate country
          </label>
          <input
            id="plate-country"
            className="control__input control__input--text"
            value={plateCountry}
            onChange={(event) => {
              setPlateCountry(event.target.value)
            }}
            // Only the API's verdict marks the field. A request that never got
            // an answer says nothing about what the reader typed, and claiming
            // otherwise would be a guess rendered as a fact.
            aria-invalid={refused}
            aria-describedby={refused ? MESSAGE_ID : undefined}
          />
        </div>

        <div className="control">
          <label className="control__label" htmlFor="vehicle-type">
            Vehicle type
          </label>
          <select
            id="vehicle-type"
            className="control__input"
            value={vehicleType}
            onChange={(event) => {
              setVehicleType(event.target.value as VehicleType)
            }}
          >
            {VEHICLE_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>

        <button type="submit" className="form__submit">
          Record
        </button>
      </form>

      {/* Mounted from the first render, empty until there is something to say:
          a live region that appears at the same moment as its text is not
          reliably announced. */}
      <p
        id={MESSAGE_ID}
        ref={messageRef}
        tabIndex={-1}
        role="status"
        className={`form__message${outcome.status === 'failed' ? ' form__message--failed' : ''}`}
      >
        {describe(outcome)}
      </p>

      <p className="form__note">
        Anyone who can reach the API can record a detection: this write path is
        unauthenticated. Acceptable for a demonstration, and the first thing a
        deployment would have to close.
      </p>
    </section>
  )
}

function describe(outcome: Outcome): string {
  switch (outcome.status) {
    case 'idle':
      return ''
    case 'submitting':
      return 'Recording…'
    case 'recorded':
      return `Recorded one ${outcome.detection.plateCountry} ${outcome.detection.vehicleType}.`
    case 'failed':
      // The refusal is quoted, never rewritten. It names the field and the rule
      // the API enforces, and a friendlier sentence would hide the layer this
      // form exists to show — and would drift from the schema it paraphrased.
      return outcome.refused
        ? `Refused: ${outcome.reason}`
        : `Could not record this detection: ${outcome.reason}`
  }
}

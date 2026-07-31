import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { DetectionForm } from './DetectionForm'
import { DetectionRejected, VEHICLE_TYPES, type Detection } from '../api/traffic'

const REFUSAL = 'body/events/0/plateCountry must match pattern "^[A-Z]{2}$"'

const countryField = () => screen.getByLabelText('Plate country')
const vehicleTypeField = () => screen.getByLabelText('Vehicle type')
const submit = () => screen.getByRole('button', { name: /record/i })
const message = () => screen.getByRole('status')

const recorded = () => Promise.resolve()
const refusing = () => Promise.reject(new DetectionRejected(REFUSAL))
const unreachable = () => Promise.reject(new Error('/api/traffic/events answered 500'))

function fill(plateCountry: string, vehicleType?: string) {
  fireEvent.change(countryField(), { target: { value: plateCountry } })

  if (vehicleType !== undefined) {
    fireEvent.change(vehicleTypeField(), { target: { value: vehicleType } })
  }
}

describe('DetectionForm', () => {
  it('labels both controls', () => {
    render(<DetectionForm record={recorded} onRecorded={vi.fn()} />)

    expect(countryField()).toBeInTheDocument()
    expect(vehicleTypeField()).toBeInTheDocument()
  })

  it('offers exactly the vehicle classes the API accepts', () => {
    render(<DetectionForm record={recorded} onRecorded={vi.fn()} />)

    expect([...vehicleTypeField().querySelectorAll('option')].map((option) => option.value)).toEqual(
      [...VEHICLE_TYPES],
    )
  })

  it('records the detection the reader chose', async () => {
    const record = vi.fn<(detection: Detection) => Promise<void>>().mockResolvedValue(undefined)
    const onRecorded = vi.fn()

    render(<DetectionForm record={record} onRecorded={onRecorded} />)
    fill('SA', 'truck')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(record).toHaveBeenCalledWith({ plateCountry: 'SA', vehicleType: 'truck' })
    })
    expect(onRecorded).toHaveBeenCalledTimes(1)
  })

  it('sends the country exactly as typed, leaving the verdict to the API', async () => {
    // Nothing here trims, uppercases or refuses it. A field that could not
    // submit `Oman` could never show the API refusing `Oman`, which is the one
    // thing this form demonstrates that `curl` does not.
    const record = vi.fn<(detection: Detection) => Promise<void>>().mockRejectedValue(
      new DetectionRejected(REFUSAL),
    )

    render(<DetectionForm record={record} onRecorded={vi.fn()} />)
    fill('Oman')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(record).toHaveBeenCalledWith({ plateCountry: 'Oman', vehicleType: 'car' })
    })
  })

  it('shows the API refusal word for word', async () => {
    render(<DetectionForm record={refusing} onRecorded={vi.fn()} />)
    fill('Oman')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveTextContent(REFUSAL, { normalizeWhitespace: false })
    })
  })

  it('associates the refusal with the field it is about, and marks that field', async () => {
    render(<DetectionForm record={refusing} onRecorded={vi.fn()} />)
    fill('Oman')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(countryField()).toHaveAccessibleDescription(`Refused: ${REFUSAL}`)
    })
    expect(countryField()).toHaveAttribute('aria-invalid', 'true')
  })

  it('moves focus to the refusal, so it is not only announced to the sighted', async () => {
    render(<DetectionForm record={refusing} onRecorded={vi.fn()} />)
    fill('Oman')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveFocus()
    })
  })

  it('moves focus again when the same refusal comes back a second time', async () => {
    render(<DetectionForm record={refusing} onRecorded={vi.fn()} />)
    fill('Oman')
    fireEvent.click(submit())
    await waitFor(() => {
      expect(message()).toHaveFocus()
    })

    // A reader who fixed nothing and submitted again gets the same words, and
    // an unchanged live region says nothing. Focus is what reports it.
    countryField().focus()
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveFocus()
    })
  })

  it('does not tell the page to re-read a detection that was refused', async () => {
    const onRecorded = vi.fn()

    render(<DetectionForm record={refusing} onRecorded={onRecorded} />)
    fill('Oman')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveTextContent(REFUSAL, { normalizeWhitespace: false })
    })
    expect(onRecorded).not.toHaveBeenCalled()
  })

  it('reports a failure the API did not explain without calling the value invalid', async () => {
    render(<DetectionForm record={unreachable} onRecorded={vi.fn()} />)
    fill('AE')
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveTextContent(/answered 500/)
    })
    // Nothing is known about what they typed, so nothing is claimed about it.
    expect(countryField()).not.toHaveAttribute('aria-invalid', 'true')
    expect(countryField()).not.toHaveAccessibleDescription()
  })

  it('announces a recorded detection without taking focus off the submit control', async () => {
    render(<DetectionForm record={recorded} onRecorded={vi.fn()} />)
    fill('AE', 'bus')
    // Focused first, as a keyboard reader submitting with Enter would leave it.
    submit().focus()
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveTextContent(/recorded/i)
    })
    // Announced by the live region rather than by a jump: there is nothing to
    // correct, and a second detection should cost one keystroke.
    expect(submit()).toHaveFocus()
  })

  it('sends one detection when the reader submits twice in a row', async () => {
    const record = vi.fn<(detection: Detection) => Promise<void>>(
      () => new Promise<void>(() => undefined),
    )

    render(<DetectionForm record={record} onRecorded={vi.fn()} />)
    fill('AE')
    fireEvent.click(submit())
    fireEvent.click(submit())

    await waitFor(() => {
      expect(message()).toHaveTextContent(/recording/i)
    })
    expect(record).toHaveBeenCalledTimes(1)
  })

  it('states that the write path is unauthenticated', () => {
    render(<DetectionForm record={recorded} onRecorded={vi.fn()} />)

    expect(screen.getByText(/unauthenticated/i)).toBeInTheDocument()
  })
})

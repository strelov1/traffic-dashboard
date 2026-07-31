import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Reads the stylesheet rather than a copy of its values, so the assertion is
 * about what ships. The README and the dashboard spec both claim each scheme's
 * colours were checked against that scheme's own surfaces; this is that check,
 * in a form that fails when it stops being true.
 */
const STYLES = readFileSync(resolve(process.cwd(), 'src/styles.css'), 'utf8')

/** The `:root` block holds light, the `prefers-color-scheme: dark` block holds dark. */
function scheme(name: 'light' | 'dark'): Record<string, string> {
  const blocks = STYLES.split('@media (prefers-color-scheme: dark)')
  const source = name === 'light' ? blocks[0] : blocks[1]
  const tokens: Record<string, string> = {}

  for (const [, token, value] of (source ?? '').matchAll(/(--[\w-]+):\s*(#[0-9a-fA-F]{6})/g)) {
    if (token !== undefined && value !== undefined) {
      tokens[token] = value
    }
  }

  return tokens
}

function relativeLuminance(hex: string): number {
  const channels = [1, 3, 5].map((at) => {
    const channel = parseInt(hex.slice(at, at + 2), 16) / 255

    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4
  })

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0)
}

function contrast(a: string, b: string): number {
  const [lighter, darker] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x)

  return ((lighter ?? 0) + 0.05) / ((darker ?? 0) + 0.05)
}

// Every token drawn as text, against every surface it can sit on. --ink-muted is
// the one that was wrong: it colours the h1, the Source link and the empty-state
// copy, and at 4.31:1 it inherited the bars' 3:1 threshold rather than text's.
const TEXT_TOKENS = ['--ink-primary', '--ink-secondary', '--ink-muted'] as const
const SURFACES = ['--page', '--surface-1'] as const

describe.each(['light', 'dark'] as const)('%s scheme', (name) => {
  const tokens = scheme(name)

  it.each(TEXT_TOKENS.flatMap((ink) => SURFACES.map((surface) => [ink, surface] as const)))(
    '%s meets WCAG AA on %s',
    (ink, surface) => {
      const inkValue = tokens[ink]
      const surfaceValue = tokens[surface]

      expect(inkValue, `${ink} is missing from the ${name} scheme`).toBeDefined()
      expect(surfaceValue, `${surface} is missing from the ${name} scheme`).toBeDefined()
      expect(contrast(inkValue ?? '', surfaceValue ?? '')).toBeGreaterThanOrEqual(4.5)
    },
  )
})

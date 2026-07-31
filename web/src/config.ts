// Vite types every VITE_* variable as `any`, so this is checked rather than
// asserted. Baked in at build time: the image is origin-specific.
const configured: unknown = import.meta.env['VITE_API_ORIGIN']

export const API_ORIGIN: string =
  typeof configured === 'string' && configured.trim() !== ''
    ? configured.trim()
    : 'http://localhost:3000'

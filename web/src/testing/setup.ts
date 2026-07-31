import '@testing-library/jest-dom/vitest'

import { cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

// Testing Library only registers this itself when Vitest runs with globals on.
afterEach(cleanup)

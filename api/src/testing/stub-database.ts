import type { Database } from '../platform/database.js'

/**
 * A Database that answers reachability from a caller-controlled predicate. Real
 * connection handling is covered against Postgres in platform/database.test.ts; suites using
 * this one are about what the routes do with the answer.
 */
export function stubDatabase(isReachable: () => boolean = () => true): Database {
  return {
    query: () => Promise.reject(new Error('stub database: query is not available')),
    isReachable: () => Promise.resolve(isReachable()),
    close: () => Promise.resolve(),
  }
}

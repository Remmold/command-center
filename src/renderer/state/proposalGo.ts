export type GoResult = { ran: false } | { ran: true; error: string | null }

/** Wraps a start so a press while one with the same name is still starting does nothing: one Go makes one feature. */
export function onePerName<R extends { name: string }>(start: (request: R) => Promise<string | null>): (request: R) => Promise<GoResult> {
  const starting = new Set<string>()
  return async (request) => {
    const key = request.name.toLowerCase()
    if (starting.has(key)) return { ran: false }
    starting.add(key)
    try {
      return { ran: true, error: await start(request) }
    } finally {
      starting.delete(key)
    }
  }
}

import { useSyncExternalStore } from 'react'
import { MINUTE_MS } from '../state/nowBuilding'

let now = Date.now()
const listeners = new Set<() => void>()

setInterval(() => {
  now = Date.now()
  for (const l of listeners) l()
}, MINUTE_MS)

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** The time, ticking once a minute on one timer shared by every caller. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, () => now)
}

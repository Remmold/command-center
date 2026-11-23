export interface Pace {
  /** Usage outruns the time passed in the window. */
  ahead: boolean
  /** Percentage points ahead; 0 when on track. */
  by: number
  text: string
}

/** The share (0-1) of the window that has passed, or null without a reset time. */
export function elapsedShare(resetsAt: number | null, windowMs: number, now: number): number | null {
  if (resetsAt === null) return null
  const share = 1 - (resetsAt - now) / windowMs
  return Math.min(1, Math.max(0, share))
}

export function pace(usedPercent: number, elapsedPercent: number): Pace {
  const by = Math.round(usedPercent - elapsedPercent)
  return by > 0 ? { ahead: true, by, text: `ahead of pace by ${by}%` } : { ahead: false, by: 0, text: 'on track' }
}

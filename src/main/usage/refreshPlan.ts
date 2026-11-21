export interface RefreshPlanOptions {
  pollMs: number
  debounceMs: number
}

interface Slot {
  pollAt: number
  /** Set by a turn result or a Refresh; cleared when a fetch starts. */
  soonAt: number | null
  inFlight: boolean
}

/** Decides when each profile's usage is fetched; holds no timers, so the caller drives it with a clock. */
export class RefreshPlan {
  private readonly slots = new Map<string, Slot>()

  constructor(private readonly options: RefreshPlanOptions) {}

  /** New profiles are due at once; removed ones are forgotten. */
  setProfiles(ids: readonly string[], now: number): void {
    for (const id of [...this.slots.keys()]) if (!ids.includes(id)) this.slots.delete(id)
    for (const id of ids) if (!this.slots.has(id)) this.slots.set(id, { pollAt: now, soonAt: null, inFlight: false })
  }

  noteResult(id: string, now: number): void {
    const slot = this.slots.get(id)
    if (slot) slot.soonAt = now + this.options.debounceMs
  }

  requestNow(id: string, now: number): void {
    const slot = this.slots.get(id)
    if (slot) slot.soonAt = now
  }

  started(id: string, now: number): void {
    const slot = this.slots.get(id)
    if (!slot) return
    slot.inFlight = true
    slot.soonAt = null
    slot.pollAt = now + this.options.pollMs
  }

  finished(id: string): void {
    const slot = this.slots.get(id)
    if (slot) slot.inFlight = false
  }

  due(now: number): string[] {
    return [...this.slots.entries()].filter(([, slot]) => !slot.inFlight && dueAt(slot) <= now).map(([id]) => id)
  }

  /** The earliest moment a profile not in flight falls due; null when none can. */
  wakeAt(): number | null {
    const times = [...this.slots.values()].filter((slot) => !slot.inFlight).map(dueAt)
    return times.length === 0 ? null : Math.min(...times)
  }
}

function dueAt(slot: Slot): number {
  return slot.soonAt === null ? slot.pollAt : Math.min(slot.pollAt, slot.soonAt)
}

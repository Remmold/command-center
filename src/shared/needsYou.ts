import { WAITING_STATUSES, type SessionStatus, type SessionStatusEntry } from './types'

export const STATUS_LABEL: Record<SessionStatus, string> = {
  running: 'Running',
  'needs-approval': 'Needs approval',
  'your-turn': 'Your turn',
  idle: 'Idle'
}

export function isWaiting(entry: Pick<SessionStatusEntry, 'status'>): boolean {
  return WAITING_STATUSES.includes(entry.status)
}

/** Waiting sessions, longest wait first. */
export function needsYouQueue(entries: readonly SessionStatusEntry[]): SessionStatusEntry[] {
  return entries.filter(isWaiting).sort((a, b) => a.since - b.since)
}

const URGENCY: Record<SessionStatus, number> = {
  'needs-approval': 3,
  'your-turn': 2,
  running: 1,
  idle: 0
}

/** The status a group of sessions shows as one dot; Idle when there are none. */
export function mostUrgentStatus(statuses: Iterable<SessionStatus>): SessionStatus {
  let best: SessionStatus = 'idle'
  for (const s of statuses) if (URGENCY[s] > URGENCY[best]) best = s
  return best
}

/** The queue entry after the one on screen, wrapping; the oldest when none of them is on screen. */
export function nextWaiting(
  queue: readonly SessionStatusEntry[],
  onScreenPaneId: string | null
): SessionStatusEntry | null {
  if (queue.length === 0) return null
  const at = queue.findIndex((e) => e.paneId === onScreenPaneId)
  return queue[(at + 1) % queue.length]
}

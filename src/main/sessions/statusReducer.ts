import type { SessionStatus } from '../../shared/types'

export type SessionStatusEvent =
  | { kind: 'spawned'; at: number }
  | { kind: 'user-message'; at: number }
  | { kind: 'permission-raised'; requestId: string; at: number }
  | { kind: 'permission-resolved'; requestId: string; at: number }
  /** One parsed stream-json line from the claude process. */
  | { kind: 'claude-event'; event: unknown; at: number }
  | { kind: 'exit'; at: number }

type WithoutTime<E> = E extends unknown ? Omit<E, 'at'> : never
export type UntimedSessionStatusEvent = WithoutTime<SessionStatusEvent>

export interface SessionStatusState {
  status: SessionStatus
  /** When the current status began; unchanged by events that keep the status. */
  since: number
  pendingRequestIds: readonly string[]
}

export function reduceSessionStatus(
  prev: SessionStatusState | null,
  event: SessionStatusEvent
): SessionStatusState {
  const pending = prev?.pendingRequestIds ?? []
  switch (event.kind) {
    case 'spawned':
      return enter(prev, 'running', event.at, [])
    case 'exit':
      return enter(prev, 'idle', event.at, [])
    case 'user-message':
      return enter(prev, 'running', event.at, pending)
    case 'claude-event':
      if (isTurnResult(event.event)) return enter(prev, 'your-turn', event.at, pending)
      return prev ?? enter(null, 'running', event.at, pending)
    case 'permission-raised':
      if (pending.includes(event.requestId)) return prev ?? enter(null, 'needs-approval', event.at, pending)
      return enter(prev, 'needs-approval', event.at, [...pending, event.requestId])
    case 'permission-resolved': {
      if (!prev || !pending.includes(event.requestId)) return prev ?? enter(null, 'idle', event.at, [])
      const left = pending.filter((id) => id !== event.requestId)
      if (left.length > 0 || prev.status !== 'needs-approval') return { ...prev, pendingRequestIds: left }
      return enter(prev, 'running', event.at, left)
    }
  }
}

function enter(
  prev: SessionStatusState | null,
  status: SessionStatus,
  at: number,
  pendingRequestIds: readonly string[]
): SessionStatusState {
  const since = prev && prev.status === status ? prev.since : at
  return { status, since, pendingRequestIds }
}

function isTurnResult(event: unknown): boolean {
  return typeof event === 'object' && event !== null && (event as { type?: unknown }).type === 'result'
}

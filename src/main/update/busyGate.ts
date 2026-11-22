export type BusyEvent =
  | { kind: 'spawned'; paneId: string }
  | { kind: 'sent'; paneId: string; uuid: string }
  | { kind: 'approval-raised'; paneId: string; requestId: string }
  | { kind: 'approval-resolved'; paneId: string; requestId: string }
  /** One parsed stream-json line from the session's claude process. */
  | { kind: 'claude-event'; paneId: string; event: unknown }
  | { kind: 'exit'; paneId: string }

interface SessionBusy {
  turnRunning: boolean
  approvals: readonly string[]
  /** Prompts sent mid-turn that the CLI has not taken up yet. */
  waiting: readonly string[]
}

export type BusyState = Readonly<Record<string, SessionBusy>>

const IDLE: SessionBusy = { turnRunning: false, approvals: [], waiting: [] }

const TAKEN_UP = new Set(['started', 'completed', 'cancelled', 'discarded', 'refused'])

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null

/** Whether a restart would cut into a session: a running turn, a waiting approval or a prompt the CLI has not started. */
export function reduceBusy(state: BusyState, event: BusyEvent): BusyState {
  const session = state[event.paneId] ?? IDLE
  const replace = (next: SessionBusy): BusyState => ({ ...state, [event.paneId]: next })
  switch (event.kind) {
    case 'spawned':
    case 'exit':
      return replace(IDLE)
    case 'sent':
      if (!session.turnRunning) return replace({ ...session, turnRunning: true })
      return replace({ ...session, waiting: [...session.waiting, event.uuid] })
    case 'approval-raised':
      return session.approvals.includes(event.requestId) ? state : replace({ ...session, approvals: [...session.approvals, event.requestId] })
    case 'approval-resolved':
      return replace({ ...session, approvals: session.approvals.filter((id) => id !== event.requestId) })
    case 'claude-event':
      return replace(applyLine(session, event.event))
  }
}

/** The CLI takes a waiting prompt up when it echoes it (`--replay-user-messages`) or reports its lifecycle past `queued`. */
function applyLine(session: SessionBusy, line: unknown): SessionBusy {
  if (!isRecord(line)) return session
  if (line.type === 'result') return { ...session, turnRunning: false }
  const takenUp = (uuid: unknown, starts: boolean): SessionBusy =>
    session.waiting.includes(uuid as string)
      ? { ...session, turnRunning: session.turnRunning || starts, waiting: session.waiting.filter((u) => u !== uuid) }
      : session
  if (line.type === 'user') return takenUp(line.uuid, true)
  if (line.type === 'command_lifecycle' && typeof line.state === 'string' && TAKEN_UP.has(line.state)) return takenUp(line.command_uuid, line.state === 'started')
  return session
}

export function isBusy(session: SessionBusy | undefined): boolean {
  return !!session && (session.turnRunning || session.approvals.length > 0 || session.waiting.length > 0)
}

export function busyPanes(state: BusyState): string[] {
  return Object.keys(state).filter((id) => isBusy(state[id]))
}

import { startOutcomeMessage } from '../../shared/features'
import type { JustStarted } from '../../shared/mainChat'

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

/** What the app does after a card's action ran: nothing, a fresh main chat naming the started feature, or one `[Command Center]` line. */
export type ActionOutcome = { kind: 'none' } | { kind: 'reset'; justStarted: JustStarted } | { kind: 'tell'; text: string }

export interface OutcomeDeps {
  /** Starts the main chat on a new session whose first prompt names the feature. */
  reset: (justStarted: JustStarted) => void
  /** Sends the line to the main chat, in the conversation whose card ran. */
  tell: (text: string) => void
}

/** The one way every kind's outcome reaches the main chat. */
export function settleOutcome(outcome: ActionOutcome, deps: OutcomeDeps): void {
  if (outcome.kind === 'reset') deps.reset(outcome.justStarted)
  else if (outcome.kind === 'tell') deps.tell(outcome.text)
}

/** After a Go that ran: a started feature begins a fresh main chat (its plan lives on in the brief); a failure keeps the conversation and reports to it. */
export const goOutcome = (started: JustStarted, error: string | null): ActionOutcome =>
  error === null ? { kind: 'reset', justStarted: started } : { kind: 'tell', text: startOutcomeMessage(started.name, error) }

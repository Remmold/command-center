import { useSyncExternalStore } from 'react'
import type { QueuedSend } from '../../shared/sendMessage'
import type { SessionStatus } from '../../shared/types'

/** A session takes a message only between turns: not while it runs or waits on an approval or a question. */
export const takesMessage = (status: SessionStatus): boolean => status === 'idle' || status === 'your-turn'

export interface MessageQueueDeps {
  /** The feature session's status now; a closed session reads idle. */
  status: (feature: string) => SessionStatus
  /** Sends as if typed into the feature's session, hosting a closed one first; resolves with why it was not delivered, or null. */
  send: (feature: string, text: string) => Promise<string | null>
  /** Told once per card whose message settled: sent (and whether it had waited) or not delivered. */
  settled: (feature: string, outcome: { queued: boolean } | { error: string }) => void
}

/**
 * The send-message cards' sends. A message to a session between turns goes at once; one to a busy session waits, one
 * per feature, until its status says the turn ended. A newer message to the same feature replaces one still waiting.
 * In memory only: a restart forgets what waits.
 */
export function createMessageQueue(deps: MessageQueueDeps) {
  const waiting = new Map<string, { cardKey: string; text: string }>()
  const states = new Map<string, QueuedSend>()
  const listeners = new Set<() => void>()
  const set = (cardKey: string, state: QueuedSend): void => {
    states.set(cardKey, state)
    for (const listener of listeners) listener()
  }
  const go = async (feature: string, cardKey: string, text: string, queued: boolean): Promise<QueuedSend> => {
    const error = await deps.send(feature, text).catch((err: unknown) => (err instanceof Error ? err.message : String(err)))
    const state: QueuedSend = error === null ? { state: 'sent' } : { state: 'failed', error }
    set(cardKey, state)
    deps.settled(feature, error === null ? { queued } : { error })
    return state
  }
  return {
    /** A Send click: resolves once the message went, or at once with `queued` when it waits. */
    submit(feature: string, cardKey: string, text: string): Promise<QueuedSend> {
      const older = waiting.get(feature)
      if (older && older.cardKey !== cardKey) set(older.cardKey, { state: 'replaced' })
      waiting.delete(feature)
      if (takesMessage(deps.status(feature))) return go(feature, cardKey, text, false)
      waiting.set(feature, { cardKey, text })
      set(cardKey, { state: 'queued' })
      return Promise.resolve({ state: 'queued' })
    },
    /** Sends each waiting message whose session now takes one; call on every status change. */
    tick(): void {
      for (const [feature, entry] of [...waiting]) {
        if (!takesMessage(deps.status(feature))) continue
        waiting.delete(feature)
        void go(feature, entry.cardKey, entry.text, true)
      }
    },
    stateOf: (cardKey: string): QueuedSend | undefined => states.get(cardKey),
    subscribe(listener: () => void): () => void {
      listeners.add(listener)
      return () => listeners.delete(listener)
    }
  }
}

export type MessageQueue = ReturnType<typeof createMessageQueue>

/** A card's send state from `queue`, re-rendering when it changes. */
export function useQueuedSend(queue: MessageQueue, cardKey: string): QueuedSend | undefined {
  return useSyncExternalStore(queue.subscribe, () => queue.stateOf(cardKey))
}

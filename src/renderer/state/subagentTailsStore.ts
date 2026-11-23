import { useEffect } from 'react'
import { create } from 'zustand'
import { subagentSourceKey, type AgentTail, type AgentTails, type SubagentSource, type SubagentTailEvent } from '../../shared/subagentTail'

/** Items kept per agent; older ones drop off the front. */
const MAX_ITEMS = 2000

interface SubagentTailsState {
  byKey: Record<string, AgentTails>
  receive: (event: SubagentTailEvent) => void
  forget: (key: string) => void
}

export const useSubagentTailsStore = create<SubagentTailsState>()((set) => ({
  byKey: {},
  receive: (event) =>
    set((s) => {
      const tails = s.byKey[event.key]
      if (!tails) return s
      const before = tails[event.agentId]
      const items = event.reset || !before ? event.items : [...before.items, ...event.items]
      const tail: AgentTail = { meta: event.meta, items: items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items }
      return { byKey: { ...s.byKey, [event.key]: { ...tails, [event.agentId]: tail } } }
    }),
  forget: (key) =>
    set((s) => {
      if (!(key in s.byKey)) return s
      const { [key]: _gone, ...rest } = s.byKey
      return { byKey: rest }
    })
}))

const users = new Map<string, number>()
let listening = false

function watch(source: SubagentSource): () => void {
  if (!listening) {
    listening = true
    window.api.subagents.onItems((event) => useSubagentTailsStore.getState().receive(event))
  }
  const key = subagentSourceKey(source)
  const count = users.get(key) ?? 0
  users.set(key, count + 1)
  if (count === 0) {
    useSubagentTailsStore.setState((s) => ({ byKey: { ...s.byKey, [key]: {} } }))
    window.api.subagents.watch(source)
  }
  return () => {
    const left = (users.get(key) ?? 1) - 1
    if (left > 0) {
      users.set(key, left)
      return
    }
    users.delete(key)
    window.api.subagents.unwatch(source)
    useSubagentTailsStore.getState().forget(key)
  }
}

const NO_TAILS: AgentTails = {}

/** Follows the session's agent files while mounted and `on`; every user of one session shares one watch. */
export function useAgentTails(source: SubagentSource | undefined, on: boolean): AgentTails {
  const cwd = source?.cwd
  const sessionId = source?.sessionId
  useEffect(() => {
    if (!on || !cwd || !sessionId) return
    return watch({ cwd, sessionId })
  }, [on, cwd, sessionId])
  const key = cwd && sessionId ? subagentSourceKey({ cwd, sessionId }) : undefined
  return useSubagentTailsStore((s) => (key ? (s.byKey[key] ?? NO_TAILS) : NO_TAILS))
}

/** One agent's followed file, by its id or else the call that started it. */
export function tailOf(tails: AgentTails | undefined, agentId: string | undefined, toolUseId: string): AgentTail | undefined {
  if (!tails) return undefined
  if (agentId && tails[agentId]) return tails[agentId]
  for (const tail of Object.values(tails)) if (tail.meta.toolUseId === toolUseId) return tail
  return undefined
}

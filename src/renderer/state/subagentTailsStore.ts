import { useEffect } from 'react'
import { create } from 'zustand'
import type { ChatItem } from '../../shared/chatItems'
import { subagentSourceKey, type AgentTail, type AgentTails, type SubagentSource, type SubagentTailEvent } from '../../shared/subagentTail'
import { touchRecent } from './recentlyOpened'

/** Items kept per agent; older ones drop off the front. */
const MAX_ITEMS = 2000
/** Agents whose items stay loaded: the open live view and the last ones closed. */
const LOADED_AGENTS = 3

const itemsKey = (key: string, agentId: string): string => `${key}\n${agentId}`

interface SubagentTailsState {
  /** Each followed session's agents, as summaries. */
  byKey: Record<string, AgentTails>
  /** Full items of the agents whose live view is open or was closed last, by session key and agent id. */
  items: Record<string, readonly ChatItem[]>
  /** Those agents, the most recently opened first. */
  recent: readonly string[]
  receive: (event: SubagentTailEvent) => void
  forget: (key: string) => void
  /** Keeps the agent's items loaded, dropping those of the closed agent opened longest ago. */
  touch: (key: string, agentId: string, open: ReadonlySet<string>) => void
}

export const useSubagentTailsStore = create<SubagentTailsState>()((set) => ({
  byKey: {},
  items: {},
  recent: [],
  receive: (event) =>
    set((s) => {
      if (event.kind === 'summary') {
        const tails = s.byKey[event.key]
        if (!tails) return s
        const tail: AgentTail = { meta: event.meta, summary: event.summary }
        return { byKey: { ...s.byKey, [event.key]: { ...tails, [event.agentId]: tail } } }
      }
      const id = itemsKey(event.key, event.agentId)
      if (!s.recent.includes(id)) return s
      const before = s.items[id]
      if (!event.reset && !before) return s
      const items = event.reset || !before ? event.items : [...before, ...event.items]
      return { items: { ...s.items, [id]: items.length > MAX_ITEMS ? items.slice(-MAX_ITEMS) : items } }
    }),
  forget: (key) =>
    set((s) => {
      if (!(key in s.byKey)) return s
      const { [key]: _gone, ...rest } = s.byKey
      const prefix = `${key}\n`
      const items = Object.fromEntries(Object.entries(s.items).filter(([id]) => !id.startsWith(prefix)))
      return { byKey: rest, items, recent: s.recent.filter((id) => !id.startsWith(prefix)) }
    }),
  touch: (key, agentId, open) =>
    set((s) => {
      const { order, dropped } = touchRecent(s.recent, itemsKey(key, agentId), LOADED_AGENTS, open)
      if (dropped.length === 0 && order.every((id, i) => s.recent[i] === id)) return s
      const items = { ...s.items }
      for (const id of dropped) delete items[id]
      return { recent: order, items }
    })
}))

const users = new Map<string, number>()
let listening = false

function listen(): void {
  if (listening) return
  listening = true
  window.api.subagents.onItems((event) => useSubagentTailsStore.getState().receive(event))
}

function watch(source: SubagentSource): () => void {
  listen()
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

/** Follows the session's agent files, as summaries, while mounted and `on`; every user of one session shares one watch. */
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

const openers = new Map<string, number>()

/** One agent's own items while its live view shows it: its file is read when the view opens and followed while it stays open. */
export function useAgentItems(source: SubagentSource | undefined, agentId: string | undefined): readonly ChatItem[] | undefined {
  const cwd = source?.cwd
  const sessionId = source?.sessionId
  const key = cwd && sessionId ? subagentSourceKey({ cwd, sessionId }) : undefined
  useEffect(() => {
    if (!cwd || !sessionId || !key || !agentId) return
    listen()
    const id = itemsKey(key, agentId)
    const target = { cwd, sessionId, agentId }
    const count = openers.get(id) ?? 0
    openers.set(id, count + 1)
    useSubagentTailsStore.getState().touch(key, agentId, new Set(openers.keys()))
    if (count === 0) window.api.subagents.open(target)
    return () => {
      const left = (openers.get(id) ?? 1) - 1
      if (left > 0) {
        openers.set(id, left)
        return
      }
      openers.delete(id)
      window.api.subagents.close(target)
    }
  }, [cwd, sessionId, key, agentId])
  return useSubagentTailsStore((s) => (key && agentId ? s.items[itemsKey(key, agentId)] : undefined))
}

/** One agent's followed file, by its id or else the call that started it. */
export function tailOf(tails: AgentTails | undefined, agentId: string | undefined, toolUseId: string): AgentTail | undefined {
  if (!tails) return undefined
  if (agentId && tails[agentId]) return tails[agentId]
  for (const tail of Object.values(tails)) if (tail.meta.toolUseId === toolUseId) return tail
  return undefined
}

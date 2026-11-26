import { create } from 'zustand'
import type { CreateTerminalRequest, CreateTerminalResult, TerminalInfo } from '../../shared/types'

interface TerminalsState {
  /** The pool in main, by id, as its last change reported it. */
  byId: Record<string, TerminalInfo>
  /** True once the first list from main has arrived. */
  loaded: boolean
  initialized: boolean
  init: () => void
  create: (request: CreateTerminalRequest & { id: string }) => Promise<CreateTerminalResult>
}

/** Ids this window asked for, so a first list that raced their creation doesn't read them as gone. */
const createdHere = new Set<string>()

export function createdInThisWindow(id: string): boolean {
  return createdHere.has(id)
}

function byIdOf(list: readonly TerminalInfo[]): Record<string, TerminalInfo> {
  return Object.fromEntries(list.map((t) => [t.id, t]))
}

export const useTerminalsStore = create<TerminalsState>((set, get) => ({
  byId: {},
  loaded: false,
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.terminals.onChanged((list) => set({ byId: byIdOf(list), loaded: true }))
    window.api.terminals
      .list()
      .then((list) => {
        if (!get().loaded) set({ byId: byIdOf(list), loaded: true })
      })
      .catch((err) => console.error('failed to load terminals', err))
  },
  create: (request) => {
    createdHere.add(request.id)
    return window.api.terminals.create(request)
  }
}))

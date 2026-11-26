import { create } from 'zustand'
import type { LocalServer } from '../../shared/localPorts'
import type { TerminalInfo } from '../../shared/types'

interface ProcessesViewState {
  /** The row picked in the Processes view, by its row key; kept while other views show. */
  chosen: string | null
  /** Each terminal's servers whose port answered, by terminal id. */
  terminalServers: Record<string, LocalServer[]>
  /** `claudeRowKey(...)` or `terminalRowKey(...)`; a key not listed yet is kept until it is. */
  select: (key: string) => void
  /** Asks whether the servers running terminals named answer yet. */
  checkTerminalServers: (terminals: readonly TerminalInfo[]) => Promise<void>
}

const checking = new Set<string>()

export const useProcessesViewStore = create<ProcessesViewState>((set, get) => ({
  chosen: null,
  terminalServers: {},
  select: (key) => set({ chosen: key }),
  checkTerminalServers: async (terminals) => {
    await Promise.all(
      terminals.map(async (t) => {
        if (t.status !== 'running' || !t.servers || checking.has(t.id)) return
        const known = get().terminalServers[t.id] ?? []
        const unknown = t.servers.filter((s) => !known.some((k) => k.port === s.port))
        if (unknown.length === 0) return
        checking.add(t.id)
        try {
          const open = await Promise.all(unknown.map(async (s) => ((await window.api.backgroundProcesses.portOpen(s.port)) ? s : null)))
          const found = open.filter((s): s is LocalServer => s !== null)
          if (found.length === 0) return
          set((s) => {
            const now = s.terminalServers[t.id] ?? []
            return { terminalServers: { ...s.terminalServers, [t.id]: [...now, ...found.filter((f) => !now.some((k) => k.port === f.port))] } }
          })
        } finally {
          checking.delete(t.id)
        }
      })
    )
  }
}))

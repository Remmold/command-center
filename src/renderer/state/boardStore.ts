import { create } from 'zustand'
import type { BoardModel, DiscoveryModel } from '../../shared/types'
import type { BoardFilter, TicketRef } from './boardLayout'

interface BoardState {
  model: BoardModel
  discovery: DiscoveryModel
  initialized: boolean
  filter: BoardFilter
  selected: TicketRef | null
  finishedOpen: boolean
  notAddedOpen: boolean
  init: () => void
  rescan: () => void
  setScanRoots: (roots: string[]) => Promise<void>
  filterRepoGroup: (repoGroupKey: string | null) => void
  filterWorkspace: (workspaceId: string | null) => void
  select: (ticket: TicketRef | null) => void
  toggleFinished: () => void
  toggleNotAdded: () => void
}

export const useBoardStore = create<BoardState>((set, get) => ({
  model: { repoGroups: [] },
  discovery: { scanRoots: [], repos: [], scannedAt: null, scanMs: null, error: null },
  initialized: false,
  filter: { repoGroupKey: null, workspaceId: null },
  selected: null,
  finishedOpen: false,
  notAddedOpen: true,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.board.onChanged((model) => set({ model }))
    window.api.board
      .get()
      .then((model) => set({ model }))
      .catch((err) => console.error('failed to load board', err))
    window.api.discovery.onChanged((discovery) => set({ discovery }))
    window.api.discovery
      .get()
      .then((discovery) => set({ discovery }))
      .catch((err) => console.error('failed to load discovered repos', err))
  },
  rescan: () => {
    window.api.discovery.rescan().catch((err) => console.error('rescan failed', err))
  },
  setScanRoots: async (roots) => {
    set({ discovery: await window.api.discovery.setRoots(roots) })
  },
  filterRepoGroup: (repoGroupKey) => set({ filter: { repoGroupKey, workspaceId: null } }),
  filterWorkspace: (workspaceId) => set((s) => ({ filter: { ...s.filter, workspaceId } })),
  select: (selected) => set({ selected }),
  toggleFinished: () => set((s) => ({ finishedOpen: !s.finishedOpen })),
  toggleNotAdded: () => set((s) => ({ notAddedOpen: !s.notAddedOpen }))
}))

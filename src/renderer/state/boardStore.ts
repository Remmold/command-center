import { create } from 'zustand'
import type { BoardModel } from '../../shared/types'
import type { BoardFilter, TicketRef } from './boardLayout'

interface BoardState {
  model: BoardModel
  initialized: boolean
  filter: BoardFilter
  selected: TicketRef | null
  finishedOpen: boolean
  init: () => void
  filterRepoGroup: (repoGroupKey: string | null) => void
  filterWorkspace: (workspaceId: string | null) => void
  select: (ticket: TicketRef | null) => void
  toggleFinished: () => void
}

export const useBoardStore = create<BoardState>((set, get) => ({
  model: { repoGroups: [] },
  initialized: false,
  filter: { repoGroupKey: null, workspaceId: null },
  selected: null,
  finishedOpen: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.board.onChanged((model) => set({ model }))
    window.api.board
      .get()
      .then((model) => set({ model }))
      .catch((err) => console.error('failed to load board', err))
  },
  filterRepoGroup: (repoGroupKey) => set({ filter: { repoGroupKey, workspaceId: null } }),
  filterWorkspace: (workspaceId) => set((s) => ({ filter: { ...s.filter, workspaceId } })),
  select: (selected) => set({ selected }),
  toggleFinished: () => set((s) => ({ finishedOpen: !s.finishedOpen }))
}))

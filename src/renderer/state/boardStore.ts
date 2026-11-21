import { create } from 'zustand'
import type { BoardModel } from '../../shared/types'

interface BoardState {
  model: BoardModel
  initialized: boolean
  init: () => void
}

export const useBoardStore = create<BoardState>((set, get) => ({
  model: { repoGroups: [] },
  initialized: false,
  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.board.onChanged((model) => set({ model }))
    window.api.board
      .get()
      .then((model) => set({ model }))
      .catch((err) => console.error('failed to load board', err))
  }
}))

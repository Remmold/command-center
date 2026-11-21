import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import type { BoardModel, DiscoveryModel } from '../../shared/types'
import type { BoardFilter, GroupBy, TicketRef } from './boardLayout'
import { showOnlyFeature } from './nowBuilding'

export const PANEL_MIN_WIDTH = 420

interface BoardState {
  model: BoardModel
  discovery: DiscoveryModel
  initialized: boolean
  filter: BoardFilter
  groupBy: GroupBy
  showFinished: boolean
  /** Share of the board's width the reading panel takes. */
  panelShare: number
  collapsedLanes: string[]
  selected: TicketRef | null
  init: () => void
  rescan: () => void
  setScanRoots: (roots: string[]) => Promise<void>
  setFilter: (patch: Partial<BoardFilter>) => void
  /** Filters the board down to one feature, clearing whatever would hide its tickets. */
  showFeature: (repoGroupKey: string, key: string, finished: boolean) => void
  setGroupBy: (groupBy: GroupBy) => void
  toggleShowFinished: () => void
  toggleLane: (laneKey: string) => void
  setPanelShare: (share: number) => void
  select: (ticket: TicketRef | null) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set, get) => ({
      model: { repoGroups: [] },
      discovery: { scanRoots: [], repos: [], scannedAt: null, scanMs: null, error: null },
      initialized: false,
      filter: { repoGroupKeys: [], featureKeys: [], search: '' },
      groupBy: 'none',
      showFinished: false,
      panelShare: 0.5,
      collapsedLanes: [],
      selected: null,
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
      setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
      showFeature: (repoGroupKey, key, finished) =>
        set((s) => ({ filter: showOnlyFeature(s.filter, repoGroupKey, key), showFinished: s.showFinished || finished })),
      setGroupBy: (groupBy) => set({ groupBy }),
      toggleShowFinished: () => set((s) => ({ showFinished: !s.showFinished })),
      toggleLane: (laneKey) =>
        set((s) => ({
          collapsedLanes: s.collapsedLanes.includes(laneKey)
            ? s.collapsedLanes.filter((k) => k !== laneKey)
            : [...s.collapsedLanes, laneKey]
        })),
      setPanelShare: (panelShare) => set({ panelShare }),
      select: (selected) => set({ selected })
    }),
    {
      name: 'command-center.board',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({
        filter: s.filter,
        groupBy: s.groupBy,
        showFinished: s.showFinished,
        panelShare: s.panelShare
      })
    }
  )
)

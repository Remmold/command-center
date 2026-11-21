import { create } from 'zustand'
import type { ChatItem } from '../../shared/chatItems'
import type { ObservedSession } from '../../shared/types'
import { useProjectViewsStore } from './projectViewsStore'

interface Viewing {
  workspaceId: string
  sessionId: string
}

interface ObservedState {
  sessions: ObservedSession[]
  viewing: Viewing | null
  items: ChatItem[]
  /** Older lines of the transcript were not loaded. */
  shortened: boolean
  loading: boolean
  error: string | null
  initialized: boolean
  init: () => void
  open: (workspaceId: string, sessionId: string) => Promise<void>
  close: () => void
}

function hostedSessionIds(): string[] {
  const ids = new Set<string>()
  for (const view of Object.values(useProjectViewsStore.getState().views)) {
    for (const s of view.claudeSessions) if (s.claudeSessionId) ids.add(s.claudeSessionId)
  }
  return [...ids].sort()
}

const isViewing = (v: Viewing | null, workspaceId: string, sessionId: string): boolean =>
  v?.workspaceId === workspaceId && v.sessionId === sessionId

export const useObservedStore = create<ObservedState>((set, get) => ({
  sessions: [],
  viewing: null,
  items: [],
  shortened: false,
  loading: false,
  error: null,
  initialized: false,

  init: () => {
    if (get().initialized) return
    set({ initialized: true })
    window.api.observed.onChanged((sessions) => set({ sessions }))
    window.api.observed.onItems(({ workspaceId, sessionId, items }) => {
      if (!isViewing(get().viewing, workspaceId, sessionId)) return
      set((s) => ({ items: [...s.items, ...items] }))
    })
    window.api.observed
      .list()
      .then((sessions) => set({ sessions }))
      .catch((err) => console.error('failed to load observed sessions', err))

    let hosted = hostedSessionIds().join(',')
    window.api.observed.setHosted(hostedSessionIds())
    useProjectViewsStore.subscribe(() => {
      const nextHosted = hostedSessionIds()
      if (nextHosted.join(',') !== hosted) {
        hosted = nextHosted.join(',')
        window.api.observed.setHosted(nextHosted)
      }
    })
  },

  open: async (workspaceId, sessionId) => {
    const viewing = { workspaceId, sessionId }
    set({ viewing, items: [], shortened: false, loading: true, error: null })
    const res = await window.api.observed.open(workspaceId, sessionId)
    if (get().viewing !== viewing) return
    if (res.ok) set((s) => ({ items: [...res.items, ...s.items], shortened: res.shortened, loading: false }))
    else set({ loading: false, error: res.error })
  },

  close: () => {
    if (!get().viewing) return
    window.api.observed.close()
    set({ viewing: null, items: [], shortened: false, loading: false, error: null })
  }
}))

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
  /** The session now runs in the app; it stays out of the list even if the CLI gives the resumed chat a new id. */
  markTakenOver: (sessionId: string) => void
}

/** Session ids taken over from VS Code in this run of the app. */
const takenOver = new Set<string>()
const notTakenOver = (sessions: ObservedSession[]): ObservedSession[] => sessions.filter((o) => !takenOver.has(o.sessionId))

function hostedSessionIds(): string[] {
  const ids = new Set<string>()
  for (const view of Object.values(useProjectViewsStore.getState().views)) {
    for (const s of view.claudeSessions) if (s.claudeSessionId) ids.add(s.claudeSessionId)
  }
  for (const id of takenOver) ids.add(id)
  return [...ids].sort()
}

let hosted = ''

function syncHosted(): void {
  const next = hostedSessionIds()
  if (next.join(',') === hosted) return
  hosted = next.join(',')
  window.api.observed.setHosted(next)
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
    window.api.observed.onChanged((sessions) => set({ sessions: notTakenOver(sessions) }))
    window.api.observed.onItems(({ workspaceId, sessionId, items }) => {
      if (!isViewing(get().viewing, workspaceId, sessionId)) return
      set((s) => ({ items: [...s.items, ...items] }))
    })
    window.api.observed
      .list()
      .then((sessions) => set({ sessions: notTakenOver(sessions) }))
      .catch((err) => console.error('failed to load observed sessions', err))

    syncHosted()
    useProjectViewsStore.subscribe(syncHosted)
  },

  open: async (workspaceId, sessionId) => {
    const viewing = { workspaceId, sessionId }
    set({ viewing, items: [], shortened: false, loading: true, error: null })
    const res = await window.api.observed.open(workspaceId, sessionId)
    if (get().viewing !== viewing) return
    if (res.ok) set((s) => ({ items: [...res.items, ...s.items], shortened: res.shortened, loading: false }))
    else set({ loading: false, error: res.error })
  },

  markTakenOver: (sessionId) => {
    takenOver.add(sessionId)
    set((s) => ({ sessions: notTakenOver(s.sessions) }))
    syncHosted()
  },

  close: () => {
    if (!get().viewing) return
    window.api.observed.close()
    set({ viewing: null, items: [], shortened: false, loading: false, error: null })
  }
}))

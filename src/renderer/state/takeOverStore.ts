import { create } from 'zustand'
import type { ChatItem } from '../../shared/chatItems'
import { takeOverStep } from '../../shared/takeOver'
import type { LocalSessionInfo } from '../../shared/types'
import { useChatItemsStore } from './chatItemsStore'
import { useObservedStore } from './observedStore'
import { useProjectViewsStore } from './projectViewsStore'
import { openSessionInPlaceOf } from './sessionNavigation'
import { requestStartOnMount } from './startRequests'
import { useToastStore } from './toastStore'
import { useWorkspacesStore } from './workspacesStore'

const POLL_MS = 1000

export const OUT_OF_DATE_NOTICE =
  'The VS Code panel for this chat is now out of date. Typing there would split the chat into two copies.'

export const TAKE_OVER_TOOLTIP = "Move this chat into Command Center; it hands over once VS Code's agent has finished its turn"

export interface TakeOverTarget {
  workspaceId: string
  sessionId: string
  title: string
}

interface Pending extends TakeOverTarget {
  now: boolean
  /** Set once the switch has begun; it can no longer be cancelled or started again. */
  switching: boolean
}

interface TakeOverState {
  /** Take-overs waiting for VS Code's agent to finish its turn, by session id. */
  pending: Record<string, Pending>
  /** Hands the chat over once VS Code's agent is not mid-turn, or at once with `now`. */
  request: (target: TakeOverTarget, options?: { now?: boolean }) => void
  cancel: (sessionId: string) => void
}

function without(pending: Record<string, Pending>, sessionId: string): Record<string, Pending> {
  const { [sessionId]: _gone, ...rest } = pending
  return rest
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

export const useTakeOverStore = create<TakeOverState>((set, get) => {
  const run = async (sessionId: string): Promise<void> => {
    for (;;) {
      const waiting = get().pending[sessionId]
      const turn = waiting ? await window.api.observed.turn(waiting.workspaceId, waiting.sessionId).catch(() => 'working' as const) : 'idle'
      const current = get().pending[sessionId]
      const step = takeOverStep({ turn, cancelled: !current, now: current?.now })
      if (step === 'stop' || !current) return
      if (step === 'switch') {
        set((s) => ({ pending: { ...s.pending, [sessionId]: { ...current, switching: true } } }))
        try {
          await switchOver(current)
        } finally {
          set((s) => ({ pending: without(s.pending, sessionId) }))
        }
        return
      }
      await pause(POLL_MS)
    }
  }

  return {
    pending: {},
    request: (target, { now = false } = {}) => {
      const already = get().pending[target.sessionId]
      if (already?.switching) return
      set((s) => ({ pending: { ...s.pending, [target.sessionId]: { ...target, now: now || (already?.now ?? false), switching: false } } }))
      if (!already) void run(target.sessionId)
    },
    cancel: (sessionId) =>
      set((s) => (s.pending[sessionId] && !s.pending[sessionId].switching ? { pending: without(s.pending, sessionId) } : s))
  }
})

// A wait nobody can see any more is dropped: closing the VS Code view cancels it.
useObservedStore.subscribe((s, prev) => {
  if (s.viewing === prev.viewing) return
  const { pending, cancel } = useTakeOverStore.getState()
  for (const p of Object.values(pending)) if (s.viewing?.sessionId !== p.sessionId) cancel(p.sessionId)
})

/** Resumes the session as a hosted chat in its workspace, shown where the VS Code view was. */
async function switchOver(target: TakeOverTarget): Promise<void> {
  const toast = useToastStore.getState().show
  const workspace = useWorkspacesStore.getState().workspaces.find((w) => w.id === target.workspaceId)
  if (!workspace) {
    toast(`Could not take over ${target.title}: its workspace is gone`)
    return
  }
  const read = await window.api.observed.read(target.workspaceId, target.sessionId)
  const views = useProjectViewsStore.getState()
  if (!views.views[workspace.id]) views.openProject(workspace, { firstSession: false })
  const info: LocalSessionInfo = { sessionId: target.sessionId, modifiedAt: Date.now(), title: target.title, titleSource: 'claude', preview: '' }
  const loaded = useProjectViewsStore.getState().loadSessionFromLocal(workspace.id, info)
  if (!loaded) {
    toast(`Could not take over ${target.title}`)
    return
  }
  const note = (text: string): ChatItem => ({ kind: 'system', id: crypto.randomUUID(), text, at: Date.now() })
  const history: ChatItem[] = read.ok ? read.items : [note(`Could not read the VS Code transcript (${read.error}); Claude still has the whole conversation.`)]
  useChatItemsStore.getState().appendItems(loaded.id, [...history, note(OUT_OF_DATE_NOTICE)])
  requestStartOnMount(loaded.id)
  useObservedStore.getState().markTakenOver(target.sessionId)
  openSessionInPlaceOf({ kind: 'observed', workspaceId: target.workspaceId, sessionId: target.sessionId }, loaded.id)
  toast(`${target.title} is now in Command Center`)
}

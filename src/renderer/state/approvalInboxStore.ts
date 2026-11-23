import { create } from 'zustand'
import type { ApprovalRequest } from '../../shared/approval'
import { GONE_LINGER_MS, answeredHere, inboxDone, moveSelection, openInbox, syncInbox, type InboxState } from './approvalInbox'
import { useApprovalsStore } from './approvalsStore'
import { useToastStore } from './toastStore'

export const ALL_CLEAR = 'All clear'

interface ApprovalInboxState {
  open: boolean
  queue: InboxState
  /** Opens over any view at the oldest item, or at that chat's oldest; with nothing waiting it only says so. */
  show: (atPane?: string) => void
  close: () => void
  toggle: () => void
  move: (step: 1 | -1) => void
  select: (requestId: string) => void
  /** Called by the prompt just before its reply goes out from the inbox. */
  answered: (requestId: string) => void
}

const EMPTY: InboxState = { rows: [], selected: null }

/** Every open request across the hosted chats; VS Code chats raise none. */
export function pendingRequests(): ApprovalRequest[] {
  return Object.values(useApprovalsStore.getState().byPane).flat()
}

let lingerTimer: ReturnType<typeof setTimeout> | undefined

export const useApprovalInboxStore = create<ApprovalInboxState>((set, get) => {
  const finish = (queue: InboxState): void => {
    if (!inboxDone(queue)) {
      set({ queue })
      if (queue.rows.some((r) => r.goneAt !== undefined)) {
        clearTimeout(lingerTimer)
        lingerTimer = setTimeout(resync, GONE_LINGER_MS)
      }
      return
    }
    clearTimeout(lingerTimer)
    set({ open: false, queue: EMPTY })
    useToastStore.getState().show(ALL_CLEAR)
  }
  const resync = (): void => {
    if (get().open) finish(syncInbox(get().queue, pendingRequests(), Date.now()))
  }
  useApprovalsStore.subscribe((s, before) => {
    if (s.byPane !== before.byPane) resync()
  })

  return {
    open: false,
    queue: EMPTY,
    show: (atPane) => {
      if (get().open) {
        const at = get().queue.rows.find((r) => r.paneId === atPane && r.goneAt === undefined)
        if (at) get().select(at.requestId)
        return
      }
      const queue = openInbox(pendingRequests(), atPane)
      if (inboxDone(queue)) {
        useToastStore.getState().show(ALL_CLEAR)
        return
      }
      set({ open: true, queue })
    },
    close: () => {
      clearTimeout(lingerTimer)
      set({ open: false, queue: EMPTY })
    },
    toggle: () => (get().open ? get().close() : get().show()),
    move: (step) => set((s) => ({ queue: moveSelection(s.queue, step) })),
    select: (requestId) => set((s) => ({ queue: { ...s.queue, selected: requestId } })),
    answered: (requestId) => finish(answeredHere(get().queue, requestId))
  }
})

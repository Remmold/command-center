import { useMemo } from 'react'
import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'
import { clampDrawerShare } from '../components/ui/drawerShare'
import { useProjectViewsStore } from './projectViewsStore'
import { useViewStore } from './viewStore'

export const DRAWER_MIN_WIDTH = 420

/** Where the drawer's chat area sits in the window, in CSS pixels. */
export interface DrawerSlot {
  top: number
  left: number
  width: number
  height: number
}

interface ChatDrawerState {
  /** The hosted session shown in the Dashboard's chat drawer; never restored after a restart. */
  paneId: string | null
  /** Share of the Dashboard's width the drawer takes. */
  share: number
  /** The drawer's chat area while it is on screen; the borrowed chat is laid over it. */
  slot: DrawerSlot | null
  show: (paneId: string) => void
  close: () => void
  setShare: (share: number) => void
  setSlot: (slot: DrawerSlot | null) => void
}

export const useChatDrawerStore = create<ChatDrawerState>()(
  persist(
    (set) => ({
      paneId: null,
      share: 0.4,
      slot: null,
      show: (paneId) => set({ paneId }),
      close: () => set({ paneId: null }),
      setShare: (share) => set({ share }),
      setSlot: (slot) => set({ slot })
    }),
    {
      name: 'command-center.chat-drawer',
      storage: createJSONStorage(() => localStorage),
      version: 1,
      partialize: (s) => ({ share: s.share })
    }
  )
)

export function drawerShare(share: number, hostWidth: number): number {
  return clampDrawerShare(share, DRAWER_MIN_WIDTH, hostWidth)
}

let initialised = false

/** Closes the drawer once its session is no longer hosted. */
export function initChatDrawer(): void {
  if (initialised) return
  initialised = true
  useProjectViewsStore.subscribe((s, prev) => {
    if (s.views === prev.views) return
    const { paneId, close } = useChatDrawerStore.getState()
    if (paneId && !Object.values(s.views).some((v) => v.claudeSessions.some((c) => c.id === paneId))) close()
  })
}

/** The drawer's session and where its chat goes, while the Dashboard shows the drawer; null otherwise. */
export function useDrawerBorrow(): { paneId: string; slot: DrawerSlot } | null {
  const shown = useViewStore((s) => s.view === 'dashboard' && s.settings === null)
  const paneId = useChatDrawerStore((s) => s.paneId)
  const slot = useChatDrawerStore((s) => s.slot)
  return useMemo(() => (shown && paneId && slot ? { paneId, slot } : null), [shown, paneId, slot])
}

import { create } from 'zustand'
import type { OutgoingPrompt } from '../../shared/appPrompts'

/** A mounted chat asked to drop its conversation and start a new Claude session in place, keeping its pane. */
export interface FreshStart {
  /** Runs once the old process has exited; resolves with the new conversation's first prompt. A rejection keeps the old conversation. */
  prepare: () => Promise<OutgoingPrompt>
}

interface FreshStartState {
  pending: Record<string, FreshStart>
  request: (paneId: string, fresh: FreshStart) => void
  clear: (paneId: string) => void
}

/** Read by the chat itself (ADR 0004: the mounted chat owns its process), which stops, clears and restarts. */
export const useFreshStartStore = create<FreshStartState>((set) => ({
  pending: {},
  request: (paneId, fresh) => set((s) => ({ pending: { ...s.pending, [paneId]: fresh } })),
  clear: (paneId) =>
    set((s) => {
      const { [paneId]: _gone, ...rest } = s.pending
      return { pending: rest }
    })
}))

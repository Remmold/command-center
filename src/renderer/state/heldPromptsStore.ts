import { create } from 'zustand'
import type { HeldPrompt } from '../components/chat/heldPrompts'

interface HeldPromptsState {
  byPane: Record<string, HeldPrompt[]>
  hold: (paneId: string, prompt: HeldPrompt) => void
  set: (paneId: string, held: HeldPrompt[]) => void
}

/** Prompts sent while Claude works, per pane, until the CLI takes them. Not persisted: they live on the CLI's stdin. */
export const useHeldPromptsStore = create<HeldPromptsState>()((set) => ({
  byPane: {},
  hold: (paneId, prompt) => set((s) => ({ byPane: { ...s.byPane, [paneId]: [...(s.byPane[paneId] ?? []), prompt] } })),
  set: (paneId, held) => set((s) => ({ byPane: { ...s.byPane, [paneId]: held } }))
}))

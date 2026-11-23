import { useEffect } from 'react'
import { create } from 'zustand'
import type { ChatRef } from './chatPair'

interface ChatAccountState {
  /** The resolved account of each chat a header shows, by `chatKey`; null when unknown. */
  byChat: Record<string, string | null>
  set: (key: string, profileId: string | null) => void
}

export const useChatAccountStore = create<ChatAccountState>((set) => ({
  byChat: {},
  set: (key, profileId) => set((s) => (s.byChat[key] === profileId && key in s.byChat ? s : { byChat: { ...s.byChat, [key]: profileId } }))
}))

export function chatKey(ref: ChatRef): string {
  return ref.kind === 'hosted' ? ref.paneId : `observed:${ref.workspaceId}:${ref.sessionId}`
}

/** Publishes the account a chat header resolved, for the top-right link. */
export function usePublishChatAccount(key: string, profileId: string | null): void {
  useEffect(() => {
    useChatAccountStore.getState().set(key, profileId)
  }, [key, profileId])
}

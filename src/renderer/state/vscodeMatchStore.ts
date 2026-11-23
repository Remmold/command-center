import { useMemo } from 'react'
import { create } from 'zustand'
import type { VsCodeMatch } from '../../shared/types'
import { accountMoves, joinNames, type AccountMove } from '../../shared/vscodeMatch'
import { useProfilesStore } from './profilesStore'
import { useToastStore } from './toastStore'
import { useWorkspacesStore } from './workspacesStore'

interface VsCodeMatchState {
  match: VsCodeMatch | null
  /** Re-reads VS Code's folder associations; call it whenever the banner comes on screen. */
  load: () => Promise<void>
  dismiss: (moves: readonly AccountMove[]) => Promise<void>
  dismissNotice: () => Promise<void>
  /** "Use the same accounts": moves the workspaces; chats already open keep their account. */
  apply: (moves: readonly AccountMove[]) => Promise<void>
}

export const useVsCodeMatchStore = create<VsCodeMatchState>((set, get) => ({
  match: null,
  load: async () => {
    try {
      set({ match: await window.api.vscodeMatch.get() })
    } catch (err) {
      console.error('failed to read VS Code profiles', err)
    }
  },
  dismiss: async (moves) => {
    const keys = moves.map((m) => m.key)
    const match = get().match
    if (match) set({ match: { ...match, dismissed: [...match.dismissed, ...keys] } })
    await window.api.vscodeMatch.dismiss(keys).catch((err) => console.error('failed to remember dismissal', err))
  },
  dismissNotice: async () => {
    const match = get().match
    if (match) set({ match: { ...match, noticeDismissed: true } })
    await window.api.vscodeMatch.dismissNotice().catch((err) => console.error('failed to remember dismissal', err))
  },
  apply: async (moves) => {
    const result = await window.api.vscodeMatch
      .apply(moves.map((m) => m.workspaceId))
      .catch((err): { ok: false; error: string } => {
        console.error('failed to use the VS Code accounts', err)
        return { ok: false, error: 'Could not switch the accounts.' }
      })
    await Promise.all([useProfilesStore.getState().load(), useWorkspacesStore.getState().load(), get().load()])
    if (!result.ok) useToastStore.getState().show(result.error)
    else if (result.accountNames.length > 0)
      useToastStore.getState().show(`Chats already open keep their account; new chats and resumed ones use ${joinNames(result.accountNames)}.`)
  }
}))

/** The mismatches the banner offers: workspaces VS Code runs on another Claude folder, not dismissed. */
export function useAccountMoves(): AccountMove[] {
  const match = useVsCodeMatchStore((s) => s.match)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const profiles = useProfilesStore((s) => s.profiles)
  return useMemo(
    () => (match && profiles.length > 0 ? accountMoves({ workspaces, profiles, folders: match.folders, dismissed: match.dismissed }) : []),
    [match, workspaces, profiles]
  )
}

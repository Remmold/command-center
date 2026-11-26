import { create } from 'zustand'
import { buildPreviewSetupPrompt } from '../../shared/previewSetup'
import type { Workspace } from '../../shared/types'
import { startingChoiceOn } from './modelStore'
import { startSession } from './sessionNavigation'
import { settleable } from './startRequests'

interface PreviewSetupState {
  /** The draft file each workspace's running Set up preview session is to write. */
  pending: Record<string, string>
}

export const usePreviewSetupStore = create<PreviewSetupState>()(() => ({ pending: {} }))

function setPending(workspaceId: string, file: string | null): void {
  usePreviewSetupStore.setState((s) => {
    const { [workspaceId]: _old, ...rest } = s.pending
    return { pending: file ? { ...rest, [workspaceId]: file } : rest }
  })
}

/** Stops waiting on the workspace's draft and removes its file. */
export async function endPreviewSetup(workspaceId: string): Promise<void> {
  const file = usePreviewSetupStore.getState().pending[workspaceId]
  setPending(workspaceId, null)
  if (file) await window.api.previewConfig.draftDiscard(file)
}

/**
 * Starts a hosted session in the workspace, on its account, asking Claude to write a preview config proposal to a file
 * named here; the Preview settings read it. Resolves with what went wrong, or null.
 */
export async function startPreviewSetup(workspace: Workspace): Promise<string | null> {
  const begun = await window.api.previewConfig.draftBegin()
  if (!begun.ok) return `Could not prepare the draft file: ${begun.error}`
  const folder = begun.file.replace(/[\/][^\/]*$/, '')
  const reached = settleable()
  setPending(workspace.id, begun.file)
  const started = startSession(workspace, {
    addDirs: [folder],
    send: { prompt: buildPreviewSetupPrompt({ draftFile: begun.file }), id: crypto.randomUUID(), delivered: reached.settle, ...startingChoiceOn(workspace.profileId) }
  })
  if (!started) {
    await endPreviewSetup(workspace.id)
    return 'Could not start the session.'
  }
  void reached.settled.then((ok) => {
    if (!ok && usePreviewSetupStore.getState().pending[workspace.id] === begun.file) void endPreviewSetup(workspace.id)
  })
  return null
}

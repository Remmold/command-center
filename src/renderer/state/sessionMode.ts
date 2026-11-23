import type { ControlResult } from '../../shared/types'
import { NOT_RUNNING } from '../components/chat/launchGate'
import type { PermissionMode } from './permissionModes'
import { findSessionByPane, useProjectViewsStore } from './projectViewsStore'

/**
 * Shows the new mode at once and asks the session's process to switch, without making it the default; puts the old
 * mode back when the process refuses. A session without a process always takes it. Null on success, else the error.
 */
export async function switchSessionMode(
  paneId: string,
  next: PermissionMode,
  send: (fields: Record<string, unknown>) => Promise<ControlResult>
): Promise<string | null> {
  const store = useProjectViewsStore.getState()
  const previous = findSessionByPane(store, paneId)?.session.permissionMode
  store.setSessionPermissionMode(paneId, next)
  const res = await send({ mode: next })
  if (res.ok || res.error === NOT_RUNNING) return null
  if (previous) useProjectViewsStore.getState().setSessionPermissionMode(paneId, previous)
  return res.error
}

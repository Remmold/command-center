import type { RenameResult } from '../../shared/types'
import { useProjectViewsStore, type ClaudeChatSession } from './projectViewsStore'
import { NEW_SESSION_TITLE, titleRequests, wantsClaudeTitle } from './sessionTitle'

/** Not persisted, as the extension's `titleRequests`: a restarted app asks again only for a session still unnamed. */
const requestsByPane = new Map<string, number>()

function hosted(paneId: string): { session: ClaudeChatSession; cwd: string } | null {
  for (const view of Object.values(useProjectViewsStore.getState().views)) {
    const session = view.claudeSessions.find((c) => c.id === paneId)
    if (session) return { session, cwd: view.projectPath }
  }
  return null
}

/** Call before `notePrompt`, so a session still called "New session" counts this as its first prompt. */
export function isFirstPrompt(paneId: string): boolean {
  return hosted(paneId)?.session.title === NEW_SESSION_TITLE
}

/** The extension's `requestGeneratedTitle`: asks the CLI to name the session from this prompt, up to three prompts. */
export function requestClaudeTitle(paneId: string, prompt: string, firstPrompt: boolean): void {
  const found = hosted(paneId)
  if (!found || prompt.trim() === '') return
  const next = wantsClaudeTitle(requestsByPane.get(paneId) ?? titleRequests(), found.session, firstPrompt)
  requestsByPane.set(paneId, next.requests)
  if (!next.ask) return
  void window.api.claude
    .control(paneId, 'generate_session_title', { description: prompt, persist: true })
    .then((result) => {
      const title = result.ok ? result.response.title : null
      if (typeof title === 'string') useProjectViewsStore.getState().applyClaudeTitle(paneId, title)
    })
}

async function tellCli(paneId: string): Promise<RenameResult> {
  const found = hosted(paneId)
  const sessionId = found?.session.claudeSessionId
  if (!found || !sessionId || !found.session.titleRenamed) return { ok: false, error: 'the session has no Claude session id yet' }
  const result = await window.api.claude.renameSession({ cwd: found.cwd, sessionId, title: found.session.title, paneId })
  if (!result.ok) console.warn('[title] rename did not reach the CLI:', result.error)
  return result
}

/** Renames in the app and tells the CLI (`rename_session`), so VS Code's history shows the same title. */
export function renameHostedSession(paneId: string, name: string): Promise<RenameResult> {
  useProjectViewsStore.getState().renameSession(paneId, name)
  return tellCli(paneId)
}

/** A session renamed before it had a CLI session id passes the rename on once the id arrives. */
export function noteClaudeSessionId(paneId: string, sessionId: string): void {
  const found = hosted(paneId)
  // Runs per streamed event, and persist rewrites the store on every set, even one that changes nothing.
  if (!found || found.session.claudeSessionId === sessionId) return
  const before = found.session.claudeSessionId
  useProjectViewsStore.getState().setClaudeSessionId(paneId, sessionId)
  if (!before) void tellCli(paneId)
}

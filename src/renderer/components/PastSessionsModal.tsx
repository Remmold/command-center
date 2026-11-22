import { useEffect, useMemo, useState } from 'react'
import { Pencil } from 'lucide-react'
import type { LocalSessionInfo, SessionStatus } from '../../shared/types'
import { useObservedStore } from '../state/observedStore'
import { matchesSearch, pastSessionDot, sessionAge, type PastSessionDotState } from '../state/pastSessions'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useTakeOverStore, type TakeOverTarget } from '../state/takeOverStore'
import { ConfirmDialog } from './ui/ConfirmDialog'
import { openObserved, openSession } from '../state/sessionNavigation'
import { useSessionStatusStore } from '../state/sessionStatusStore'
import { renameHostedSession } from '../state/sessionTitleSync'
import { Dialog } from './ui/Dialog'
import { IconButton } from './ui/IconButton'
import { ListRow, ListRowMatch, ListRowMeta } from './ui/ListRow'
import { SearchField } from './ui/SearchField'
import { EmptyHint } from './ui/Section'
import { StatusDot } from './ui/StatusDot'
import { TextField } from './ui/TextField'

interface Props {
  cwd: string
  onClose: () => void
  /** Opens a session that no tab shows yet; one already open is switched to instead. */
  onLoad: (info: LocalSessionInfo) => void
}

const DOT_STATUS: Record<PastSessionDotState, SessionStatus> = { running: 'running', waiting: 'needs-approval', idle: 'idle' }

/** claude session id → the hosted tab showing it, in this workspace. */
function useOpenPanes(cwd: string): Map<string, string> {
  const views = useProjectViewsStore((s) => s.views)
  return useMemo(() => {
    const panes = new Map<string, string>()
    for (const view of Object.values(views)) {
      if (view.projectPath !== cwd) continue
      for (const c of view.claudeSessions) if (c.claudeSessionId) panes.set(c.claudeSessionId, c.id)
    }
    return panes
  }, [views, cwd])
}

/** The extension's session history: search, then rows with a status dot, the title and a short age; rename on hover. */
export function PastSessionsModal({ cwd, onClose, onLoad }: Props) {
  const [sessions, setSessions] = useState<LocalSessionInfo[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [takingOver, setTakingOver] = useState<TakeOverTarget | null>(null)
  const openPanes = useOpenPanes(cwd)
  const statusByPane = useSessionStatusStore((s) => s.byPane)
  const observed = useObservedStore((s) => s.sessions)

  useEffect(() => {
    let cancelled = false
    window.api.claude
      .listLocalSessions(cwd)
      .then((s) => {
        if (!cancelled) setSessions(s)
      })
      .catch((err) => {
        if (!cancelled) setError((err as Error).message ?? 'failed to list sessions')
      })
    return () => {
      cancelled = true
    }
  }, [cwd])

  const shown = (sessions ?? []).filter((s) => matchesSearch(s, query))
  const now = Date.now()

  const open = (info: LocalSessionInfo) => {
    const paneId = openPanes.get(info.sessionId)
    const inVsCode = !paneId && observed.find((o) => o.sessionId === info.sessionId)
    if (inVsCode) {
      setTakingOver({ workspaceId: inVsCode.workspaceId, sessionId: info.sessionId, title: info.title })
      return
    }
    if (!paneId || !openSession(paneId)) onLoad(info)
    onClose()
  }

  const takeOver = (now: boolean) => {
    if (takingOver) {
      openObserved(takingOver.workspaceId, takingOver.sessionId)
      useTakeOverStore.getState().request(takingOver, { now })
    }
    onClose()
  }

  const retitle = (sessionId: string, change: Pick<LocalSessionInfo, 'title' | 'titleSource'>) =>
    setSessions((list) => (list ?? []).map((s) => (s.sessionId === sessionId ? { ...s, ...change } : s)))

  const rename = async (info: LocalSessionInfo, title: string) => {
    setRenaming(null)
    if (title === info.title) return
    retitle(info.sessionId, { title, titleSource: 'renamed' })
    const paneId = openPanes.get(info.sessionId)
    const result = paneId
      ? await renameHostedSession(paneId, title)
      : await window.api.claude.renameSession({ cwd, sessionId: info.sessionId, title })
    if (result.ok) retitle(info.sessionId, { title: result.title, titleSource: 'renamed' })
    else {
      retitle(info.sessionId, info)
      setError(`Rename failed: ${result.error}`)
    }
  }

  if (takingOver) {
    return (
      <ConfirmDialog
        title="Open in VS Code"
        message={`"${takingOver.title}" is open in VS Code. Opening it here as well would split it into two copies. Take it over instead?`}
        confirmLabel="Take over when done"
        onConfirm={() => takeOver(false)}
        alternative={{ label: 'Take over now', onClick: () => takeOver(true) }}
        onCancel={() => setTakingOver(null)}
      />
    )
  }

  return (
    <Dialog title="Past conversations" onClose={onClose} maxWidth={560}>
      <SearchField label="Search sessions" placeholder="Search sessions…" value={query} onChange={setQuery} />
      <ul className="mt-2" aria-label="Sessions">
        {sessions === null && !error && <EmptyHint>Loading…</EmptyHint>}
        {error && <EmptyHint>{error}</EmptyHint>}
        {sessions !== null && shown.length === 0 && (
          <EmptyHint>{sessions.length === 0 ? 'No sessions yet' : 'No sessions found'}</EmptyHint>
        )}
        {shown.map((s) => {
          if (renaming === s.sessionId) {
            return (
              <li key={s.sessionId} className="px-2 py-0.5">
                <TextField
                  label="Session title"
                  initialValue={s.title}
                  autoFocus
                  submitOnBlur
                  onSubmit={(title) => void rename(s, title)}
                  onCancel={() => setRenaming(null)}
                />
              </li>
            )
          }
          const paneId = openPanes.get(s.sessionId)
          const dot = pastSessionDot({
            hosted: paneId ? (statusByPane[paneId]?.status ?? 'idle') : undefined,
            observed: observed.find((o) => o.sessionId === s.sessionId)?.status
          })
          return (
            <ListRow
              key={s.sessionId}
              onClick={() => open(s)}
              tooltip={s.title}
              actions={
                <IconButton label="Rename session" onClick={() => setRenaming(s.sessionId)}>
                  <Pencil size={12} />
                </IconButton>
              }
            >
              {dot && <StatusDot status={DOT_STATUS[dot.state]} tooltip={dot.tooltip} />}
              <ListRowMatch text={s.title} query={query} />
              <ListRowMeta>{sessionAge(s.modifiedAt, now)}</ListRowMeta>
            </ListRow>
          )
        })}
      </ul>
    </Dialog>
  )
}

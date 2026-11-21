import { useEffect, useMemo, useState } from 'react'
import { useProjectViewsStore } from '../state/projectViewsStore'
import { useSessionStatusStore } from '../state/sessionStatusStore'
import { useWorkspacesStore } from '../state/workspacesStore'
import { NEXT_WAITING_SHORTCUT, openSession, waitingQueue } from '../state/sessionNavigation'
import { RepoIcon } from './RepoIcon'
import { StatusDot } from './ui/StatusDot'
import { STATUS_LABEL } from '../../shared/needsYou'
import { EmptyHint, Section } from './ui/Section'
import { ListRow, ListRowMeta, ListRowText } from './ui/ListRow'
import { SectionHeader } from './ui/SectionHeader'
import { Badge } from './ui/Badge'

function useNow(intervalMs: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

function waitedFor(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'now'
  if (minutes < 60) return `${minutes}m`
  return `${Math.floor(minutes / 60)}h`
}

export function NeedsYouQueue() {
  const views = useProjectViewsStore((s) => s.views)
  const byPane = useSessionStatusStore((s) => s.byPane)
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const now = useNow(30_000)

  const queue = useMemo(() => waitingQueue(views, byPane), [views, byPane])
  const workspaceById = useMemo(() => new Map(workspaces.map((w) => [w.id, w])), [workspaces])

  return (
    <Section label="Needs you">
      <SectionHeader title="needs you">
        <Badge>{NEXT_WAITING_SHORTCUT}</Badge>
      </SectionHeader>
      {queue.length === 0 ? (
        <EmptyHint>nothing waiting</EmptyHint>
      ) : (
        <ul>
          {queue.map(({ paneId, projectId, label, entry }) => {
            const workspace = workspaceById.get(projectId)
            const name = workspace ? workspace.worktreeTag || workspace.name : views[projectId]?.projectName ?? ''
            return (
              <ListRow
                key={paneId}
                onClick={() => openSession(paneId)}
                tooltip={`${STATUS_LABEL[entry.status]} since ${new Date(entry.since).toLocaleTimeString()}`}
              >
                <StatusDot status={entry.status} />
                {workspace && (
                  <RepoIcon repoGroupKey={workspace.repoGroupKey} repoName={workspace.repoName} size="sm" />
                )}
                <ListRowText primary={name} secondary={label} />
                <ListRowMeta>{waitedFor(now - entry.since)}</ListRowMeta>
              </ListRow>
            )
          })}
        </ul>
      )}
    </Section>
  )
}

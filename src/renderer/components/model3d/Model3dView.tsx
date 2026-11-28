import { useEffect, useMemo, useState } from 'react'
import type { Model3dServerState, Model3dView as ServiceView } from '../../../shared/model3d'
import { useTicking } from '../../hooks/useTicking'
import { jobDuration, model3dJobRows, type Model3dJobRow } from '../../state/model3dJobs'
import { useModel3dStore } from '../../state/model3dStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useProjectViewsStore } from '../../state/projectViewsStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { duration } from '../chat/subagents'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { ListItem, ListRowLines, ListRowMeta } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { SidebarLayout } from '../ui/SidebarLayout'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { Toolbar } from '../ui/Toolbar'

const SERVER_LABEL: Record<Model3dServerState, string> = { stopped: 'Stopped', starting: 'Starting', ready: 'Ready', stopping: 'Stopping' }
const DOT: Record<Model3dJobRow['state'], Exclude<TimelineDot, 'none' | 'neutral'>> = {
  queued: 'pending',
  running: 'progress',
  done: 'success',
  failed: 'error',
  cancelled: 'pending'
}

function useJobRows(view: ServiceView | null): Model3dJobRow[] {
  const workspaces = useWorkspacesStore((s) => s.workspaces)
  const profiles = useProfilesStore((s) => s.profiles)
  const views = useProjectViewsStore((s) => s.views)
  return useMemo(() => {
    if (!view) return []
    const sessions = Object.values(views).flatMap((v) => v.claudeSessions.map((c) => ({ paneId: c.id, title: c.title })))
    return model3dJobRows({ view, sessions, workspaces, profiles })
  }, [view, workspaces, profiles, views])
}

/** The 3D service: its server, and every job from every session, newest first. The model viewer takes the right side. */
export function Model3dView() {
  const view = useModel3dStore((s) => s.view)
  const follow = useModel3dStore((s) => s.follow)
  useEffect(follow, [follow])
  useEffect(() => {
    if (!useProfilesStore.getState().loaded) void useProfilesStore.getState().load()
  }, [])
  const rows = useJobRows(view)
  const now = useTicking(rows.some((r) => r.to === null))

  return (
    <SidebarLayout
      width="wide"
      sidebar={
        <>
          <ServiceHeader view={view} />
          {rows.length === 0 ? (
            <EmptyState>No 3D jobs yet.</EmptyState>
          ) : (
            <ul aria-label="3D jobs" className="py-1">
              {rows.map((row) => (
                <JobItem key={row.id} row={row} now={now} />
              ))}
            </ul>
          )}
        </>
      }
    >
      <EmptyState>No model open.</EmptyState>
    </SidebarLayout>
  )
}

function ServiceHeader({ view }: { view: ServiceView | null }) {
  const stopError = useModel3dStore((s) => s.stopError)
  const stopServer = useModel3dStore((s) => s.stopServer)
  const [confirming, setConfirming] = useState(false)
  const server = view?.server ?? 'stopped'
  const outside = server === 'ready' && view?.startedByApp === false
  const running = view?.jobs.some((j) => j.status.state === 'running') ?? false
  const stop = (): void => {
    setConfirming(false)
    void stopServer()
  }
  const note = outside ? `${SERVER_LABEL[server]} · Started outside the app` : SERVER_LABEL[server]
  return (
    <>
      <Toolbar
        actions={
          <Button
            variant="danger"
            disabled={server !== 'ready' || running}
            tooltip={running ? 'A job is running; the server stops once it is done' : 'Stop the 3D server now and free the GPU'}
            onClick={() => (outside ? setConfirming(true) : stop())}
          >
            Stop server
          </Button>
        }
      >
        <HeaderRow title="3D server" note={note} />
      </Toolbar>
      {stopError && (
        <NoticeLine tone="warning" strip>
          {stopError}
        </NoticeLine>
      )}
      {confirming && (
        <ConfirmDialog
          title="Stop server"
          message="This 3D server was started outside Command Center. Stop it anyway? Whatever started it loses it."
          confirmLabel="Stop it"
          onConfirm={stop}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  )
}

function JobItem({ row, now }: { row: Model3dJobRow; now: number }) {
  const where = [row.session, row.workspace, row.account].filter((part): part is string => !!part).join(' · ')
  const line = row.error ?? row.waitReason ?? row.progress
  return (
    <ListItem
      alignWithRows
      tooltip={row.summary}
      detail={line ? <NoticeLine tone={row.error ? 'warning' : 'muted'}>{line}</NoticeLine> : undefined}
    >
      <DotMark dot={DOT[row.state]} />
      <ListRowLines
        primary={
          <>
            <span className="min-w-0 flex-1 truncate">{row.summary}</span>
            <ListRowMeta>{row.stateLabel}</ListRowMeta>
          </>
        }
        secondary={
          <>
            <span className="min-w-0 flex-1 truncate">{where}</span>
            <ListRowMeta>{duration(jobDuration(row, now))}</ListRowMeta>
          </>
        }
      />
    </ListItem>
  )
}

import { useEffect, useMemo, useState } from 'react'
import { Box, Image as ImageIcon } from 'lucide-react'
import type { Model3dOutput, Model3dServerState, Model3dView as ServiceView } from '../../../shared/model3d'
import { fileBaseName } from '../../../shared/fileLinks'
import { useTicking } from '../../hooks/useTicking'
import { jobDuration, model3dJobRows, type Model3dJobRow } from '../../../shared/model3dJobs'
import { useModel3dStore } from '../../state/model3dStore'
import { useProfilesStore } from '../../state/profilesStore'
import { useSessionStatusStore } from '../../state/sessionStatusStore'
import { useToastStore } from '../../state/toastStore'
import { useWorkspacesStore } from '../../state/workspacesStore'
import { duration } from '../chat/subagents'
import { Button } from '../ui/Button'
import { ConfirmDialog } from '../ui/ConfirmDialog'
import { EmptyState } from '../ui/EmptyState'
import { HeaderRow } from '../ui/HeaderRow'
import { ListItem, ListRow, ListRowLines, ListRowMeta, ListRowText } from '../ui/ListRow'
import { NoticeLine } from '../ui/NoticeLine'
import { SidebarLayout } from '../ui/SidebarLayout'
import { DotMark, type TimelineDot } from '../ui/Timeline'
import { Toolbar } from '../ui/Toolbar'
import { ModelViewer } from './ModelViewer'

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
  const byPane = useSessionStatusStore((s) => s.byPane)
  return useMemo(() => {
    if (!view) return []
    const hosted = Object.values(byPane).map((e) => ({ paneId: e.paneId, cwd: e.cwd }))
    return model3dJobRows({ view, hosted, workspaces, profiles })
  }, [view, workspaces, profiles, byPane])
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
      <ModelViewer />
    </SidebarLayout>
  )
}

function ServiceHeader({ view }: { view: ServiceView | null }) {
  const actionError = useModel3dStore((s) => s.actionError)
  const stopServer = useModel3dStore((s) => s.stopServer)
  const openEditor = useModel3dStore((s) => s.openEditor)
  const doneWithEditor = useModel3dStore((s) => s.doneWithEditor)
  const [confirming, setConfirming] = useState(false)
  const server = view?.server ?? 'stopped'
  const outside = server === 'ready' && view?.startedByApp === false
  const jobs = view?.jobs ?? []
  const running = jobs.some((j) => j.status.state === 'running')
  const editorOpen = jobs.some((j) => j.request.kind === 'editor' && j.status.state === 'running')
  const editorQueued = jobs.some((j) => j.request.kind === 'editor' && j.status.state === 'queued')
  const stop = (): void => {
    setConfirming(false)
    void stopServer()
  }
  const note = outside ? `${SERVER_LABEL[server]} · Started outside the app` : SERVER_LABEL[server]
  return (
    <>
      <Toolbar
        actions={
          <>
            {editorOpen ? (
              <Button variant="secondary" tooltip="End the editor turn so queued jobs get the GPU" onClick={() => void doneWithEditor()}>
                Done with editor
              </Button>
            ) : (
              <Button
                variant="secondary"
                disabled={editorQueued}
                tooltip={editorQueued ? 'The editor is queued; it opens in the browser at its GPU turn' : 'Take an editor turn and open the ComfyUI3D editor in the browser'}
                onClick={() => void openEditor()}
              >
                Open editor
              </Button>
            )}
            <Button
              variant="danger"
              disabled={server !== 'ready' || running}
              tooltip={editorOpen ? 'The editor is open; click Done with editor first' : running ? 'A job is running; the server stops once it is done' : 'Stop the 3D server now and free the GPU'}
              onClick={() => (outside ? setConfirming(true) : stop())}
            >
              Stop server
            </Button>
          </>
        }
      >
        <HeaderRow title="3D server" note={note} />
      </Toolbar>
      {actionError && (
        <NoticeLine tone="warning" strip>
          {actionError}
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
  const cancel = useModel3dStore((s) => s.cancel)
  const runAnyway = useModel3dStore((s) => s.runAnyway)
  const where = [row.session, row.workspace, row.account].filter((part): part is string => !!part).join(' · ')
  const line = row.error ?? row.waitReason ?? row.progress
  const models =
    row.state !== 'done' || row.outputs.length + row.pictures.length === 0 ? null : (
      <>
        {row.outputs.length > 0 && <JobModels outputs={row.outputs} />}
        {row.pictures.length > 0 && <JobPictures pictures={row.pictures} />}
      </>
    )
  return (
    <ListItem
      alignWithRows
      tooltip={row.summary}
      detail={
        line || models ? (
          <>
            {line && <NoticeLine tone={row.state === 'failed' || (row.state === 'done' && row.error) ? 'warning' : 'muted'}>{line}</NoticeLine>}
            {models}
          </>
        ) : undefined
      }
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
      {row.state === 'queued' && !row.runAnyway && (
        <Button variant="secondary" onClick={() => void runAnyway(row.id)} tooltip="Run without waiting for the Darkfall cluster, Unity or another job's GPU claim; it still waits its GPU turn">
          Run anyway
        </Button>
      )}
      {(row.state === 'queued' || row.state === 'running') && (
        <Button variant="danger" onClick={() => void cancel(row.id)} tooltip={row.state === 'running' ? 'Stop this job now and free the GPU' : 'Remove this job from the queue'}>
          Cancel
        </Button>
      )}
    </ListItem>
  )
}

async function openPicture(path: string): Promise<void> {
  const error = await window.api.files.openWithSystem(path)
  if (error) useToastStore.getState().show(`Could not open ${path}: ${error}`)
}

/** A prompt job's pictures: approved in the session, an approved one goes to 3D as its own job. */
function JobPictures({ pictures }: { pictures: string[] }) {
  return (
    <>
      <NoticeLine tone="muted">Pictures to approve in the session; an approved one goes to 3D.</NoticeLine>
      <ul aria-label="Pictures">
        {pictures.map((p) => (
          <ListRow key={p} nested tooltip={p} onClick={() => void openPicture(p)}>
            <ImageIcon size={14} strokeWidth={1.75} />
            <ListRowText primary={fileBaseName(p)} />
          </ListRow>
        ))}
      </ul>
    </>
  )
}

const pathKey = (p: string): string => p.replace(/\\/g, '/').toLowerCase()

/** A finished job's models; a click opens one in the viewer. */
function JobModels({ outputs }: { outputs: Model3dOutput[] }) {
  const open = useModel3dStore((s) => s.model)
  const openModel = useModel3dStore((s) => s.openModel)
  return (
    <ul aria-label="Models">
      {outputs.map((o) => (
        <ListRow key={o.glb} nested active={open !== null && pathKey(open.path) === pathKey(o.glb)} tooltip={o.glb} onClick={() => void openModel(o.glb)}>
          <Box size={14} strokeWidth={1.75} />
          <ListRowText primary={fileBaseName(o.glb)} />
        </ListRow>
      ))}
    </ul>
  )
}

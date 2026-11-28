import { MODEL3D_APP_SESSION, type Model3dJobState, type Model3dOutput, type Model3dProgress, type Model3dView } from './model3d'
import { DEFAULT_PROFILE_ID } from './types'

/**
 * The sessions both the 3D view and the main chat's digest know, so both name a job's session the same way: the main
 * process knows a feature session's title (the feature's name) and the folder of every session it hosts, nothing more.
 */
export interface Model3dKnownSessions {
  features: readonly { sessionId: string; name: string }[]
  hosted: readonly { paneId: string; cwd: string }[]
}

export interface Model3dRowsInput extends Model3dKnownSessions {
  view: Model3dView
  workspaces: readonly { name: string; path: string }[]
  profiles: readonly { id: string; name: string; configDir: string }[]
}

export interface Model3dJobRow {
  id: string
  kind: 'generate' | 'editor'
  /** Picture names or prompt and count, then the preset, as gen3d.py wrote it. */
  summary: string
  state: Model3dJobState
  stateLabel: string
  /** See `model3dSessionLabel`. */
  session: string
  workspace: string | null
  account: string
  waitReason: string | null
  /** Run anyway is on: the cluster, Unity and coord checks are skipped. */
  runAnyway: boolean
  progress: string | null
  error: string | null
  outputs: Model3dOutput[]
  /** Epoch ms the duration counts from and, once finished, to. */
  from: number
  to: number | null
}

const STATE_LABEL: Record<Model3dJobState, string> = { queued: 'Queued', running: 'Running', done: 'Done', failed: 'Failed', cancelled: 'Cancelled' }

const pathKey = (p: string): string => p.replace(/^\\\\\?\\/, '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
const isInside = (dir: string, path: string): boolean => path === dir || path.startsWith(`${dir}/`)
const folderName = (p: string): string => p.replace(/[\\/]+$/, '').split(/[\\/]/).at(-1) || p

function progressText(p: Model3dProgress | null): string | null {
  if (!p) return null
  const parts = [
    p.item !== null && p.of !== null ? `Item ${p.item} of ${p.of}` : null,
    p.name,
    p.stage,
    p.step !== null && p.steps !== null ? `step ${p.step}/${p.steps}` : null
  ].filter((part): part is string => !!part)
  return parts.length > 0 ? parts.join(' · ') : null
}

/**
 * Who asked for a job: "Command Center" for Open editor, a feature's name, "A session in <folder>" for another hosted
 * session, "A closed session" for one the app no longer hosts, and "Outside the app" with no session id, naming the
 * cwd folder only when no workspace holds it.
 */
export function model3dSessionLabel(
  request: { sessionId: string; cwd: string },
  known: Model3dKnownSessions,
  inWorkspace: boolean
): string {
  const id = request.sessionId
  if (id === MODEL3D_APP_SESSION) return 'Command Center'
  if (id === '') return inWorkspace ? 'Outside the app' : `Outside the app · ${folderName(request.cwd)}`
  const feature = known.features.find((f) => f.sessionId === id)
  if (feature) return feature.name
  const hosted = known.hosted.find((h) => h.paneId === id)
  return hosted ? `A session in ${folderName(hosted.cwd)}` : 'A closed session'
}

/** The 3D view's job list, newest first, with who asked: the session, its workspace and its account. */
export function model3dJobRows({ view, features, hosted, workspaces, profiles }: Model3dRowsInput): Model3dJobRow[] {
  const known: Model3dKnownSessions = { features, hosted }
  const folders = workspaces.map((w) => ({ name: w.name, key: pathKey(w.path) })).sort((a, b) => b.key.length - a.key.length)
  const account = (configDir: string): string => {
    const found = configDir === '' ? profiles.find((p) => p.id === DEFAULT_PROFILE_ID) : profiles.find((p) => pathKey(p.configDir) === pathKey(configDir))
    return found?.name ?? (configDir || 'Default account')
  }
  return [...view.jobs]
    .sort((a, b) => Date.parse(b.request.submittedAt) - Date.parse(a.request.submittedAt) || b.request.id.localeCompare(a.request.id))
    .map(({ request: r, status: s }) => {
      const cwd = pathKey(r.cwd)
      const fromApp = r.sessionId === MODEL3D_APP_SESSION
      const workspace = fromApp ? null : (folders.find((f) => isInside(f.key, cwd))?.name ?? null)
      return {
        id: r.id,
        kind: r.kind,
        summary: r.kind === 'editor' ? 'Editor turn' : r.summary,
        state: s.state,
        stateLabel: STATE_LABEL[s.state],
        session: model3dSessionLabel(r, known, workspace !== null),
        workspace,
        account: account(r.configDir),
        waitReason: s.state === 'queued' ? s.waitReason : null,
        runAnyway: r.runAnyway,
        progress: s.state === 'running' ? progressText(s.progress) : null,
        // A done batch keeps the lines of the items that failed.
        error: s.state === 'queued' || s.state === 'running' ? null : s.error,
        outputs: s.outputs,
        from: Date.parse(s.startedAt ?? r.submittedAt),
        to: s.endedAt ? Date.parse(s.endedAt) : null
      }
    })
}

/** How long the job has waited or run so far, or took. */
export function jobDuration(row: Pick<Model3dJobRow, 'from' | 'to'>, now: number): number {
  return Math.max(0, (row.to ?? now) - row.from)
}

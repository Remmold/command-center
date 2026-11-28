import type { Model3dJobState, Model3dOutput, Model3dProgress, Model3dView } from '../../shared/model3d'
import { DEFAULT_PROFILE_ID } from '../../shared/types'

export interface Model3dRowsInput {
  view: Model3dView
  sessions: readonly { paneId: string; title: string }[]
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
  /** The session title, or "Outside the app · <cwd folder>". */
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

/** The 3D view's job list, newest first, with who asked: the session, its workspace and its account. */
export function model3dJobRows({ view, sessions, workspaces, profiles }: Model3dRowsInput): Model3dJobRow[] {
  const titles = new Map(sessions.map((s) => [s.paneId, s.title]))
  const folders = workspaces.map((w) => ({ name: w.name, key: pathKey(w.path) })).sort((a, b) => b.key.length - a.key.length)
  const account = (configDir: string): string => {
    const found = configDir === '' ? profiles.find((p) => p.id === DEFAULT_PROFILE_ID) : profiles.find((p) => pathKey(p.configDir) === pathKey(configDir))
    return found?.name ?? (configDir || 'Default account')
  }
  return [...view.jobs]
    .sort((a, b) => Date.parse(b.request.submittedAt) - Date.parse(a.request.submittedAt) || b.request.id.localeCompare(a.request.id))
    .map(({ request: r, status: s }) => {
      const cwd = pathKey(r.cwd)
      const title = r.sessionId ? titles.get(r.sessionId) : undefined
      return {
        id: r.id,
        kind: r.kind,
        summary: r.summary,
        state: s.state,
        stateLabel: STATE_LABEL[s.state],
        session: title ?? `Outside the app · ${folderName(r.cwd)}`,
        workspace: folders.find((f) => isInside(f.key, cwd))?.name ?? null,
        account: account(r.configDir),
        waitReason: s.state === 'queued' ? s.waitReason : null,
        runAnyway: r.runAnyway,
        progress: s.state === 'running' ? progressText(s.progress) : null,
        error: s.state === 'failed' || s.state === 'cancelled' ? s.error : null,
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

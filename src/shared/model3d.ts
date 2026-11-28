/** The 3D service's hand-off files (ADR 0011): requests from gen3d.py, statuses and service.json from the app. */

export type Model3dJobKind = 'generate' | 'editor'
export type Model3dJobState = 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
export type Model3dServerState = 'stopped' | 'starting' | 'ready' | 'stopping'
export type Model3dStage = 'picture' | 'mask' | 'generate' | 'render'

/** `<id>.request.json`, written once by gen3d.py. */
export interface Model3dRequest {
  id: string
  kind: Model3dJobKind
  /** gen3d.py's original arguments. */
  argv: string[]
  cwd: string
  /** The submitter's interpreter. */
  python: string
  /** gen3d.py's path. */
  script: string
  waiterPid: number
  /** False for `--no-wait`. */
  wait: boolean
  /** The app's session id (`CC_SESSION_ID`); empty outside the app. */
  sessionId: string
  /** `CLAUDE_CONFIG_DIR`; empty for the default account. */
  configDir: string
  /** ISO 8601. */
  submittedAt: string
  summary: string
  /** Today's `--force`: skips the cluster, Unity and coord-claim checks, never the GPU turn. */
  runAnyway: boolean
}

export interface Model3dProgress {
  item: number | null
  of: number | null
  name: string | null
  stage: Model3dStage | null
  step: number | null
  steps: number | null
}

export interface Model3dOutput {
  glb: string
  sheet?: string
  json?: string
}

/** `<id>.status.json`, written only by the app, atomically. Times are ISO 8601. */
export interface Model3dStatus {
  state: Model3dJobState
  waitReason: string | null
  progress: Model3dProgress | null
  startedAt: string | null
  endedAt: string | null
  error: string | null
  outputs: Model3dOutput[]
  /** A prompt job's pictures, made for approval before any goes to 3D; absent when there are none. */
  pictures?: string[]
}

/** `service.json`, written only by the app. */
export interface Model3dServiceFile {
  pid: number
  heartbeatAt: string
  server: Model3dServerState
  startedByApp: boolean
}

export interface Model3dJob {
  request: Model3dRequest
  status: Model3dStatus
}

export interface Model3dView {
  server: Model3dServerState
  startedByApp: boolean
  /** Oldest first, by `submittedAt`. */
  jobs: Model3dJob[]
}

/** The answer to Stop server, Cancel or Run anyway: done, or why it was refused. */
export type Model3dActionResult = { ok: true } | { ok: false; error: string }

/** The `sessionId` of a request the app made itself: Open editor in the 3D view. */
export const MODEL3D_APP_SESSION = 'command-center'

export const MODEL3D_JOB_ID = /^[A-Za-z0-9_-]{1,80}$/

const isString = (v: unknown): v is string => typeof v === 'string'

/** The request in `raw`, or why it is not one. */
export function parseModel3dRequest(raw: unknown): { ok: true; request: Model3dRequest } | { ok: false; error: string } {
  if (typeof raw !== 'object' || raw === null) return { ok: false, error: 'not an object' }
  const r = raw as Record<string, unknown>
  if (!isString(r.id) || !MODEL3D_JOB_ID.test(r.id)) return { ok: false, error: 'id is not a plain name' }
  if (r.kind !== 'generate' && r.kind !== 'editor') return { ok: false, error: 'kind is not generate or editor' }
  if (!Array.isArray(r.argv) || !r.argv.every(isString)) return { ok: false, error: 'argv is not a list of strings' }
  for (const key of ['cwd', 'python', 'script', 'summary', 'submittedAt'] as const) {
    if (!isString(r[key])) return { ok: false, error: `${key} is not a string` }
  }
  if (Number.isNaN(Date.parse(r.submittedAt as string))) return { ok: false, error: 'submittedAt is not a time' }
  if (typeof r.waiterPid !== 'number' || !Number.isInteger(r.waiterPid)) return { ok: false, error: 'waiterPid is not a number' }
  if (typeof r.wait !== 'boolean') return { ok: false, error: 'wait is not true or false' }
  return {
    ok: true,
    request: {
      id: r.id,
      kind: r.kind,
      argv: r.argv as string[],
      cwd: r.cwd as string,
      python: r.python as string,
      script: r.script as string,
      waiterPid: r.waiterPid,
      wait: r.wait,
      sessionId: isString(r.sessionId) ? r.sessionId : '',
      configDir: isString(r.configDir) ? r.configDir : '',
      submittedAt: r.submittedAt as string,
      summary: r.summary as string,
      runAnyway: r.runAnyway === true
    }
  }
}

/** A model's budget figures as gen3d.py's `<name>.json` gives them; null where the file has no such value. */
export interface Model3dStats {
  tris: number | null
  /** Each texture as `<width>x<height>`. */
  textures: string[] | null
  preset: string | null
  seconds: number | null
  /** The bounding box, x by y by z. */
  size: [number, number, number] | null
}

/** A `.glb` the 3D view may show: its URL and its sheet's went through the media gate. */
export interface Model3dModel {
  path: string
  /** The file name without `.glb`. */
  name: string
  url: string
  sheetUrl: string | null
  /** From `<name>.json`; all null without one. */
  stats: Model3dStats
}

export type Model3dOpenResult = { ok: true; model: Model3dModel } | { ok: false; error: string }

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0
const isLength = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0

/** The stats in a parsed `<name>.json`; a value of the wrong shape counts as missing. */
export function parseModel3dStats(raw: unknown): Model3dStats {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {}
  const size = r.size_xyz
  return {
    tris: isCount(r.tris) ? r.tris : null,
    textures: Array.isArray(r.textures) && r.textures.every((t) => typeof t === 'string' && /^\d+x\d+$/.test(t)) ? (r.textures as string[]) : null,
    preset: isString(r.preset) && r.preset !== '' ? r.preset : null,
    seconds: isLength(r.seconds) ? r.seconds : null,
    size: Array.isArray(size) && size.length === 3 && size.every(isLength) ? [size[0], size[1], size[2]] : null
  }
}

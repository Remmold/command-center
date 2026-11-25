/** One thing a health check or a drift check reports about one context file (ADR 0005). */
export interface Finding {
  /** F1, F2… (drift) or H-… (health). */
  id: string
  /** Absolute path of the file it concerns. */
  path: string
  verdict: 'stale' | 'wrong' | 'duplicate' | 'structural'
  severity: 'problem' | 'note'
  claim: string
  evidence: string
  fix: string
  status: 'open' | 'applied' | 'skipped'
}

export interface FindingsStep {
  id: string
  title: string
  status: 'pending' | 'running' | 'done'
}

/** One run's file in the app data folder under `drift-checks/`, written only by the run's session (ADR 0005). */
export interface FindingsRun {
  version: 1
  /** Later: 'board', 'general'. */
  check: 'drift'
  scope: 'project' | 'account' | 'cross-project'
  runId: string
  /** The id of the hosted session (its chat pane in Work) the run was sent to, not the CLI's own session id. */
  sessionId: string
  /** ISO. */
  startedAt: string
  accountFolder: string
  /** Covered workspace paths. */
  workspaces: string[]
  steps: FindingsStep[]
  findings: Finding[]
  done: boolean
}

export const FINDINGS_VERSION = 1

/** The app's write of a run's skeleton, the one write it makes to a run file. */
export type SkeletonResult = { ok: true; file: string } | { ok: false; error: string }

/** What a read of a run file leaves to show. */
export interface FindingsRead {
  /** The last good parse; null when there has been none. */
  run: FindingsRun | null
  /** The file is half-written or breaks the schema: "run is writing…". */
  writing: boolean
  /** Why the file was refused (an unknown version). */
  note: string | null
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const isString = (v: unknown): v is string => typeof v === 'string'
const oneOf =
  <T extends string>(...words: T[]) =>
  (v: unknown): v is T =>
    words.includes(v as T)
const arrayOf =
  <T>(each: (v: unknown) => v is T) =>
  (v: unknown): v is T[] =>
    Array.isArray(v) && v.every(each)

const isFinding = (v: unknown): v is Finding =>
  isObject(v) &&
  isString(v.id) &&
  isString(v.path) &&
  oneOf('stale', 'wrong', 'duplicate', 'structural')(v.verdict) &&
  oneOf('problem', 'note')(v.severity) &&
  isString(v.claim) &&
  isString(v.evidence) &&
  isString(v.fix) &&
  oneOf('open', 'applied', 'skipped')(v.status)

const isStep = (v: unknown): v is FindingsStep => isObject(v) && isString(v.id) && isString(v.title) && oneOf('pending', 'running', 'done')(v.status)

const isRun = (v: Record<string, unknown>): v is Record<string, unknown> & FindingsRun =>
  v.check === 'drift' &&
  oneOf('project', 'account', 'cross-project')(v.scope) &&
  isString(v.runId) &&
  isString(v.sessionId) &&
  isString(v.startedAt) &&
  isString(v.accountFolder) &&
  arrayOf(isString)(v.workspaces) &&
  arrayOf(isStep)(v.steps) &&
  arrayOf(isFinding)(v.findings) &&
  typeof v.done === 'boolean'

/**
 * How a path is compared: the report's paths and the ones a session writes may differ in case and slashes on Windows,
 * where both name the same file.
 */
export function pathKey(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

/** The path is inside the folder, compared by `pathKey`. */
export const isUnder = (path: string, folder: string): boolean => pathKey(path).startsWith(`${pathKey(folder)}/`)

const startOf = (run: FindingsRun): number => {
  const at = Date.parse(run.startedAt)
  return Number.isNaN(at) ? -Infinity : at
}

const newest = <T extends { run: FindingsRun }>(entries: readonly T[]): T | null =>
  entries.reduce<T | null>((best, e) => (best === null || startOf(e.run) > startOf(best.run) ? e : best), null)

/**
 * The runs a workspace's map shows: the newest run covering it, and the newest account or cross-project run of its
 * account folder (for account-file findings) when that is another, newer run.
 */
export function latestRuns<T extends { run: FindingsRun }>(entries: readonly T[], workspacePath: string, accountFolder: string): { covering: T | null; account: T | null } {
  const workspace = pathKey(workspacePath)
  const folder = pathKey(accountFolder)
  const covering = newest(entries.filter((e) => e.run.workspaces.some((w) => pathKey(w) === workspace)))
  const account = newest(entries.filter((e) => e.run.scope !== 'project' && pathKey(e.run.accountFolder) === folder))
  // A covering run checks the account files too, so an account run no newer than it has nothing newer to add.
  const newer = account !== null && account !== covering && (covering === null || startOf(account.run) > startOf(covering.run))
  return { covering, account: newer ? account : null }
}

/** A run file as the app wrote it, before its session wrote anything: the only state in which the app may remove it (ADR 0005). */
export const isBareSkeleton = (run: Pick<FindingsRun, 'steps' | 'findings' | 'done'>): boolean => run.steps.length === 0 && run.findings.length === 0 && !run.done

/**
 * Whether a run can still finish: one not done whose session (a hosted pane id) is no longer in the app is stopped,
 * as nothing will write its file again.
 */
export function runState(run: Pick<FindingsRun, 'sessionId' | 'done'>, live: readonly string[]): 'done' | 'running' | 'stopped' {
  if (run.done) return 'done'
  return live.includes(run.sessionId) ? 'running' : 'stopped'
}

/** A finding as the map shows it; a health finding has none of the extras. */
export interface ShownFinding extends Finding {
  /** The drift run it came from. */
  runId?: string
  /** Still open, and its file was modified after the run started: "file changed since". */
  stale?: boolean
  /** It concerns a file in the account folder, so it affects every workspace of the account. */
  accountWide?: boolean
}

/** Which of a shown run's findings the map takes: account-file findings come from the newer of the two shown runs only. */
export type ShownFiles = 'all' | 'account' | 'not-account'

/** A run's findings for the map. `modified` holds each finding file's modified time by `pathKey` (null when it is gone). */
export function shownFindings(run: FindingsRun, modified: Readonly<Record<string, number | null>>, accountFolder: string, files: ShownFiles): ShownFinding[] {
  const started = startOf(run)
  return run.findings
    .map((f) => {
      const changed = modified[pathKey(f.path)] ?? null
      return { ...f, runId: run.runId, stale: f.status === 'open' && changed !== null && Number.isFinite(started) && changed > started, accountWide: isUnder(f.path, accountFolder) }
    })
    .filter((f) => files === 'all' || f.accountWide === (files === 'account'))
}

/** A run the map shows, as main last read its file. */
export interface DriftRunView {
  file: string
  run: FindingsRun
  /** The file is being rewritten: `run` is the last good parse. */
  writing: boolean
  /** Why the file's latest content was refused; `run` is then the last good parse. */
  note: string | null
  /** Not done, and its session is gone from the app, so nothing will finish it. */
  stopped: boolean
  /** 'account' for a run shown for its account-file findings only; the covering run then shows the rest of its own. */
  files: ShownFiles
  /** Each finding file's modified time in ms by `pathKey`; null when it is gone. */
  modified: Record<string, number | null>
}

/** The drift checks a workspace's map shows: the run covering it first, then its account's run. */
export interface DriftChecksView {
  runs: DriftRunView[]
}

/** Reads a run file tolerantly: a half-written or invalid file keeps `last`; an unknown version is refused with a note. */
export function readFindingsRun(text: string, last: FindingsRun | null): FindingsRead {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { run: last, writing: true, note: null }
  }
  if (!isObject(parsed)) return { run: last, writing: true, note: null }
  if (parsed.version !== FINDINGS_VERSION) {
    return { run: last, writing: false, note: `This run file is version ${String(parsed.version)}; this app reads version ${FINDINGS_VERSION} only.` }
  }
  if (!isRun(parsed)) return { run: last, writing: true, note: null }
  return { run: parsed, writing: false, note: null }
}

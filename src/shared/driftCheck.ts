import type { ContextItem, ContextItemKind, ContextReport } from './context'
import { FINDINGS_VERSION, type FindingsRun } from './findings'

export type DriftCheckKind = FindingsRun['scope']

export interface DriftCheckProject {
  name: string
  report: ContextReport
}

export interface DriftCheckInput {
  kind: DriftCheckKind
  /** The workspace the drift-check session runs in; nothing inside it is added. */
  sessionPath: string
  /** `items` is the account layer of a report on this account; only the account's own files are named from it, and only in account and cross-project runs. */
  account: { name: string; folder: string; items: readonly ContextItem[] }
  projects: readonly DriftCheckProject[]
  /** The run's findings file in the app's data folder (ADR 0005). */
  findingsFile: string
}

export interface DriftCheck {
  prompt: string
  /** Folders the prompt names outside the session workspace, for `--add-dir`. */
  addDirs: string[]
}

const PROJECT_FILE_KINDS: ReadonlySet<ContextItemKind> = new Set(['claude-md', 'subfolder-claude-md', 'skill', 'agent', 'command'])
const ACCOUNT_FILE_KINDS: ReadonlySet<ContextItemKind> = new Set(['claude-md', 'skill', 'agent', 'command', 'settings'])

/** Case and slashes folded on a drive path, so two spellings of one Windows folder compare equal. */
function pathKey(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(slashed) ? slashed.toLowerCase() : slashed
}

const isInside = (dir: string, path: string): boolean => pathKey(path) === pathKey(dir) || pathKey(path).startsWith(`${pathKey(dir)}/`)

function withImports(item: ContextItem): string[] {
  return [...(item.path ? [item.path] : []), ...item.children.flatMap(withImports)]
}

const isPlugin = (item: ContextItem): boolean => item.source.startsWith('plugin:')

function ownFiles(items: readonly ContextItem[], kinds: ReadonlySet<ContextItemKind>): string[] {
  return items.filter((i) => kinds.has(i.kind) && !isPlugin(i)).flatMap((i) => (i.kind === 'claude-md' ? withImports(i) : i.path ? [i.path] : []))
}

function projectSection({ name, report }: DriftCheckProject): string {
  const files = [...ownFiles([...report.layers.repo, ...report.layers.local], PROJECT_FILE_KINDS), ...report.docs]
  return [`Project "${name}" (${report.workspacePath}):`, ...files.map((path) => `- ${path}`), `- Memory folder: ${report.memoryFolder}`].join('\n')
}

function accountSection({ name, folder, items }: DriftCheckInput['account']): string {
  return [`Account "${name}" files (${folder}):`, ...ownFiles(items, ACCOUNT_FILE_KINDS).map((path) => `- ${path}`)].join('\n')
}

const FINDINGS_SCHEMA = [
  '{',
  `  "version": ${FINDINGS_VERSION}, "check": "drift", "scope": string, "runId": string, "sessionId": string, "startedAt": string, "accountFolder": string, "workspaces": [string],`,
  '  "steps": [{ "id": string, "title": string, "status": "pending" | "running" | "done" }],',
  '  "findings": [{',
  '    "id": "F1", "path": string,',
  '    "verdict": "stale" | "wrong" | "duplicate" | "structural",',
  '    "severity": "problem" | "note",',
  '    "claim": string, "evidence": string, "fix": string,',
  '    "status": "open" | "applied" | "skipped"',
  '  }],',
  '  "done": boolean',
  '}'
].join('\n')

function findingsSection(file: string): string {
  return [
    `Findings file: ${file}`,
    'Record the run there, never in the chat. The app has written every field but "steps" and "findings"; keep those other fields as they are, rewrite the whole file as valid JSON each time, and keep this schema:',
    FINDINGS_SCHEMA
  ].join('\n')
}

function steps(projects: number, account: string | null): string[] {
  const subagents =
    projects === 0
      ? 'Start one subagent for the account files.'
      : `Start one subagent per project listed above${account ? ', plus one for the account files' : ''}, all in parallel.`
  return [
    'Before any subagent starts, set "steps" in the findings file: one step per subagent, each with a short title and "status": "pending".',
    `${subagents} Each reads every file on its list. Set a subagent's step to "running" as it starts.`,
    'Each subagent checks every concrete claim against the current code and git history: paths, commands, scripts, names, versions, "currently…" statements, links, [[memory]] links, and each MEMORY.md index line against the memory files. It also flags duplicates between files and contradictions between layers. Subagents report; they edit nothing.',
    'As each subagent reports, set its step to "done" and append its findings: ids F1, F2… across the run, "path" the absolute path of the file, a verdict of stale, wrong, duplicate or structural, "severity" "note" for what is worth knowing but no problem, the claim, its evidence (file and line, command output or commit), the proposed fix, and "status": "open". Leave out what is fine.',
    'Once every step is done, set "done": true. Edit no context file until I ask you to fix findings.',
    'When I ask you to fix findings, apply only those and set each one\'s "status" to "applied" or "skipped" in the findings file.',
    ...(account ? [`The account files are shared by every workspace of the account "${account}": say so in the fix of every finding on one of them.`] : [])
  ]
}

/** The folder a file is in, in the file's own separators. */
function folderOf(file: string): string {
  return file.replace(/[\\/][^\\/]*$/, '')
}

/** The prepared prompt of a drift check and the folders its session may read and write without asking. */
export function buildDriftCheck(input: DriftCheckInput): DriftCheck {
  const withAccount = input.kind !== 'project'
  const prompt = [
    'Drift check: check that the context files below still match the code, and record what has drifted in the findings file.',
    ...input.projects.map(projectSection),
    ...(withAccount ? [accountSection(input.account)] : []),
    findingsSection(input.findingsFile),
    ['Steps:', ...steps(input.projects.length, withAccount ? input.account.name : null).map((step, i) => `${i + 1}. ${step}`)].join('\n')
  ].join('\n\n')
  const named = [
    ...input.projects.flatMap((p) => [p.report.workspacePath, p.report.memoryFolder]),
    ...(withAccount ? [input.account.folder] : []),
    folderOf(input.findingsFile)
  ]
  const addDirs: string[] = []
  for (const dir of named) {
    if (isInside(input.sessionPath, dir) || addDirs.some((d) => pathKey(d) === pathKey(dir))) continue
    addDirs.push(dir)
  }
  return { prompt, addDirs }
}

export interface SkeletonInput extends Pick<DriftCheckInput, 'kind' | 'account' | 'projects'> {
  runId: string
  /** The hosted session the run is sent to. */
  sessionId: string
  startedAt: Date
}

/** What the app writes before the session starts: everything but the session's steps and findings. */
export function driftRunSkeleton({ kind, account, projects, runId, sessionId, startedAt }: SkeletonInput): FindingsRun {
  return {
    version: FINDINGS_VERSION,
    check: 'drift',
    scope: kind,
    runId,
    sessionId,
    startedAt: startedAt.toISOString(),
    accountFolder: account.folder,
    workspaces: projects.map((p) => p.report.workspacePath),
    steps: [],
    findings: [],
    done: false
  }
}

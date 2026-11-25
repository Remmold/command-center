import type { ContextItem, ContextItemKind, ContextReport } from './context'

export type CleanupKind = 'project'

export interface CleanupProject {
  name: string
  report: ContextReport
}

export interface CleanupInput {
  kind: CleanupKind
  /** The workspace the cleanup session runs in; nothing inside it is added. */
  sessionPath: string
  /** `items` is the account layer of a report on this account; only the account's own files are named from it. */
  account: { name: string; folder: string; items: readonly ContextItem[] }
  projects: readonly CleanupProject[]
}

export interface Cleanup {
  prompt: string
  /** Folders the prompt names outside the session workspace, for `--add-dir`. */
  addDirs: string[]
}

const PROJECT_FILE_KINDS: ReadonlySet<ContextItemKind> = new Set(['claude-md', 'subfolder-claude-md', 'skill', 'agent', 'command'])

/** Case and slashes folded on a drive path, so two spellings of one Windows folder compare equal. */
function pathKey(path: string): string {
  const slashed = path.replace(/\\/g, '/').replace(/\/+$/, '')
  return /^[a-z]:/i.test(slashed) ? slashed.toLowerCase() : slashed
}

const isInside = (dir: string, path: string): boolean => pathKey(path) === pathKey(dir) || pathKey(path).startsWith(`${pathKey(dir)}/`)

function withImports(item: ContextItem): string[] {
  return [...(item.path ? [item.path] : []), ...item.children.flatMap(withImports)]
}

/** The repo and local layers' own files: plugin items, servers and settings are left out. */
function projectFiles(report: ContextReport): string[] {
  const own = [...report.layers.repo, ...report.layers.local].filter((i) => PROJECT_FILE_KINDS.has(i.kind) && !i.source.startsWith('plugin:'))
  return [...own.flatMap((i) => (i.kind === 'claude-md' ? withImports(i) : i.path ? [i.path] : [])), ...report.docs]
}

function projectSection({ name, report }: CleanupProject): string {
  const lines = [`Project "${name}" (${report.workspacePath}):`, ...projectFiles(report).map((path) => `- ${path}`), `- Memory folder: ${report.memoryFolder}`]
  return lines.join('\n')
}

const STEPS = [
  'Start one subagent per project listed above, all in parallel. Each reads every file on its list.',
  'Each subagent checks every concrete claim against the current code and git history: paths, commands, scripts, names, versions, "currently…" statements, links, [[memory]] links, and each MEMORY.md index line against the memory files. It also flags duplicates between files and contradictions between layers. Subagents report; they edit nothing.',
  'Merge their results into one findings table per file, one row per finding, each marked stale, wrong, duplicate, structural or fine, with its evidence (file and line, command output or commit).',
  'Then ask me through clickable questions which fixes to apply. Edit nothing before I answer.'
]

/** The prepared prompt of a context cleanup and the folders its session may read without asking. */
export function buildCleanup(input: CleanupInput): Cleanup {
  const prompt = [
    'Context cleanup: check that the context files below still match the code, and report what has drifted.',
    ...input.projects.map(projectSection),
    ['Steps:', ...STEPS.map((step, i) => `${i + 1}. ${step}`)].join('\n')
  ].join('\n\n')
  const named = input.projects.map((p) => p.report.memoryFolder)
  const addDirs: string[] = []
  for (const dir of named) {
    if (isInside(input.sessionPath, dir) || addDirs.some((d) => pathKey(d) === pathKey(dir))) continue
    addDirs.push(dir)
  }
  return { prompt, addDirs }
}

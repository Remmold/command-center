import { allowReply, denyReply, type AllowReply, type DenyReply, type ToolInput } from './approval'
import { pathKey } from './findings'
import { dirnameOf } from './pathParts'

/** The pane the main chat always runs in. */
export const MAIN_CHAT_PANE_ID = 'main-chat'

export const MAIN_CHAT_TITLE = 'Main chat'

/** The only tools the main chat's process is given; `--tools` removes every other built-in from the model's reach. */
export const READ_ONLY_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob']

/** Named again as denied, so a later widening of the list above still cannot hand these over. */
const NEVER_TOOLS: readonly string[] = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Task', 'Agent', 'Skill', 'WebFetch', 'WebSearch']

export interface MainChatLaunch {
  /** Folders the process may read without asking. */
  addDirs: string[]
  /** Extra CLI arguments, in `--flag=value` form so no variadic flag swallows a later one. The setting source is cut to the app's own folder: a user-level allow rule such as Read(*) would approve reads before the app's boundary sees them. */
  cliArgs: string[]
}

/** What the main chat's process starts with: read access to the digest's folder and every feature worktree, and read tools only. */
export function mainChatLaunch(digestFile: string, worktrees: readonly string[]): MainChatLaunch {
  const addDirs: string[] = []
  for (const dir of [dirnameOf(digestFile), ...worktrees]) if (!addDirs.some((d) => pathKey(d) === pathKey(dir))) addDirs.push(dir)
  return {
    addDirs,
    cliArgs: [`--tools=${READ_ONLY_TOOLS.join(',')}`, `--disallowedTools=${NEVER_TOOLS.join(',')}`, '--strict-mcp-config', '--setting-sources=project']
  }
}

/** The first prompt: where the digest is, and that this chat answers only. */
export function mainChatFirstPrompt(digestFile: string): string {
  return [
    'You are the main chat of Command Center. You answer questions about the features the user is building; you never act.',
    `The feature digest, kept current by the app, is at ${digestFile}. Read it before answering.`,
    "Each feature in it has a Read: line naming its .scratch folder: read that feature's spec, tickets and progress notes when asked for detail.",
    'You can only read files. You cannot write, run commands, or start, stop or complete a feature; say so if asked to.'
  ].join('\n')
}

const PATH_FIELDS = ['file_path', 'path']
/** The field of each tool that holds a file glob; Grep's `pattern` is a regex over contents, not a path. */
const GLOB_FIELD: Record<string, string> = { Glob: 'pattern', Grep: 'glob' }

/** Turns a path into its real location (links, short names and case settled), or null when it cannot be resolved. */
export type PathResolver = (path: string) => Promise<string | null>

const BACKSLASH = String.fromCharCode(92)

const leavesItsFolder = (pattern: string): boolean => pattern.includes('..') || /^[A-Za-z]:|^~/.test(pattern) || pattern.startsWith('/') || pattern.startsWith(BACKSLASH)

const inside = (path: string, root: string): boolean => pathKey(path) === pathKey(root) || pathKey(path).startsWith(`${pathKey(root)}/`)

/**
 * Answers a permission request from the main chat's process. A read tool is allowed only when every path it names resolves,
 * through `resolve`, to somewhere inside one of `roots` (also resolved), which covers a worktree made after the process started.
 * A Glob pattern or Grep glob that climbs or is absolute is refused, and so is a call naming no path.
 */
export async function mainChatReply(toolName: string, input: ToolInput, roots: readonly string[], resolve: PathResolver): Promise<AllowReply | DenyReply> {
  if (!READ_ONLY_TOOLS.includes(toolName)) return denyReply('The main chat answers only; it cannot use this tool.')
  const refused = denyReply("The main chat reads only the feature digest and the features' worktrees.")
  const paths = PATH_FIELDS.flatMap((f) => (typeof input[f] === 'string' ? [input[f] as string] : []))
  const glob = input[GLOB_FIELD[toolName] ?? '']
  if (paths.length === 0 || (typeof glob === 'string' && leavesItsFolder(glob))) return refused
  const real = (await Promise.all(roots.map(resolve))).filter((r): r is string => r !== null)
  for (const path of paths) {
    const where = await resolve(path)
    if (where === null || !real.some((r) => inside(where, r))) return refused
  }
  return allowReply(input)
}

/** What the renderer needs to host the main chat. */
export interface MainChatInfo {
  /** The workspace record for the main chat's folder; main keeps it out of every workspace list. */
  workspaceId: string
  /** The fixed folder the chat runs in. */
  path: string
  /** The account it runs on: the one chosen in Settings, else Default. */
  profileId: string
  /** The Claude session to resume, once known. */
  claudeSessionId?: string
  digestFile: string
}

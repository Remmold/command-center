import { allowReply, denyReply, type AllowReply, type DenyReply, type ToolInput } from './approval'
import { MAIN_CHAT_INSTRUCTIONS } from './mainChatActions'
import { isUnder, pathKey } from './findings'
import { dirnameOf } from './pathParts'

/** The pane the main chat always runs in. */
export const MAIN_CHAT_PANE_ID = 'main-chat'

export const MAIN_CHAT_TITLE = 'Main chat'

/** The only tools the main chat's process is given; `--tools` removes every other built-in from the model's reach. */
export const READ_ONLY_TOOLS: readonly string[] = ['Read', 'Grep', 'Glob']

/** Named again as denied, so a later widening of the list above still cannot hand these over. */
const NEVER_TOOLS: readonly string[] = ['Write', 'Edit', 'MultiEdit', 'NotebookEdit', 'Bash', 'PowerShell', 'Task', 'Agent', 'Skill', 'WebFetch', 'WebSearch']

/** Everything the main chat may read, gathered afresh for each launch and each permission request. */
export interface MainChatScope {
  digestFile: string
  /** The folder the chat runs in. */
  chatDir: string
  worktrees: readonly string[]
  /** Every workspace folder the New feature dialog lists. */
  workspaces: readonly string[]
  testFlowsFolder: string
  /** Never read, even inside a root, unless that root lies strictly inside it: the app's data folder and every account's Claude folder. */
  fenced: readonly string[]
}

const inside = (path: string, root: string): boolean => pathKey(path) === pathKey(root) || isUnder(path, root)

/** True when `path`, read through `root`, touches a fenced folder that `root` itself is not inside. */
const fencedOff = (path: string, root: string, fenced: readonly string[]): boolean =>
  fenced.some((f) => (inside(path, f) || inside(f, path)) && !isUnder(root, f))

function unique(paths: readonly string[]): string[] {
  const out: string[] = []
  for (const p of paths) if (p !== '' && !out.some((o) => pathKey(o) === pathKey(p))) out.push(p)
  return out
}

/** The folders the main chat reads: the digest's folder, its own folder, the feature worktrees, the workspaces and the test flows. */
export function mainChatRoots(scope: MainChatScope): string[] {
  return unique([dirnameOf(scope.digestFile), scope.chatDir, ...scope.worktrees, ...scope.workspaces, scope.testFlowsFolder])
}

export interface MainChatLaunch {
  /** Folders the process may read without asking. */
  addDirs: string[]
  /** Extra CLI arguments, in `--flag=value` form so no variadic flag swallows a later one. The setting source is cut to the app's own folder: a user-level allow rule such as Read(*) would approve reads before the app's boundary sees them. */
  cliArgs: string[]
}

/**
 * What the main chat's process starts with: every root but its own folder as an added directory, read tools only, and its
 * role and action rules appended to its system prompt (so a resumed chat has them too). A root that holds a fenced folder is
 * left out of the added directories, so each read there still comes to the app's check.
 */
export function mainChatLaunch(scope: MainChatScope): MainChatLaunch {
  const addDirs = mainChatRoots(scope).filter((r) => pathKey(r) !== pathKey(scope.chatDir) && !fencedOff(r, r, scope.fenced))
  return {
    addDirs,
    cliArgs: [
      `--tools=${READ_ONLY_TOOLS.join(',')}`,
      `--disallowedTools=${NEVER_TOOLS.join(',')}`,
      '--strict-mcp-config',
      '--setting-sources=project',
      `--append-system-prompt=${MAIN_CHAT_INSTRUCTIONS}`
    ]
  }
}

/** The feature a Go just started, named in the first prompt of the fresh chat that follows it. */
export interface JustStarted {
  name: string
  /** The workspace label the proposal named. */
  workspace: string
}

/** The first prompt: where the digest is, and, after a Go, which feature was just started. */
export function mainChatFirstPrompt(digestFile: string, justStarted?: JustStarted): string {
  return [
    'You are the main chat of Command Center. Your instructions describe your role: plan with the user, read their workspaces to ground each plan, and act through the cards your action blocks become.',
    `The feature digest, kept current by the app, is at ${digestFile}. Read it before answering: its Workspaces section names every workspace with its folder, and each feature has a Read: line naming its .scratch folder with its spec, tickets and progress notes.`,
    ...(justStarted
      ? [
          `Just started: the feature ${justStarted.name} in workspace ${justStarted.workspace}, from the plan agreed in the previous main chat. Its starting brief holds that plan, and it continues in its own session, which the Open session button at the top of this chat opens. Tell the user in one line where to continue.`
        ]
      : [])
  ].join('\n')
}

const PATH_FIELDS = ['file_path', 'path']
/** The field of each tool that holds a file glob; Grep's `pattern` is a regex over contents, not a path. */
const GLOB_FIELD: Record<string, string> = { Glob: 'pattern', Grep: 'glob' }

/** Turns a path into its real location (links, short names and case settled), or null when it cannot be resolved. */
export type PathResolver = (path: string) => Promise<string | null>

const BACKSLASH = String.fromCharCode(92)

const leavesItsFolder = (pattern: string): boolean => pattern.includes('..') || /^[A-Za-z]:|^~/.test(pattern) || pattern.startsWith('/') || pattern.startsWith(BACKSLASH)

const resolvedAll = async (paths: readonly string[], resolve: PathResolver): Promise<string[]> =>
  (await Promise.all(paths.map(resolve))).filter((r): r is string => r !== null)

/**
 * Answers a permission request from the main chat's process. A read tool is allowed only when every path it names resolves,
 * through `resolve`, to somewhere inside one of the scope's roots (also resolved) and touches no fenced folder that root is
 * not inside. The scope is read per request, so a worktree or workspace added after the process started is covered.
 * A Glob pattern or Grep glob that climbs or is absolute is refused, and so is a call naming no path.
 */
export async function mainChatReply(toolName: string, input: ToolInput, scope: MainChatScope, resolve: PathResolver): Promise<AllowReply | DenyReply> {
  if (!READ_ONLY_TOOLS.includes(toolName)) return denyReply('The main chat only reads; it has no tool for this. Offer a card instead.')
  const refused = denyReply('The main chat reads only the feature digest, the workspaces, the feature worktrees and the test flows.')
  const paths = PATH_FIELDS.flatMap((f) => (typeof input[f] === 'string' ? [input[f] as string] : []))
  const glob = input[GLOB_FIELD[toolName] ?? '']
  if (paths.length === 0 || (typeof glob === 'string' && leavesItsFolder(glob))) return refused
  const [roots, fenced] = await Promise.all([resolvedAll(mainChatRoots(scope), resolve), resolvedAll(scope.fenced, resolve)])
  for (const path of paths) {
    const where = await resolve(path)
    if (where === null || !roots.some((r) => inside(where, r) && !fencedOff(where, r, fenced))) return refused
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
  /** The feature whose Go started the current conversation; the chat shows a notice with its Open session. */
  justStarted?: JustStarted
}

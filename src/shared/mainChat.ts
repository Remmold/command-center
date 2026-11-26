import { allowReply, denyReply, type AllowReply, type DenyReply, type ToolInput } from './approval'
import { pathKey } from './findings'

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
  /** Extra CLI arguments, in `--flag=value` form so no variadic flag swallows a later one. */
  cliArgs: string[]
}

const dirOf = (file: string): string => file.replace(/[\\/][^\\/]*$/, '')

/** What the main chat's process starts with: read access to the digest's folder and every feature worktree, and read tools only. */
export function mainChatLaunch(digestFile: string, worktrees: readonly string[]): MainChatLaunch {
  const addDirs: string[] = []
  for (const dir of [dirOf(digestFile), ...worktrees]) if (!addDirs.some((d) => pathKey(d) === pathKey(dir))) addDirs.push(dir)
  return {
    addDirs,
    cliArgs: [`--tools=${READ_ONLY_TOOLS.join(',')}`, `--disallowedTools=${NEVER_TOOLS.join(',')}`, '--strict-mcp-config']
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

/**
 * Answers a permission request from the main chat's process. A read tool inside one of `roots` is allowed, which covers a
 * worktree made after the process started; everything else is refused.
 */
export function mainChatReply(toolName: string, input: ToolInput, roots: readonly string[]): AllowReply | DenyReply {
  if (!READ_ONLY_TOOLS.includes(toolName)) return denyReply('The main chat answers only; it cannot use this tool.')
  const paths = PATH_FIELDS.flatMap((f) => (typeof input[f] === 'string' ? [input[f] as string] : []))
  const inside = (p: string): boolean => roots.some((r) => pathKey(p) === pathKey(r) || pathKey(p).startsWith(`${pathKey(r)}/`))
  if (!paths.every(inside) || (paths.length === 0 && toolName === 'Read')) return denyReply('The main chat reads only the feature digest and the features\' worktrees.')
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

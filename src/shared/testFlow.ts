import type { ChatItem } from './chatItems'

export interface TestFlowPick {
  /** The configured folder joined with the file's name, as the session wrote the name. */
  path: string
  source: 'session' | 'repo'
}

export interface TestFlowInput {
  items: readonly ChatItem[]
  folder: string
  repoName: string
}

const FILE_TOOLS = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])
const SHELL_TOOLS = new Set(['Bash', 'PowerShell'])

/** Lower-cased with forward slashes, no repeated or trailing slash, and Git Bash's `/c/` read as `c:/`. */
function comparable(path: string): string {
  const slashed = path.replace(/[\\/]+/g, '/').replace(/^\/([a-z])(?=\/|$)/i, '$1:')
  return (slashed.length > 1 ? slashed.replace(/\/$/, '') : slashed).toLowerCase()
}

/** A name that counts as a test flow: markdown or HTML, never a standing command list. */
function countsAsTestFlow(name: string): boolean {
  return /\.(?:md|html)$/i.test(name) && !/-commands\.(?:md|html)$/i.test(name)
}

function joinFolder(folder: string, name: string): string {
  const sep = folder.includes('/') && !folder.includes('\\') ? '/' : '\\'
  return folder.replace(/[\\/]+$/, '') + sep + name
}

/** The name of `path` when it sits directly in the folder and counts as a test flow. */
function nameInFolder(path: string, folderKey: string): string | null {
  const key = comparable(path)
  const cut = key.lastIndexOf('/')
  if (cut === -1 || key.slice(0, cut) !== folderKey) return null
  const name = path.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? ''
  return countsAsTestFlow(name) ? name : null
}

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Matches the folder in a command, written with either slash or as Git Bash's `/c/`, followed by one file name. */
function folderPattern(folder: string): RegExp {
  const parts = folder.split(/[\\/]+/).filter(Boolean)
  const drive = /^([a-z]):$/i.exec(parts[0] ?? '')
  const head = drive ? `(?:${drive[1]}:|/${drive[1]})` : escapeRegExp(parts[0] ?? '')
  const lead = folder.startsWith('/') || folder.startsWith('\\') ? '[\\\\/]+' : ''
  const body = [head, ...parts.slice(1).map(escapeRegExp)].join('[\\\\/]+')
  return new RegExp(`${lead}${body}[\\\\/]+([^\\s"'\`\\\\/<>|;&()*?]+)(?![^\\s"'\`<>|;&()])`, 'gi')
}

function lastNameInCommand(command: string, pattern: RegExp): string | null {
  let found: string | null = null
  for (const match of command.matchAll(pattern)) if (countsAsTestFlow(match[1])) found = match[1]
  return found
}

function writtenName(block: { name?: unknown; input?: unknown }, folderKey: string, pattern: RegExp): string | null {
  const name = String(block.name)
  const input = (block.input ?? {}) as { file_path?: unknown; command?: unknown }
  if (FILE_TOOLS.has(name)) return typeof input.file_path === 'string' ? nameInFolder(input.file_path, folderKey) : null
  if (SHELL_TOOLS.has(name) && typeof input.command === 'string') return lastNameInCommand(input.command, pattern)
  return null
}

/**
 * The session's test-flow candidates before twin resolution: each file it wrote in the folder once, newest write first,
 * then the one named after its repo. The first that exists is the session's test flow.
 */
export function findTestFlows({ items, folder, repoName }: TestFlowInput): TestFlowPick[] {
  if (!folder.trim()) return []
  const folderKey = comparable(folder)
  const pattern = folderPattern(folder)
  const picks: TestFlowPick[] = []
  const seen = new Set<string>()
  const add = (name: string, source: TestFlowPick['source']): void => {
    if (seen.has(name.toLowerCase())) return
    seen.add(name.toLowerCase())
    picks.push({ path: joinFolder(folder, name), source })
  }
  for (let i = items.length - 1; i >= 0; i--) {
    const item = items[i]
    if (item.kind !== 'assistant') continue
    for (let b = item.content.length - 1; b >= 0; b--) {
      const block = item.content[b]
      if (block.type !== 'tool_use') continue
      const name = writtenName(block as { name?: unknown; input?: unknown }, folderKey, pattern)
      if (name) add(name, 'session')
    }
  }
  if (repoName) add(`${repoName}.md`, 'repo')
  return picks
}

/** Serves the HTML files directly in the test-flows folder, read-only. */
export const TEST_FLOW_SCHEME = 'cc-test-flow'

export const DEFAULT_TEST_FLOWS_FOLDER = 'C:\\projects\\test-flows'

/** The focused Work session's test flow as the main window publishes it for the pop-out. */
export interface TestFlowFocus {
  picks: TestFlowPick[]
  folder: string
  repoName: string
  title: string
}

/** The query flag that loads the renderer as the pop-out test-flow window. */
export const TEST_FLOW_WINDOW_QUERY = { mode: 'test-flow' } as const

/** What the Test tab shows for a picked file; `name` is the file shown, the twin when there is one. */
export type TestFlowView = { found: false; kind?: never } | { kind: 'html'; name: string; url: string } | { kind: 'md'; name: string; text: string }

/** The repo name a workspace's test flow is named after: its repo identity's, else its folder's. */
export function repoNameFor(workspaces: readonly { path: string; repoName: string }[], cwd: string | undefined): string {
  if (!cwd) return ''
  const key = comparable(cwd)
  const workspace = workspaces.find((w) => comparable(w.path) === key)
  return workspace?.repoName || (cwd.replace(/[\\/]+$/, '').split(/[\\/]/).pop() ?? '')
}

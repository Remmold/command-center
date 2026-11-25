/** What the Context view lists, read from files on disk "as configured"; never from Claude. */

export type ContextItemKind =
  | 'claude-md'
  | 'import'
  | 'subfolder-claude-md'
  | 'memory-index'
  | 'memory-file'
  | 'skill'
  | 'agent'
  | 'command'
  | 'mcp-server'
  | 'plugin'
  | 'settings'
  | 'hook'

export type ContextSource = 'account' | 'repo' | 'project-entry' | `plugin:${string}`

export type ContextLayerName = 'account' | 'repo' | 'local'

export interface ContextItem {
  kind: ContextItemKind
  label: string
  /** A short line beside the label: what an MCP server or a hook runs, what a settings layer holds, "slash command only". */
  note: string | null
  /** Absolute; null for an item without a file of its own. */
  path: string | null
  source: ContextSource
  /** Estimated tokens it adds to every start; null when it doesn't count at start. */
  tokens: number | null
  /** The file is not there (an import that can't be found); it counts 0. */
  missing: boolean
  sharedWithDefault: boolean
  /** Why the app won't write it; null when it may. */
  readOnly: string | null
  /** The files it imports. */
  children: ContextItem[]
}

export type CreatableContextFile = 'repo-claude-md' | 'claude-local-md'

export interface ContextReport {
  workspacePath: string
  accountFolder: string
  /** Where this workspace's memory lives in the profile, whether or not it exists yet. */
  memoryFolder: string
  /** False when the workspace folder is gone; the layers are then empty. */
  folderExists: boolean
  layers: Record<ContextLayerName, ContextItem[]>
  /** The sum of every counted item, imports included. */
  startTotal: number
  missing: CreatableContextFile[]
  /** GLOSSARY.md, docs/adr and docs/agents, those the workspace has. */
  docs: string[]
}

export type ContextFileResult = { ok: true } | { ok: false; error: string }

export type ContextFileText = { ok: true; content: string } | { ok: false; error: string }

/** Where a creatable file goes, inside the workspace folder. */
export const CREATABLE_NAMES: Record<CreatableContextFile, string> = {
  'repo-claude-md': 'CLAUDE.md',
  'claude-local-md': 'CLAUDE.local.md'
}

export const ADOPTED_READ_ONLY = 'adopted folder: the app never writes here'

/** Characters ÷ 4, rounded. */
export function estimateTokens(text: string): number {
  return Math.round(text.length / 4)
}

/** "~N" below a thousand, "~N.Nk" from there. */
export function formatTokens(tokens: number): string {
  return tokens < 1000 ? `~${tokens}` : `~${(tokens / 1000).toFixed(1)}k`
}

function unquote(value: string): string {
  if (/^".*"$/s.test(value)) {
    try {
      return JSON.parse(value) as string
    } catch {
      return value.slice(1, -1)
    }
  }
  return /^'.*'$/s.test(value) ? value.slice(1, -1).replace(/''/g, "'") : value
}

/** The top-level keys of a file's YAML frontmatter: plain, quoted, folded (`>`) and literal (`|`) values. */
export function frontmatter(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return {}
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  const body = lines.slice(1, end === -1 ? lines.length : end)
  const out: Record<string, string> = {}
  for (let i = 0; i < body.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(body[i])
    if (!m) continue
    const more: string[] = []
    while (i + 1 < body.length && (/^\s/.test(body[i + 1]) || body[i + 1] === '')) more.push(body[++i].trim())
    while (more.length && more[more.length - 1] === '') more.pop()
    const value = m[2].trim()
    if (/^[>|][+-]?$/.test(value)) out[m[1]] = more.join(value.startsWith('|') ? '\n' : ' ')
    else out[m[1]] = unquote([value, ...more].filter(Boolean).join(' '))
  }
  return out
}

/** A markdown file split into its leading `---` frontmatter and the rest; no frontmatter unless the block is closed and holds a key. */
export function splitFrontmatter(text: string): { meta: Record<string, string>; body: string } {
  const lines = text.split(/\r?\n/)
  const end = lines[0]?.trim() === '---' ? lines.findIndex((line, i) => i > 0 && line.trim() === '---') : -1
  const meta = end === -1 ? {} : frontmatter(text)
  if (Object.keys(meta).length === 0) return { meta, body: text }
  return { meta, body: lines.slice(end + 1).join('\n') }
}

export type KindGroupName = 'claude-md' | 'memory' | 'skills' | 'agents' | 'commands' | 'mcp-servers' | 'plugins' | 'settings'

export interface KindGroup {
  group: KindGroupName
  items: ContextItem[]
  count: number
  /** Counted tokens of its items, imports included; null when nothing in it counts. */
  tokens: number | null
}

const KIND_GROUPS: readonly (readonly [KindGroupName, readonly ContextItemKind[]])[] = [
  ['claude-md', ['claude-md', 'subfolder-claude-md']],
  ['memory', ['memory-index', 'memory-file']],
  ['skills', ['skill']],
  ['agents', ['agent']],
  ['commands', ['command']],
  ['mcp-servers', ['mcp-server']],
  ['plugins', ['plugin']],
  ['settings', ['settings', 'hook']]
]

export const KIND_GROUP_TITLES: Record<KindGroupName, string> = {
  'claude-md': 'CLAUDE.md',
  memory: 'Memory',
  skills: 'Skills',
  agents: 'Agents',
  commands: 'Commands',
  'mcp-servers': 'MCP servers',
  plugins: 'Plugins',
  settings: 'Settings & hooks'
}

/** The tokens the items add at start, imports included; null when none of them counts. */
export function countedTokens(items: readonly ContextItem[]): number | null {
  return items.reduce<number | null>((sum, i) => {
    const own = [i.tokens, countedTokens(i.children)].filter((n): n is number => n !== null)
    return own.length === 0 ? sum : (sum ?? 0) + own.reduce((a, b) => a + b, 0)
  }, null)
}

/** One layer's items in the fixed kind order, empty kinds left out. */
export function groupByKind(items: readonly ContextItem[]): KindGroup[] {
  return KIND_GROUPS.flatMap(([group, kinds]) => {
    const members = items.filter((i) => kinds.includes(i.kind))
    return members.length === 0 ? [] : [{ group, items: members, count: members.length, tokens: countedTokens(members) }]
  })
}

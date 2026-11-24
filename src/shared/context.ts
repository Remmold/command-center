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
  /** False when the workspace folder is gone; the layers are then empty. */
  folderExists: boolean
  layers: Record<ContextLayerName, ContextItem[]>
  /** The sum of every counted item, imports included. */
  startTotal: number
  missing: CreatableContextFile[]
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

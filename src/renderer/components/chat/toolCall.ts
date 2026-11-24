import type { ChatItem, ToolResultItem } from './types'

export interface ToolCallTitle {
  name: string
  target: string
  /** The target is Claude's own words (a shell call's description), shown as text rather than code. */
  prose?: true
}

function normalize(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+$/, '')
}

/** A path relative to the workspace when it lies inside it, otherwise the path as given. */
export function workspaceRelative(path: string, cwd: string | undefined): string {
  if (!cwd) return path
  const file = normalize(path)
  const root = normalize(cwd)
  if (file.toLowerCase().startsWith(root.toLowerCase() + '/')) return file.slice(root.length + 1)
  return path
}

function stringField(o: Record<string, unknown>, key: string): string | undefined {
  const v = o[key]
  return typeof v === 'string' && v !== '' ? v : undefined
}

function targetOf(o: Record<string, unknown>, cwd: string | undefined): string {
  const file = stringField(o, 'file_path') ?? stringField(o, 'notebook_path')
  if (file) return workspaceRelative(file, cwd)
  const command = stringField(o, 'command')
  if (command) return command.trim().split('\n')[0]
  const pattern = stringField(o, 'pattern')
  if (pattern) {
    const folder = stringField(o, 'path')
    return folder ? `${pattern} in ${workspaceRelative(folder, cwd)}` : pattern
  }
  return stringField(o, 'description') ?? stringField(o, 'url') ?? stringField(o, 'query') ?? stringField(o, 'to') ?? ''
}

/** The one-line "ToolName target" shown on a collapsed tool call row. */
export function toolCallTitle(name: string, input: unknown, cwd: string | undefined): ToolCallTitle {
  const o = input && typeof input === 'object' ? (input as Record<string, unknown>) : {}
  const description = stringField(o, 'command') && stringField(o, 'description')
  if (description) return { name, target: description, prose: true }
  return { name, target: targetOf(o, cwd) }
}

export interface ToolPairs {
  resultFor: Map<string, ToolResultItem>
  /** True when the result is drawn inside its call's row instead of on its own. */
  isPaired(result: ToolResultItem): boolean
}

export function pairToolResults(items: ChatItem[]): ToolPairs {
  const callIds = new Set<string>()
  for (const item of items) {
    if (item.kind !== 'assistant') continue
    for (const block of item.content) {
      if (block.type === 'tool_use' && typeof block.id === 'string') callIds.add(block.id)
    }
  }
  const resultFor = new Map<string, ToolResultItem>()
  for (const item of items) {
    if (item.kind === 'tool_result' && callIds.has(item.toolUseId)) resultFor.set(item.toolUseId, item)
  }
  return { resultFor, isPaired: (result) => resultFor.get(result.toolUseId) === result }
}

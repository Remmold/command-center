// The extension's @-mention text rules (`uFt`, `pae`, `jTt`, `MIn`, `$Tt`, `Yae` in webview/index.js).

export interface MentionTrigger {
  start: number
  end: number
  /** The text after `@`. */
  query: string
}

export type MentionKind = 'file' | 'directory'

/** The `@word` the caret is in, when it starts the input or follows whitespace. */
export function mentionTrigger(value: string, caret: number): MentionTrigger | null {
  for (const match of value.matchAll(/(?:^|\s)@[^\s]*/gm)) {
    const start = value.indexOf('@', match.index)
    const end = match.index + match[0].length
    if (caret >= start && caret <= end) return { start, end, query: value.slice(start + 1, end) }
  }
  return null
}

function readsAsOtherMention(path: string): boolean {
  return path.includes('"') || /[\s。、？！]@/.test(path) || /@terminal:|@browser(?=[:\s]|$)/.test(path)
}

function needsNoQuotes(path: string): boolean {
  if (/[\s:]/.test(path) || path.startsWith('agent-') || path === 'browser') return false
  let end = path.length
  while (end > 0 && path[end - 1] === '/') end--
  const trimmed = path.slice(0, end)
  if (!/[A-Za-z0-9_]$/.test(trimmed)) return false
  return trimmed === path || !/^[\\/]/.test(path)
}

/** `@path`, `@"path with spaces"`, or null for a path the CLI would read as a different mention. */
export function mentionText(path: string, _kind: MentionKind): string | null {
  if (path === '' || readsAsOtherMention(path) || path.includes('#') || /^\s|\s$/.test(path)) return null
  if (path === '~' || path.startsWith('~/') || path.endsWith(' (agent)')) return null
  return needsNoQuotes(path) ? `@${path}` : `@"${path}"`
}

export function unmentionableNotice(path: string): string {
  return `This path can't be @-mentioned, because Claude Code would read it as a different mention: ${path}`
}

/**
 * Puts `mention` in place of the typed `@word` (the extension's `wAe`): a space always follows it, and a second one
 * when `space` is set. `space` is false only when Tab drills into a folder, leaving the caret before the space.
 */
export function insertMention(value: string, trigger: MentionTrigger, mention: string, space: boolean): { value: string; caret: number } {
  const inserted = space ? mention + ' ' : mention
  const rest = value.slice(trigger.end)
  return {
    value: value.slice(0, trigger.start) + inserted + (rest.startsWith(' ') ? '' : ' ') + rest,
    caret: trigger.start + inserted.length
  }
}

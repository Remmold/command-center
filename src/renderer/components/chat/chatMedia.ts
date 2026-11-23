import { fileBaseName, linkedFile } from '../../../shared/fileLinks'
import type { ContentBlock } from '../../../shared/types'
import { MEDIA_TYPES, mediaKind, type MediaKind } from '../../../shared/media'
import type { PromptAttachment } from './attachments'
import type { ChatItem } from './types'

export type MediaSource = { kind: 'file'; path: string } | { kind: 'data'; dataUrl: string }

/** An image or video the chat touched, at its newest mention. */
export interface MediaEntry {
  /** The resolved path, lower-cased with forward slashes, or the attachment's own id. */
  key: string
  kind: MediaKind
  name: string
  at?: number
  /** The top-level item to scroll to. */
  messageId: string
  source: MediaSource
}

/** An image or video the user pasted or dropped into a prompt: pasted images and video sheets as data in memory, a video by its path. */
export interface MediaAttachment {
  id: string
  /** The user item of the prompt that sent it. */
  messageId: string
  name: string
  kind: MediaKind
  source: MediaSource
}

export interface MediaInput {
  items: readonly ChatItem[]
  cwd: string | undefined
  attachments?: readonly MediaAttachment[]
}

const FILE_TOOLS = new Set(['Read', 'Write', 'Edit', 'MultiEdit'])

function isAbsolute(path: string): boolean {
  return /^[a-z]:[\\/]/i.test(path) || path.startsWith('/') || path.startsWith('\\')
}

/** As `path.resolve` against the workspace, without touching the disk; null for a relative path with no workspace. */
export function resolveMediaPath(cwd: string | undefined, path: string): string | null {
  if (!isAbsolute(path) && !cwd) return null
  const joined = isAbsolute(path) ? path : `${cwd}/${path}`
  const windows = /^[a-z]:/i.test(joined) || joined.includes('\\')
  const parts: string[] = []
  for (const part of joined.split(/[\\/]+/)) {
    if (part === '.' || (part === '' && parts.length > 0)) continue
    if (part === '..') {
      if (parts.length > 1) parts.pop()
      continue
    }
    parts.push(part)
  }
  const sep = windows ? '\\' : '/'
  const out = parts.join(sep)
  return /^[a-z]:$/i.test(out) ? out + sep : out || sep
}

type Mention = { path: string; messageId: string; at?: number } | { attachment: MediaAttachment; at?: number }

const EXTENSIONS = Object.keys(MEDIA_TYPES).join('|')
const BARE_PATH = new RegExp(
  String.raw`(?<![\w.\-\\/:])(?:[a-z]:[\\/]|\.{1,2}[\\/]|[\\/])?(?:[\w.\-+@~]+[\\/])*[\w\-+@~][\w.\-+@~]*\.(?:${EXTENSIONS})(?!\w|\.\w)`,
  'gi'
)
const MARKDOWN_LINK = /\[[^\]]*\]\(([^)\s]+)\)/g
const WEB_ADDRESS = /\b(?:[a-z][\w+.-]*:\/\/|www\.)\S+/gi

const blank = (match: string): string => ' '.repeat(match.length)

/** Paths in prose, in the order they appear: Markdown file links first read as the transcript opens them, then bare paths. */
function pathsInText(text: string): string[] {
  const found: Array<{ at: number; path: string }> = []
  const rest = text
    .replace(MARKDOWN_LINK, (match: string, href: string, offset: number) => {
      const file = linkedFile(href)
      if (file) found.push({ at: offset, path: file.path })
      return blank(match)
    })
    .replace(WEB_ADDRESS, blank)
  for (const match of rest.matchAll(BARE_PATH)) found.push({ at: match.index ?? 0, path: match[0] })
  return found.sort((a, b) => a.at - b.at).map((f) => f.path)
}

// Items are immutable once stored, so a long chat scans only the prose of items it has not seen.
const proseCache = new WeakMap<ChatItem, string[]>()

function prosePaths(item: ChatItem, text: () => string): string[] {
  let paths = proseCache.get(item)
  if (!paths) {
    paths = pathsInText(text())
    proseCache.set(item, paths)
  }
  return paths
}

function replyText(content: readonly ContentBlock[]): string {
  return content.map((b) => (b.type === 'text' && typeof b.text === 'string' ? b.text : '')).join('\n')
}

function outputText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content
    .map((block: unknown) => (block && typeof (block as { text?: unknown }).text === 'string' ? (block as { text: string }).text : ''))
    .join('\n')
}

/** Mentions in chat order, each pointing at the top-level message its row is drawn in. */
function mentionsOf(items: readonly ChatItem[], attachments: readonly MediaAttachment[]): Mention[] {
  const owner = new Map<string, string>()
  const found: Mention[] = []
  const add = (paths: readonly string[], messageId: string, at: number | undefined) => {
    for (const path of paths) found.push({ path, messageId, at })
  }
  for (const item of items) {
    if (item.kind === 'user') {
      for (const attachment of attachments) if (attachment.messageId === item.id) found.push({ attachment, at: item.at })
    } else if (item.kind === 'assistant') {
      const top = (item.parentToolUseId && owner.get(item.parentToolUseId)) || item.id
      add(prosePaths(item, () => replyText(item.content)), top, item.at)
      for (const block of item.content) {
        if (block.type !== 'tool_use') continue
        if (typeof block.id === 'string') owner.set(block.id, top)
        const file = (block.input as { file_path?: unknown } | undefined)?.file_path
        if (FILE_TOOLS.has(String(block.name)) && typeof file === 'string') add([file], top, item.at)
      }
    } else if (item.kind === 'tool_result') {
      const top = owner.get(item.toolUseId) ?? (item.parentToolUseId && owner.get(item.parentToolUseId)) ?? item.id
      add(prosePaths(item, () => outputText(item.content)), top, item.at)
    }
  }
  return found
}

/** Every image and video the chat named, newest first, one per resolved path at its newest mention. */
export function collectMedia({ items, cwd, attachments = [] }: MediaInput): MediaEntry[] {
  const byKey = new Map<string, MediaEntry>()
  for (const mention of mentionsOf(items, attachments)) {
    if ('attachment' in mention) {
      const { id, messageId, name, kind, source } = mention.attachment
      byKey.set(id, { key: id, kind, name, at: mention.at, messageId, source })
      continue
    }
    const kind = mediaKind(mention.path)
    const path = kind && resolveMediaPath(cwd, mention.path)
    if (!kind || !path) continue
    const key = path.replace(/\\/g, '/').toLowerCase()
    byKey.delete(key)
    byKey.set(key, { key, kind, name: fileBaseName(path), at: mention.at, messageId: mention.messageId, source: { kind: 'file', path } })
  }
  return [...byKey.values()].reverse()
}

/** A sent prompt's images and videos, as the Media panel keeps them: a video's original, then its contact sheets. */
export function mediaAttachments(messageId: string, attachments: readonly PromptAttachment[]): MediaAttachment[] {
  return attachments.flatMap((a, i): MediaAttachment[] => {
    const id = `${messageId}#${i}`
    if (a.kind === 'image') return [{ id, messageId, name: a.name, kind: 'image', source: { kind: 'data', dataUrl: `data:${a.mediaType};base64,${a.base64}` } }]
    if (a.kind !== 'video') return []
    const sheets = a.sheets.map((s, n): MediaAttachment => ({
      id: `${id}.${n + 1}`,
      messageId,
      name: `${a.name} · sheet ${n + 1}`,
      kind: 'image',
      source: { kind: 'data', dataUrl: `data:image/jpeg;base64,${s.base64}` }
    }))
    const kind = a.sourcePath ? mediaKind(a.sourcePath) : null
    const original: MediaAttachment[] = a.sourcePath && kind ? [{ id, messageId, name: a.name, kind, source: { kind: 'file', path: a.sourcePath } }] : []
    // Newest first in the panel, so the original is added last to lead its sheets.
    return [...sheets, ...original]
  })
}

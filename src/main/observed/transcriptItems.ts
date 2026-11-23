import { StringDecoder } from 'node:string_decoder'
import type { ChatItem, ToolResultItem } from '../../shared/chatItems'
import type { ClaudeAssistantEvent, ContentBlock } from '../../shared/types'

const MAX_TOOL_RESULT_CHARS = 20_000
const SHORTENED = '… (shortened)'
const SHOWN_BLOCKS: ReadonlySet<string> = new Set(['text', 'tool_use', 'thinking'])
const WHOLE_TAG_RE = /^<([a-z][\w-]*)>[\s\S]*<\/\1>$/
const COMMAND_NAME_RE = /<command-name>([\s\S]*?)<\/command-name>/
const COMMAND_ARGS_RE = /<command-args>([\s\S]*?)<\/command-args>/

interface TranscriptLine {
  type?: string
  subtype?: string
  compactMetadata?: { trigger?: unknown; preTokens?: unknown }
  uuid?: string
  isMeta?: boolean
  isSidechain?: boolean
  isCompactSummary?: boolean
  timestamp?: string
  message?: { id?: string; role?: string; model?: string; content?: unknown }
}

export interface TranscriptParser {
  /** Feed the next bytes of a transcript; returns the chat items of every line completed by them. */
  push(chunk: Buffer | string): ChatItem[]
}

/** `sidechain` reads a subagent's own file, where every line is a sidechain one. */
export function createTranscriptParser(sidechain = false): TranscriptParser {
  const decoder = new StringDecoder('utf8')
  const read = lineReader(sidechain)
  let pending = ''
  return {
    push(chunk) {
      pending += typeof chunk === 'string' ? chunk : decoder.write(chunk)
      const lines = pending.split('\n')
      pending = lines.pop() ?? ''
      return lines.flatMap(read)
    }
  }
}

/** Whole transcript lines in order, e.g. a tail read in one go. */
export function transcriptLinesToItems(lines: string[], sidechain = false): ChatItem[] {
  return lines.flatMap(lineReader(sidechain))
}

/**
 * Reads lines in order. The CLI writes each block of a reply as its own line when the block ends, so a thinking
 * block took from the previous timed line (the request, a tool result or the prompt) to its own line.
 */
function lineReader(sidechain: boolean): (raw: string) => ChatItem[] {
  let previousAt: number | undefined
  return (raw) => {
    if (!raw.trim()) return []
    let line: TranscriptLine
    try {
      line = JSON.parse(raw) as TranscriptLine
    } catch {
      return []
    }
    const parsed = line.timestamp ? Date.parse(line.timestamp) : NaN
    const at = Number.isFinite(parsed) ? parsed : undefined
    const startedAt = previousAt
    if (at !== undefined) previousAt = at
    const items = toItems(line, sidechain)
    if (at === undefined) return items
    const timed = items.map((item) => ({ ...item, at }))
    return startedAt !== undefined && at > startedAt ? timed.map((item) => timeThinking(item, at - startedAt)) : timed
  }
}

function timeThinking(item: ChatItem, ms: number): ChatItem {
  if (item.kind !== 'assistant') return item
  const thinkingMs: Record<number, number> = {}
  item.content.forEach((block, i) => {
    if (block.type === 'thinking') thinkingMs[i] = ms
  })
  return Object.keys(thinkingMs).length > 0 ? { ...item, thinkingMs } : item
}

function toItems(line: TranscriptLine, sidechain: boolean): ChatItem[] {
  if (!line.uuid || (line.isSidechain && !sidechain) || line.isMeta) return []
  if (line.type === 'system' && line.subtype === 'compact_boundary') return [compactBoundary(line.uuid, line)]
  if (!line.message) return []
  return line.type === 'user' ? userItems(line.uuid, line) : line.type === 'assistant' ? assistantItems(line.uuid, line) : []
}

function compactBoundary(id: string, line: TranscriptLine): ChatItem {
  const meta = line.compactMetadata
  const trigger = typeof meta?.trigger === 'string' ? meta.trigger : 'auto'
  const preTokens = typeof meta?.preTokens === 'number' ? meta.preTokens : 0
  return { kind: 'system', id, text: '', compact: { trigger, preTokens } }
}

function userItems(id: string, line: TranscriptLine): ChatItem[] {
  const content = line.message?.content
  if (line.isCompactSummary) return [{ kind: 'system', id, text: '', compactSummary: summaryText(content) }]
  if (typeof content === 'string') {
    const text = promptText(content)
    return text ? [{ kind: 'user', id, text }] : []
  }
  if (!Array.isArray(content)) return []
  const results: ToolResultItem[] = []
  const texts: string[] = []
  content.forEach((block: ContentBlock, i) => {
    if (block.type === 'tool_result') {
      const b = block as { tool_use_id: string; content: unknown; is_error?: boolean }
      results.push({
        kind: 'tool_result',
        id: `${id}:${i}`,
        toolUseId: b.tool_use_id,
        content: shorten(b.content),
        isError: b.is_error
      })
    } else if (block.type === 'text') {
      const text = promptText((block as { text: string }).text)
      if (text) texts.push(text)
    }
  })
  const items: ChatItem[] = []
  if (texts.length > 0) items.push({ kind: 'user', id, text: texts.join('\n\n') })
  return [...items, ...results]
}

function summaryText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.flatMap((b: ContentBlock) => (b.type === 'text' && typeof b.text === 'string' ? [b.text] : [])).join('\n\n')
}

/** The extension wraps context it adds to a prompt in tags; only the typed text is shown. */
function promptText(text: string): string | null {
  const trimmed = text.trim()
  const command = COMMAND_NAME_RE.exec(trimmed)
  if (command) {
    const args = COMMAND_ARGS_RE.exec(trimmed)?.[1].trim()
    return args ? `${command[1].trim()} ${args}` : command[1].trim()
  }
  if (!trimmed || WHOLE_TAG_RE.test(trimmed)) return null
  return trimmed
}

function assistantItems(id: string, line: TranscriptLine): ChatItem[] {
  const content = line.message?.content
  if (!Array.isArray(content)) return []
  const shown = (content as ContentBlock[]).filter((b) => SHOWN_BLOCKS.has(b.type))
  if (shown.length === 0) return []
  const raw: ClaudeAssistantEvent = {
    type: 'assistant',
    message: { id: line.message?.id ?? id, role: 'assistant', content: shown, model: line.message?.model }
  }
  return [{ kind: 'assistant', id, content: shown, raw }]
}

function shorten(content: unknown): unknown {
  if (typeof content === 'string') return shortenText(content)
  if (!Array.isArray(content)) return content
  return content.map((block: ContentBlock) => {
    if (block.type === 'text') return { type: 'text', text: shortenText((block as { text: string }).text) }
    if (block.type === 'image') return { type: 'text', text: '[image]' }
    return block
  })
}

function shortenText(text: string): string {
  return text.length > MAX_TOOL_RESULT_CHARS ? text.slice(0, MAX_TOOL_RESULT_CHARS) + SHORTENED : text
}

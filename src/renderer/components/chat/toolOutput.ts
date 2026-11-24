export interface ReadableOutput {
  text: string
  /** The whole JSON pretty-printed, for the "raw" toggle; only a JSON object or array has one. */
  raw?: string
}

const READABLE_FIELDS = ['message', 'result'] as const

function parseJson(text: string): unknown {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return undefined
  try {
    return JSON.parse(trimmed)
  } catch {
    return undefined
  }
}

/** A tool result as text to read: a JSON result's `message` or `result` field, else the text as it came. */
export function readableOutput(text: string): ReadableOutput {
  const json = parseJson(text)
  if (json === undefined || json === null || typeof json !== 'object') return { text }
  const raw = JSON.stringify(json, null, 2)
  if (!Array.isArray(json)) {
    const o = json as Record<string, unknown>
    for (const key of READABLE_FIELDS) {
      const v = o[key]
      if (typeof v === 'string' && v !== '') return { text: v, raw }
    }
  }
  return { text, raw }
}

export interface PersistedOutput {
  label: string
  path: string
  preview: string
}

const PERSISTED = /^<persisted-output>\s*Output too large \(([\d.]+)\s*([KMG]?B)\)\. Full output saved to: ([^\r\n]+)\r?\n([\s\S]*?)<\/persisted-output>$/
const PREVIEW_HEAD = /^\s*Preview \([^)]*\):\r?\n/

/** The CLI's note for an output too large to keep inline, which it saved to a file instead. */
export function persistedOutput(text: string): PersistedOutput | null {
  const m = PERSISTED.exec(text.trim())
  if (!m) return null
  const [, size, unit, path, rest] = m
  return { label: `Output saved to file (${size} ${unit})`, path: path.trim(), preview: rest.replace(PREVIEW_HEAD, '').trim() }
}

const TOOL_USE_ERROR = /<\/?tool_use_error>/g

/** The first line of a failed call's readable error, for its folded row. */
export function errorLine(text: string): string {
  const readable = readableOutput(text.replace(TOOL_USE_ERROR, '')).text
  return readable.split('\n').find((l) => l.trim() !== '')?.trim() ?? ''
}

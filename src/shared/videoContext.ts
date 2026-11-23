/** Turning a video into what Claude can read: key frames tiled into contact sheets, and a timestamped transcript. */

export const MAX_FRAMES = 24
/** Seeking to the very end yields no frame, so the last frame is taken this much before it. */
const END_MARGIN = 0.25

export interface FramePlanInput {
  duration: number
  /** Where ffmpeg's scene detection saw a cut, in seconds. */
  sceneTimes: readonly number[]
  maxFrames?: number
}

const round = (t: number): number => Math.round(t * 1000) / 1000

/** Evenly spread picks of `count` items out of `items`, keeping their order. */
function spread<T>(items: readonly T[], count: number): T[] {
  if (count <= 0) return []
  if (count >= items.length) return [...items]
  if (count === 1) return [items[Math.floor(items.length / 2)]]
  return Array.from({ length: count }, (_, i) => items[Math.round((i * (items.length - 1)) / (count - 1))])
}

/**
 * The times to take frames at: the first and last frame, every scene change at least a minimum spacing apart, and
 * evenly spaced frames in any long stretch without a cut (so a static video gets evenly spaced frames). Capped,
 * dropping filler frames before scene changes.
 */
export function planFrames({ duration, sceneTimes, maxFrames = MAX_FRAMES }: FramePlanInput): number[] {
  if (!(duration > 0) || maxFrames < 1) return [0]
  const last = Math.max(0, duration - Math.min(END_MARGIN, duration / 4))
  if (last < 0.1 || maxFrames === 1) return [0]
  const spacing = Math.max(1, duration / (maxFrames * 2))
  const maxGap = Math.max(duration / 8, spacing * 2)

  const scenes: number[] = []
  for (const t of [...sceneTimes].sort((a, b) => a - b)) {
    const previous = scenes.at(-1) ?? 0
    if (t - previous >= spacing && last - t >= spacing) scenes.push(t)
  }

  const anchors = [0, ...scenes, last]
  const fill: number[] = []
  for (let i = 1; i < anchors.length; i++) {
    const from = anchors[i - 1]
    const gap = anchors[i] - from
    const parts = Math.ceil(gap / maxGap - 1e-9)
    for (let p = 1; p < parts; p++) fill.push(from + (gap * p) / parts)
  }

  const room = maxFrames - 2
  const keptScenes = spread(scenes, room)
  const keptFill = spread(fill, room - keptScenes.length)
  return [0, ...keptScenes, ...keptFill, last].sort((a, b) => a - b).map(round)
}

/** Claude's sweet spot for an image's long side. */
export const MAX_SHEET_SIDE = 1568
export const MAX_FRAME_SIDE = 768
export const SHEET_PADDING = 4

export interface Sheet {
  /** Index of its first frame. */
  first: number
  count: number
  cols: number
  rows: number
  width: number
  height: number
}

export interface SheetLayout {
  cellWidth: number
  cellHeight: number
  sheets: Sheet[]
}

const sideFor = (cells: number, cell: number): number => cells * cell + (cells + 1) * SHEET_PADDING

/** Contact sheets for `count` frames of a `width`×`height` video: 3×3, or 2×2 for a few frames or an extreme aspect ratio. */
export function layoutSheets({ count, width, height }: { count: number; width: number; height: number }): SheetLayout {
  const aspect = width > 0 && height > 0 ? width / height : 16 / 9
  const grid = count <= 4 || aspect > 2.2 || aspect < 0.45 ? 2 : 3
  const room = (MAX_SHEET_SIDE - (grid + 1) * SHEET_PADDING) / grid
  const frameLimit = aspect >= 1 ? MAX_FRAME_SIDE : MAX_FRAME_SIDE * aspect
  const cellWidth = Math.max(1, Math.floor(Math.min(room, room * aspect, frameLimit, width > 0 ? width : Infinity)))
  const cellHeight = Math.max(1, Math.round(cellWidth / aspect))

  const sheetCount = Math.max(1, Math.ceil(count / (grid * grid)))
  const perSheet = Math.ceil(count / sheetCount)
  const sheets: Sheet[] = []
  for (let first = 0; first < count; first += perSheet) {
    const n = Math.min(perSheet, count - first)
    const cols = Math.min(grid, n)
    const rows = Math.ceil(n / grid)
    sheets.push({ first, count: n, cols, rows, width: sideFor(cols, cellWidth), height: sideFor(rows, cellHeight) })
  }
  return { cellWidth, cellHeight, sheets }
}

export interface TranscriptSegment {
  /** Seconds from the start. */
  start: number
  end: number
  text: string
}

export type Speech = { kind: 'transcript'; segments: readonly TranscriptSegment[] } | { kind: 'none'; reason: string }

/** Past this the transcript is cut with a note; about 5k tokens. */
export const MAX_TRANSCRIPT_CHARS = 20_000

const pad2 = (n: number): string => String(n).padStart(2, '0')

/** A length or a frame's time: 1:42, or 1:02:05 past an hour. */
export function formatClock(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  return h > 0 ? `${h}:${pad2(m)}:${pad2(s % 60)}` : `${m}:${pad2(s % 60)}`
}

/** A transcript segment's stamp: 00:01:42. */
export function formatStamp(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds))
  return `${pad2(Math.floor(s / 3600))}:${pad2(Math.floor((s % 3600) / 60))}:${pad2(s % 60)}`
}

const plural = (n: number, noun: string): string => `${n} ${noun}${n === 1 ? '' : 's'}`

export interface VideoContextInput {
  name: string
  duration: number
  frameTimes: readonly number[]
  sheets: readonly Pick<Sheet, 'first' | 'count'>[]
  speech: Speech
  maxChars?: number
}

/** The video's name and sheet count from the first line `videoContextText` writes; null for any other text. */
export function parseVideoHeader(text: string): { name: string; sheets: number } | null {
  const match = /^Video: (.+) · [\d:]+ · \d+ frames? on (\d+) sheets?(?:\n|$)/.exec(text)
  return match ? { name: match[1], sheets: Number(match[2]) } : null
}

/** The text block that goes with the sheets: what the video is, which times each sheet shows, and the transcript. */
export function videoContextText({ name, duration, frameTimes, sheets, speech, maxChars = MAX_TRANSCRIPT_CHARS }: VideoContextInput): string {
  const lines = [`Video: ${name} · ${formatClock(duration)} · ${plural(frameTimes.length, 'frame')} on ${plural(sheets.length, 'sheet')}`]
  sheets.forEach((sheet, i) => {
    lines.push(`Sheet ${i + 1}: ${frameTimes.slice(sheet.first, sheet.first + sheet.count).map(formatClock).join(' · ')}`)
  })
  if (speech.kind === 'none') {
    lines.push(`No transcript: ${speech.reason}.`)
    return lines.join('\n')
  }
  const segments = speech.segments.map((s) => ({ ...s, text: s.text.trim() })).filter((s) => s.text !== '')
  let length = lines.join('\n').length
  const truncated = (from: number): string =>
    `[Transcript truncated: ${plural(segments.length - from, 'more segment')}, up to ${formatStamp(segments.at(-1)?.end ?? 0)}]`
  for (let i = 0; i < segments.length; i++) {
    const line = `[${formatStamp(segments[i].start)}] ${segments[i].text}`
    const note = i < segments.length - 1 ? truncated(i + 1) : ''
    if (length + 1 + line.length + (note ? 1 + note.length : 0) > maxChars) {
      lines.push(truncated(i))
      break
    }
    lines.push(line)
    length += 1 + line.length
  }
  return lines.join('\n')
}

/** Claude's image billing: the long side is scaled to 1,568 px, then the whole to about 1.15 megapixels, at 750 px a token. */
export function imageTokens(width: number, height: number): number {
  const scale = Math.min(1, MAX_SHEET_SIDE / Math.max(width, height, 1))
  const pixels = Math.min(width * scale * (height * scale), 1_150_000)
  return Math.ceil(pixels / 750)
}

/** About how many tokens the sheets and the text cost, text at four characters a token. */
export function estimateTokens(sheets: readonly { width: number; height: number }[], text: string): number {
  return sheets.reduce((sum, s) => sum + imageTokens(s.width, s.height), 0) + Math.ceil(text.length / 4)
}

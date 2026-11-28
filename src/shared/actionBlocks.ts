import type { ChatItem } from './chatItems'

/** What the app knows that decides an older card's state. */
export interface ActionFacts {
  featureNames: readonly string[]
}

/**
 * One kind of action block the main chat writes: a fenced block opened with its tag, then labelled parts in a fixed
 * order. A `oneLine` part holds exactly one non-empty line; any other part may span lines, fenced code included. An
 * `optional` part may be left out, but never written out of order.
 */
export interface ActionBlockKind<L extends string = string> {
  tag: string
  parts: readonly { label: L; oneLine: boolean; optional?: boolean }[]
  /** The chat's rules for this kind; they reach its instructions only once the kind is registered. */
  instructions: readonly string[]
  /** True when an older card of this kind reads Done instead of Superseded; never, when absent. */
  doneEarlier?(fields: Record<L, string>, facts: ActionFacts): boolean
}

export type ActionSegment =
  | { kind: 'text'; text: string }
  | { kind: 'block'; tag: string; fields: Record<string, string> }
  /** A closed block whose parts are missing, empty or out of order. */
  | { kind: 'invalid'; tag: string; raw: string }

export const ACTION_NOT_UNDERSTOOD = 'Card not understood, ask the chat to write it again'

const escaped = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
const closes = (line: string, ticks: number): boolean => new RegExp('^`{' + ticks + ',}[ \\t]*$').test(line)
const longestRun = (text: string): number => Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))

/** The block for `kind` holding `fields`, an optional part without a value left out; the fence is longer than any run of backticks inside it, and never shorter than four. */
export function writeActionBlock<L extends string>(kind: ActionBlockKind<L>, fields: Partial<Record<L, string>>): string {
  const parts = kind.parts.filter((p) => !p.optional || fields[p.label] !== undefined)
  const fence = '`'.repeat(Math.max(4, longestRun(parts.map((p) => fields[p.label] ?? '').join('')) + 1))
  const last = parts.length - 1
  const body = parts.flatMap((p, i) => (i === last && !p.oneLine ? [`${p.label}:`, fields[p.label] ?? ''] : [`${p.label}: ${fields[p.label] ?? ''}`]))
  return [fence + kind.tag, ...body, fence].join('\n')
}

/** The part a label line opens after part `at`: the next one, or a later one when only optional parts lie between; -1 for none. */
function nextPart(parts: ActionBlockKind['parts'], at: number, label: string): number {
  for (let i = at + 1; i < parts.length; i++) {
    if (parts[i].label === label) return i
    if (!parts[i].optional) return -1
  }
  return -1
}

function parseBody(kind: ActionBlockKind, lines: readonly string[]): Record<string, string> | null {
  const { parts } = kind
  const label = new RegExp('^(' + parts.map((p) => escaped(p.label)).join('|') + '):[ \\t]*(.*)$')
  // null: the part was left out.
  const found: (string[] | null)[] = parts.map(() => null)
  let at = -1
  for (const line of lines) {
    const match = at < parts.length - 1 ? label.exec(line) : null
    const next = match ? nextPart(parts, at, match[1]) : -1
    if (match && next >= 0) {
      at = next
      found[at] = match[2] !== '' ? [match[2]] : []
    } else if (at >= 0) found[at]?.push(line)
    else if (line.trim() !== '') return null
  }
  if (parts.slice(at + 1).some((p) => !p.optional)) return null
  const fields: Record<string, string> = {}
  for (const [i, part] of parts.entries()) {
    const partLines = found[i]
    if (partLines === null) continue
    const filled = partLines.filter((l) => l.trim() !== '')
    const value = part.oneLine ? (filled.length === 1 ? filled[0].trim() : '') : partLines.join('\n').trim()
    if (value === '') return null
    fields[part.label] = value
  }
  return fields
}

/** True when the text may hold a block of one of `kinds`; a cheap test before splitting. */
export const mentionsActionBlock = (text: string, kinds: readonly ActionBlockKind[]): boolean => kinds.some((k) => text.includes(k.tag))

/** A reply's text split into ordinary text and blocks of `kinds`. A block with no closing fence yet (still streaming) stays text. */
export function actionSegments(text: string, kinds: readonly ActionBlockKind[]): ActionSegment[] {
  if (!mentionsActionBlock(text, kinds)) return [{ kind: 'text', text }]
  const open = new RegExp('^(`{3,})(' + kinds.map((k) => escaped(k.tag)).join('|') + ')[ \\t]*$')
  const lines = text.split('\n')
  const segments: ActionSegment[] = []
  let plain: string[] = []
  const flush = (): void => {
    if (plain.join('').trim() !== '') segments.push({ kind: 'text', text: plain.join('\n') })
    plain = []
  }
  for (let i = 0; i < lines.length; i++) {
    const opened = open.exec(lines[i])
    const end = opened ? lines.findIndex((l, j) => j > i && closes(l, opened[1].length)) : -1
    const kind = opened ? kinds.find((k) => k.tag === opened[2]) : undefined
    if (!opened || end < 0 || !kind) {
      plain.push(lines[i])
      continue
    }
    flush()
    const fields = parseBody(kind, lines.slice(i + 1, end))
    segments.push(fields ? { kind: 'block', tag: kind.tag, fields } : { kind: 'invalid', tag: kind.tag, raw: lines.slice(i, end + 1).join('\n') })
    i = end
  }
  flush()
  return segments
}

/** What a card says about its block. `waiting`: the newest card while the chat is still answering; `done`: its action happened. */
export type ActionState = 'live' | 'waiting' | 'done' | 'superseded'

export const actionKey = (itemId: string, block: number, segment: number): string => `${itemId}:${block}:${segment}`

/**
 * Each action block of the transcript, of every kind in `kinds`, keyed by `actionKey` with its index among
 * `actionSegments(text, kinds)`. The rules are the same for every kind: the newest block, even one that did not parse,
 * is the only one that can be live, and only while no user message follows it and the turn has settled. A card this
 * app session carried out (`done`) reads Done, older or not: a kind whose outcome the app reports makes it older at
 * once. Any other older card reads Done when its kind's `doneEarlier` says so, else Superseded.
 */
export function actionStates(
  items: readonly ChatItem[],
  settled: boolean,
  kinds: readonly ActionBlockKind[],
  facts: ActionFacts,
  done: ReadonlySet<string> = new Set()
): Map<string, ActionState> {
  const entries: { key: string; kind: ActionBlockKind; fields: Record<string, string> | null; itemIndex: number }[] = []
  items.forEach((item, itemIndex) => {
    if (item.kind !== 'assistant' || item.parentToolUseId) return
    item.content.forEach((block, b) => {
      if (block.type !== 'text' || typeof block.text !== 'string') return
      actionSegments(block.text, kinds).forEach((segment, s) => {
        if (segment.kind === 'text') return
        const kind = kinds.find((k) => k.tag === segment.tag)
        if (kind) entries.push({ key: actionKey(item.id, b, s), kind, fields: segment.kind === 'block' ? segment.fields : null, itemIndex })
      })
    })
  })
  const states = new Map<string, ActionState>()
  const last = entries[entries.length - 1]
  for (const e of entries) {
    if (done.has(e.key)) states.set(e.key, 'done')
    else if (e === last && !items.slice(e.itemIndex + 1).some((i) => i.kind === 'user')) states.set(e.key, settled ? 'live' : 'waiting')
    else states.set(e.key, e.fields !== null && e.kind.doneEarlier?.(e.fields, facts) ? 'done' : 'superseded')
  }
  return states
}

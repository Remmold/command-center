import type { ChatItem } from './chatItems'

/** What the app knows that decides an older card's state. */
export interface ActionFacts {
  featureNames: readonly string[]
}

/**
 * One kind of action block the main chat writes: a fenced block opened with its tag, then labelled parts in a fixed
 * order. A `oneLine` part holds exactly one non-empty line; any other part may span lines, fenced code included.
 */
export interface ActionBlockKind<L extends string = string> {
  tag: string
  parts: readonly { label: L; oneLine: boolean }[]
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

/** The block for `kind` holding `fields`; the fence is longer than any run of backticks inside it, and never shorter than four. */
export function writeActionBlock<L extends string>(kind: ActionBlockKind<L>, fields: Record<L, string>): string {
  const fence = '`'.repeat(Math.max(4, longestRun(kind.parts.map((p) => fields[p.label]).join('')) + 1))
  const last = kind.parts.length - 1
  const body = kind.parts.flatMap((p, i) => (i === last && !p.oneLine ? [`${p.label}:`, fields[p.label]] : [`${p.label}: ${fields[p.label]}`]))
  return [fence + kind.tag, ...body, fence].join('\n')
}

function parseBody(kind: ActionBlockKind, lines: readonly string[]): Record<string, string> | null {
  const { parts } = kind
  const label = new RegExp('^(' + parts.map((p) => escaped(p.label)).join('|') + '):[ \\t]*(.*)$')
  const found: string[][] = parts.map(() => [])
  let at = -1
  for (const line of lines) {
    const match = at < parts.length - 1 ? label.exec(line) : null
    if (match && match[1] === parts[at + 1].label) {
      at++
      if (match[2] !== '') found[at].push(match[2])
    } else if (at >= 0) found[at].push(line)
    else if (line.trim() !== '') return null
  }
  if (at < parts.length - 1) return null
  const fields: Record<string, string> = {}
  for (const [i, part] of parts.entries()) {
    const filled = found[i].filter((l) => l.trim() !== '')
    const value = part.oneLine ? (filled.length === 1 ? filled[0].trim() : '') : found[i].join('\n').trim()
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
 * is the only one that can be live, and only while no user message follows it and the turn has settled. The live card
 * reads Done only when this app session carried it out (`done`). An older card reads Done when its kind's
 * `doneEarlier` says so, else Superseded.
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
    if (e === last && !items.slice(e.itemIndex + 1).some((i) => i.kind === 'user')) states.set(e.key, done.has(e.key) ? 'done' : settled ? 'live' : 'waiting')
    else states.set(e.key, e.fields !== null && e.kind.doneEarlier?.(e.fields, facts) ? 'done' : 'superseded')
  }
  return states
}

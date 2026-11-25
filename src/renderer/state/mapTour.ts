import { formatTokens, type ContextItem, type ContextItemKind, type ContextReport } from '../../shared/context'
import type { Finding } from '../../shared/findings'
import { LANE_TITLES } from './mapCopy'
import { blocksOf, mapLayout, type ContextMap, type MapBlock } from './mapLayout'

export type TourStepId = 'start' | 'memory' | 'skills' | 'behaviour' | 'health' | 'drift'

export interface TourStep {
  id: TourStepId
  title: string
  /** Paragraphs, with the workspace's numbers filled in. */
  text: string[]
  /** The kinds the step is about, each explained under its text. */
  kinds: ContextItemKind[]
  /** The ids of the blocks it lights up on the map. */
  highlight: ReadonlySet<string>
  /** Step 5 only: the health check's findings, findings first, then notes. */
  findings: Finding[]
}

interface StepRule {
  id: TourStepId
  title: string
  kinds: ContextItemKind[]
  lights: (block: MapBlock) => boolean
  text: (map: ContextMap, items: readonly ContextItem[]) => string[]
}

const count = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`
const countOrNo = (n: number, one: string, many = `${one}s`): string => (n === 0 ? `no ${many}` : count(n, one, many))

/** "a, b and c". */
const list = (parts: readonly string[]): string => (parts.length < 2 ? (parts[0] ?? '') : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`)

const ofKind = (items: readonly ContextItem[], kind: ContextItemKind): ContextItem[] => items.filter((i) => i.kind === kind)

function startText(map: ContextMap): string[] {
  const byLayer = map.lanes.filter((l) => (l.bands[0].tokens ?? 0) > 0).map((l) => `${formatTokens(l.bands[0].tokens ?? 0)} from ${LANE_TITLES[l.layer]}`)
  return [`Every chat here starts with ${formatTokens(map.startTotal)} tokens${byLayer.length ? `: ${list(byLayer)}` : ''}.`]
}

function memoryText(_map: ContextMap, items: readonly ContextItem[]): string[] {
  const index = ofKind(items, 'memory-index')[0]
  const files = ofKind(items, 'memory-file')
  if (!index) return ['This workspace has no MEMORY.md yet, so Claude starts with no memory index.']
  const linked = files.filter((f) => f.indexed !== false).length
  const unlinked = files.length - linked
  const size = [index.index ? count(index.index.lines, 'line') : null, index.tokens === null ? null : `${formatTokens(index.tokens)} tokens at every start`]
  const out = [`MEMORY.md is ${size[0] ?? 'there'}${size[1] ? ` (${size[1]})` : ''} and links ${linked} of ${count(files.length, 'memory file')}.`]
  if (unlinked > 0) out.push(`${count(unlinked, 'memory file')} ${unlinked === 1 ? 'is' : 'are'} not linked from MEMORY.md, so Claude never finds ${unlinked === 1 ? 'it' : 'them'}.`)
  return out
}

function skillsText(map: ContextMap, items: readonly ContextItem[]): string[] {
  const skills = ofKind(items, 'skill')
  const agents = ofKind(items, 'agent')
  const commands = ofKind(items, 'command')
  const atStart = blocksOf(map)
    .filter((b) => b.band === 'start' && (b.kind === 'skill' || b.kind === 'agent'))
    .reduce((sum, b) => sum + (b.tokens ?? 0), 0)
  const slashOnly = blocksOf(map)
    .filter((b) => b.band === 'on-demand' && b.kind === 'skill')
    .reduce((sum, b) => sum + b.items.length, 0)
  const out = [`This workspace has ${list([countOrNo(skills.length, 'skill'), countOrNo(agents.length, 'agent'), countOrNo(commands.length, 'command')])}.`]
  if (atStart > 0) out.push(`Their names and descriptions add ${formatTokens(atStart)} tokens to every start; the rest loads only when one is used.`)
  if (slashOnly > 0)
    out.push(`${count(slashOnly, 'skill')} ${slashOnly === 1 ? 'is' : 'are'} offered only as a slash command, so nothing of ${slashOnly === 1 ? 'it' : 'them'} loads until you type it.`)
  return out
}

function behaviourText(_map: ContextMap, items: readonly ContextItem[]): string[] {
  const counts = [
    countOrNo(ofKind(items, 'settings').length, 'settings file'),
    countOrNo(ofKind(items, 'hook').length, 'hook'),
    countOrNo(ofKind(items, 'mcp-server').length, 'MCP server'),
    countOrNo(ofKind(items, 'plugin').length, 'plugin')
  ]
  return [`This workspace has ${list(counts)}.`, 'None of them adds tokens to a start: they decide what Claude may do and which tools it can reach.']
}

/** Every finding on the map once, findings before notes. */
function findingsOf(map: ContextMap): Finding[] {
  const byId = new Map(blocksOf(map).flatMap((b) => b.findings.map((f) => [f.id, f] as const)))
  const all = [...byId.values()]
  return [...all.filter((f) => f.severity === 'problem'), ...all.filter((f) => f.severity === 'note')]
}

function healthText(map: ContextMap): string[] {
  const all = findingsOf(map)
  const notes = all.filter((f) => f.severity === 'note').length
  const found = all.length === 0 ? 'nothing to fix' : list([count(all.length - notes, 'finding'), ...(notes > 0 ? [count(notes, 'note')] : [])])
  const out = [`The health check found ${found}, free and instant, every time the map is drawn.`]
  if (notes > 0) out.push('Notes are [[links]] that match no memory file. The memory rules allow them as markers for later, so they are not findings to fix.')
  return out
}

const DRIFT_TEXT = [
  'A drift check is a hosted session in which subagents read these context files against the current code and record what has drifted as findings: rules gone stale or wrong, and duplicates.',
  'Unlike the health check it costs tokens. The findings appear on their blocks as the run writes them, and nothing is changed until you tick the ones to fix.'
]

/** What a drift check reads: the workspace's own instructions, memory, skills, agents and commands, not a plugin's. */
const DRIFT_KINDS: ReadonlySet<ContextItemKind> = new Set(['claude-md', 'import', 'subfolder-claude-md', 'memory-index', 'memory-file', 'skill', 'agent', 'command'])

const STEPS: readonly StepRule[] = [
  { id: 'start', title: 'What every chat starts with', kinds: [], lights: (b) => b.band === 'start', text: startText },
  { id: 'memory', title: 'Memory', kinds: ['memory-index', 'memory-file'], lights: (b) => b.kind === 'memory-index' || b.kind === 'memory-file', text: memoryText },
  {
    id: 'skills',
    title: 'Skills, agents & commands',
    kinds: ['skill', 'agent', 'command'],
    lights: (b) => b.kind === 'skill' || b.kind === 'agent' || b.kind === 'command',
    text: skillsText
  },
  { id: 'behaviour', title: 'Settings, hooks & MCP', kinds: ['settings', 'hook', 'mcp-server', 'plugin'], lights: (b) => b.band === 'behaviour', text: behaviourText },
  { id: 'health', title: 'Health check', kinds: [], lights: (b) => b.findings.length > 0, text: healthText },
  {
    id: 'drift',
    title: 'Drift check',
    kinds: [],
    lights: (b) => DRIFT_KINDS.has(b.kind) && b.items.every((i) => !i.source.startsWith('plugin:')),
    text: () => DRIFT_TEXT
  }
]

/** The guided tour's six steps for one workspace's map. */
export function tourSteps(map: ContextMap): TourStep[] {
  const blocks = blocksOf(map)
  const items = blocks.flatMap((b) => b.items)
  return STEPS.map((s) => ({
    id: s.id,
    title: s.title,
    text: s.text(map, items),
    kinds: s.kinds,
    highlight: new Set(blocks.filter(s.lights).map((b) => b.id)),
    findings: s.id === 'health' ? findingsOf(map) : []
  }))
}

/** Where clicking a finding goes: its block, after expanding the collapsed group it is in; null when no block shows it. */
export function findingTarget(
  report: ContextReport,
  findings: readonly Finding[],
  expanded: readonly string[],
  findingId: string
): { blockId: string; expand: string | null } | null {
  const holder = (map: ContextMap): MapBlock | undefined => blocksOf(map).find((b) => b.findings.some((f) => f.id === findingId))
  const drawn = holder(mapLayout(report, findings, new Set(expanded)))
  if (!drawn) return null
  if (!drawn.collapsed || drawn.groupId === null) return { blockId: drawn.id, expand: null }
  const opened = holder(mapLayout(report, findings, new Set([...expanded, drawn.groupId])))
  return { blockId: opened?.id ?? drawn.id, expand: drawn.groupId }
}

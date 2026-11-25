import type { ContextItem, ContextItemKind, ContextLayerName, ContextReport } from '../../shared/context'
import type { Finding } from '../../shared/findings'

export type MapBandName = 'start' | 'on-demand' | 'behaviour'

export interface MapBlock {
  id: string
  label: string
  kind: ContextItemKind
  layer: ContextLayerName
  band: MapBandName
  /** The one item it draws; null for a collapsed group. */
  item: ContextItem | null
  /** What it stands for: its item, or every member of its collapsed group. */
  items: ContextItem[]
  /** Counted tokens of the items themselves (an import is its own block); null when none counts. */
  tokens: number | null
  /** How big it is drawn, in tokens: never below BLOCK_SIZE_FLOOR. */
  size: number
  /** The group of more than LARGE_GROUP items it belongs to, collapsed or expanded; null when its kind is small here. */
  groupId: string | null
  collapsed: boolean
  /** True when every item it stands for is shared with Personal. */
  sharedWithDefault: boolean
  /** Why it can't be written, when every item it stands for is read-only. */
  readOnly: string | null
  findings: Finding[]
}

export interface MapBand {
  band: MapBandName
  blocks: MapBlock[]
  /** Counted tokens in the band; null when nothing in it counts. */
  tokens: number | null
}

export interface MapLane {
  layer: ContextLayerName
  bands: MapBand[]
}

/** A line from a CLAUDE.md (or an imported file) to a file it imports. */
export interface MapEdge {
  from: string
  to: string
  kind: 'import'
}

/** A kind with more than LARGE_GROUP items in one lane, collapsed into one block or expanded. */
export interface MapGroup {
  id: string
  /** "176 memory files". */
  label: string
  kind: ContextItemKind
  layer: ContextLayerName
  band: MapBandName
  items: ContextItem[]
  tokens: number | null
  expanded: boolean
}

export interface ContextMap {
  lanes: MapLane[]
  edges: MapEdge[]
  groups: MapGroup[]
}

export const LAYER_ORDER: readonly ContextLayerName[] = ['account', 'repo', 'local']
export const BAND_ORDER: readonly MapBandName[] = ['start', 'on-demand', 'behaviour']
/** A kind with more items than this in one band is drawn as one block until expanded. */
export const LARGE_GROUP = 8
export const BLOCK_SIZE_FLOOR = 50

const BAND_OF: Record<ContextItemKind, MapBandName> = {
  'claude-md': 'start',
  import: 'start',
  'memory-index': 'start',
  skill: 'start',
  agent: 'start',
  'subfolder-claude-md': 'on-demand',
  'memory-file': 'on-demand',
  command: 'on-demand',
  settings: 'behaviour',
  hook: 'behaviour',
  'mcp-server': 'behaviour',
  plugin: 'behaviour'
}

const KIND_ORDER: readonly ContextItemKind[] = [
  'claude-md',
  'import',
  'memory-index',
  'skill',
  'agent',
  'subfolder-claude-md',
  'memory-file',
  'command',
  'settings',
  'hook',
  'mcp-server',
  'plugin'
]

const PLURALS: Record<ContextItemKind, string> = {
  'claude-md': 'CLAUDE.md files',
  import: 'imported files',
  'memory-index': 'memory indexes',
  skill: 'skills',
  agent: 'agents',
  'subfolder-claude-md': 'subfolder CLAUDE.md files',
  'memory-file': 'memory files',
  command: 'commands',
  settings: 'settings files',
  hook: 'hooks',
  'mcp-server': 'MCP servers',
  plugin: 'plugins'
}

interface Placed {
  item: ContextItem
  id: string
  parentId: string | null
}

const sumTokens = (items: readonly ContextItem[]): number | null =>
  items.reduce<number | null>((sum, i) => (i.tokens === null ? sum : (sum ?? 0) + i.tokens), null)

const sizeOf = (tokens: number | null): number => Math.max(BLOCK_SIZE_FLOOR, tokens ?? 0)

/** Each item and its children (imports, a settings file's hooks, a plugin's skills, agents and commands), flat, with an id unique in the lane. */
function flatten(layer: ContextLayerName, items: readonly ContextItem[]): Placed[] {
  const seen = new Map<string, number>()
  const out: Placed[] = []
  const walk = (list: readonly ContextItem[], parentId: string | null): void => {
    for (const item of list) {
      const base = `${layer}:${item.kind}:${item.path ?? item.label}`
      const n = seen.get(base) ?? 0
      seen.set(base, n + 1)
      const id = n === 0 ? base : `${base}#${n}`
      out.push({ item, id, parentId })
      walk(item.children, id)
    }
  }
  walk(items, null)
  return out
}

function singleBlock(layer: ContextLayerName, placed: Placed, groupId: string | null, findings: readonly Finding[]): MapBlock {
  const { item } = placed
  return {
    id: placed.id,
    label: item.label,
    kind: item.kind,
    layer,
    band: BAND_OF[item.kind],
    item,
    items: [item],
    tokens: item.tokens,
    size: sizeOf(item.tokens),
    groupId,
    collapsed: false,
    sharedWithDefault: item.sharedWithDefault,
    readOnly: item.readOnly,
    findings: findings.filter((f) => f.path === item.path)
  }
}

function groupBlock(group: MapGroup, findings: readonly Finding[]): MapBlock {
  const members = group.items
  const paths = new Set(members.map((m) => m.path))
  const readOnly = members.every((m) => m.readOnly !== null) ? members[0].readOnly : null
  return {
    id: group.id,
    label: group.label,
    kind: group.kind,
    layer: group.layer,
    band: group.band,
    item: null,
    items: members,
    tokens: group.tokens,
    size: sizeOf(group.tokens),
    groupId: group.id,
    collapsed: true,
    sharedWithDefault: members.every((m) => m.sharedWithDefault),
    readOnly,
    findings: findings.filter((f) => paths.has(f.path))
  }
}

/**
 * The context map of one report: a lane per context layer, three bands per lane, a block per item sized by its tokens.
 * A kind with more than LARGE_GROUP items in one lane is one block unless its group id is in `expanded`.
 */
export function mapLayout(report: ContextReport, findings: readonly Finding[], expanded: ReadonlySet<string> = new Set()): ContextMap {
  const edges: MapEdge[] = []
  const groups: MapGroup[] = []
  const lanes = LAYER_ORDER.map((layer): MapLane => {
    const placed = flatten(layer, report.layers[layer])
    const blockOf = new Map<string, string>()
    const blocks: MapBlock[] = []
    for (const kind of KIND_ORDER) {
      const members = placed.filter((p) => p.item.kind === kind)
      if (members.length === 0) continue
      const groupId = members.length > LARGE_GROUP ? `${layer}:group:${kind}` : null
      if (groupId) {
        const items = members.map((m) => m.item)
        groups.push({ id: groupId, label: `${items.length} ${PLURALS[kind]}`, kind, layer, band: BAND_OF[kind], items, tokens: sumTokens(items), expanded: expanded.has(groupId) })
      }
      if (groupId && !expanded.has(groupId)) {
        blocks.push(groupBlock(groups[groups.length - 1], findings))
        for (const m of members) blockOf.set(m.id, groupId)
      } else {
        for (const m of members) {
          blocks.push(singleBlock(layer, m, groupId, findings))
          blockOf.set(m.id, m.id)
        }
      }
    }
    for (const p of placed) {
      if (p.parentId === null || p.item.kind !== 'import') continue
      const from = blockOf.get(p.parentId)
      const to = blockOf.get(p.id)
      if (from && to && from !== to && !edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, kind: 'import' })
    }
    return {
      layer,
      bands: BAND_ORDER.map((band) => {
        const inBand = blocks.filter((b) => b.band === band)
        return { band, blocks: inBand, tokens: sumTokens(inBand.flatMap((b) => b.items)) }
      })
    }
  })
  return { lanes, edges, groups }
}

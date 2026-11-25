import { SLASH_COMMAND_ONLY, type ContextItem, type ContextItemKind, type ContextLayerName, type ContextReport } from '../../shared/context'
import { pathKey, type ShownFinding } from '../../shared/findings'

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
  /** Memory files MEMORY.md never links, drawn apart from the linked ones. */
  unindexed: boolean
  findings: ShownFinding[]
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

/** A line from a CLAUDE.md (or an imported file) to a file it imports, or from MEMORY.md to a memory file it links. */
export interface MapEdge {
  from: string
  to: string
  kind: 'import' | 'index'
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
  /** True when every item in it is shared with Personal. */
  sharedWithDefault: boolean
  /** Why it can't be written, when every item in it is read-only. */
  readOnly: string | null
  /** Memory files MEMORY.md never links. */
  unindexed: boolean
}

export interface ContextMap {
  lanes: MapLane[]
  edges: MapEdge[]
  groups: MapGroup[]
  /** The Every start bands summed: the start total Files shows. */
  startTotal: number
}

export function blocksOf(map: ContextMap): MapBlock[] {
  return map.lanes.flatMap((l) => l.bands.flatMap((b) => b.blocks))
}

export const LAYER_ORDER: readonly ContextLayerName[] = ['account', 'repo', 'local']
export const BAND_ORDER: readonly MapBandName[] = ['start', 'on-demand', 'behaviour']
/** A kind with more items than this in one band is drawn as one block until expanded. */
export const LARGE_GROUP = 8
export const BLOCK_SIZE_FLOOR = 50

/** Where an item goes: its kind, except that unlinked memory files and slash-only skills are each a set of their own. */
type Slot = ContextItemKind | 'memory-file:unlinked' | 'skill:slash'

/** Every slot in the order its blocks are drawn, with its band and what a group of it is called. */
const SLOTS: readonly { slot: Slot; band: MapBandName; noun: string }[] = [
  { slot: 'claude-md', band: 'start', noun: 'CLAUDE.md files' },
  { slot: 'import', band: 'start', noun: 'imported files' },
  { slot: 'memory-index', band: 'start', noun: 'memory indexes' },
  { slot: 'skill', band: 'start', noun: 'skills' },
  { slot: 'agent', band: 'start', noun: 'agents' },
  { slot: 'subfolder-claude-md', band: 'on-demand', noun: 'subfolder CLAUDE.md files' },
  { slot: 'memory-file', band: 'on-demand', noun: 'memory files' },
  { slot: 'memory-file:unlinked', band: 'on-demand', noun: 'unlinked memory files' },
  { slot: 'command', band: 'on-demand', noun: 'commands' },
  // A slash-only skill loads nothing at start, so it is On demand like a command.
  { slot: 'skill:slash', band: 'on-demand', noun: 'slash-only skills' },
  { slot: 'settings', band: 'behaviour', noun: 'settings files' },
  { slot: 'hook', band: 'behaviour', noun: 'hooks' },
  { slot: 'mcp-server', band: 'behaviour', noun: 'MCP servers' },
  { slot: 'plugin', band: 'behaviour', noun: 'plugins' }
]

const SLOT = new Map(SLOTS.map((s) => [s.slot, s]))

function slotOf(item: ContextItem): Slot {
  if (item.kind === 'memory-file' && item.indexed === false) return 'memory-file:unlinked'
  if (item.kind === 'skill' && item.note === SLASH_COMMAND_ONLY) return 'skill:slash'
  return item.kind
}

const bandOf = (item: ContextItem): MapBandName => SLOT.get(slotOf(item))!.band

const isUnlinked = (item: ContextItem): boolean => slotOf(item) === 'memory-file:unlinked'

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

/** The placed items by slot in SLOT_ORDER, a plugin's items apart from the layer's own (Files lists them under the plugin). */
function bySlotAndPlugin(placed: readonly Placed[]): [Slot, string | null, Placed[]][] {
  const out: [Slot, string | null, Placed[]][] = []
  for (const { slot } of SLOTS) {
    const plugins = new Map<string | null, Placed[]>()
    for (const p of placed) {
      if (slotOf(p.item) !== slot) continue
      const plugin = p.item.source.startsWith('plugin:') ? p.item.source.slice('plugin:'.length) : null
      plugins.set(plugin, [...(plugins.get(plugin) ?? []), p])
    }
    for (const [plugin, members] of plugins) out.push([slot, plugin, members])
  }
  return out
}

function singleBlock(layer: ContextLayerName, placed: Placed, groupId: string | null, findings: readonly ShownFinding[]): MapBlock {
  const { item } = placed
  const key = item.path === null ? null : pathKey(item.path)
  return {
    id: placed.id,
    label: item.label,
    kind: item.kind,
    layer,
    band: bandOf(item),
    item,
    items: [item],
    tokens: item.tokens,
    size: sizeOf(item.tokens),
    groupId,
    collapsed: false,
    sharedWithDefault: item.sharedWithDefault,
    readOnly: item.readOnly,
    unindexed: isUnlinked(item),
    findings: findings.filter((f) => pathKey(f.path) === key)
  }
}

function groupBlock(group: MapGroup, findings: readonly ShownFinding[]): MapBlock {
  const members = group.items
  const paths = new Set(members.flatMap((m) => (m.path === null ? [] : [pathKey(m.path)])))
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
    sharedWithDefault: group.sharedWithDefault,
    readOnly: group.readOnly,
    unindexed: group.unindexed,
    findings: findings.filter((f) => paths.has(pathKey(f.path)))
  }
}

/**
 * The context map of one report: a lane per context layer, three bands per lane, a block per item sized by its tokens.
 * A kind with more than LARGE_GROUP items in one lane is one block unless its group id is in `expanded`.
 */
export function mapLayout(report: ContextReport, findings: readonly ShownFinding[], expanded: ReadonlySet<string> = new Set()): ContextMap {
  const edges: MapEdge[] = []
  const groups: MapGroup[] = []
  const lanes = LAYER_ORDER.map((layer): MapLane => {
    const placed = flatten(layer, report.layers[layer])
    const blockOf = new Map<string, string>()
    const blocks: MapBlock[] = []
    for (const [slot, plugin, members] of bySlotAndPlugin(placed)) {
      const groupId = members.length > LARGE_GROUP ? `${layer}:group:${slot}${plugin ? `:${plugin}` : ''}` : null
      if (groupId) {
        const items = members.map((m) => m.item)
        const kind = items[0].kind
        groups.push({
          id: groupId,
          label: `${items.length} ${SLOT.get(slot)!.noun}${plugin ? ` from ${plugin}` : ''}`,
          kind,
          layer,
          band: SLOT.get(slot)!.band,
          unindexed: slot === 'memory-file:unlinked',
          items,
          tokens: sumTokens(items),
          expanded: expanded.has(groupId),
          sharedWithDefault: items.every((i) => i.sharedWithDefault),
          readOnly: items.every((i) => i.readOnly !== null) ? items[0].readOnly : null
        })
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
    const edge = (from: string | undefined, to: string | undefined, kind: MapEdge['kind']): void => {
      if (from && to && from !== to && !edges.some((e) => e.from === from && e.to === to)) edges.push({ from, to, kind })
    }
    for (const p of placed) if (p.parentId !== null && p.item.kind === 'import') edge(blockOf.get(p.parentId), blockOf.get(p.id), 'import')
    const memoryFiles = new Map(placed.filter((p) => p.item.kind === 'memory-file').map((p) => [p.item.path, p.id]))
    for (const p of placed) {
      if (p.item.kind !== 'memory-index') continue
      for (const link of p.item.index?.links ?? []) edge(blockOf.get(p.id), blockOf.get(memoryFiles.get(link) ?? ''), 'index')
    }
    return {
      layer,
      bands: BAND_ORDER.map((band) => {
        const inBand = blocks.filter((b) => b.band === band)
        return { band, blocks: inBand, tokens: sumTokens(inBand.flatMap((b) => b.items)) }
      })
    }
  })
  const startTotal = lanes.reduce((sum, lane) => sum + (lane.bands[0].tokens ?? 0), 0)
  return { lanes, edges, groups, startTotal }
}

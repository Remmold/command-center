import { formatTokens, type ContextItem, type ContextItemKind, type ContextLayerName } from '../../../../shared/context'
import type { Finding } from '../../../../shared/findings'
import { useContextStore } from '../../../state/contextStore'
import { BAND_TITLES, KIND_EXPLANATIONS, KIND_TITLES, LANE_TITLES } from '../../../state/mapCopy'
import type { ContextMap, MapBandName } from '../../../state/mapLayout'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { EmptyState } from '../../ui/EmptyState'
import { Pane } from '../../ui/Pane'
import { Panel } from '../../ui/Panel'
import { PropertyList } from '../../ui/PropertyList'
import { ScrollStack } from '../../ui/ScrollStack'
import { SectionLabel } from '../../ui/SectionLabel'
import { Toolbar } from '../../ui/Toolbar'

/** What the detail panel shows: one block, or a large group whether collapsed or expanded. */
interface Shown {
  label: string
  kind: ContextItemKind
  layer: ContextLayerName
  band: MapBandName
  item: ContextItem | null
  items: ContextItem[]
  tokens: number | null
  groupId: string | null
  expanded: boolean
  sharedWithDefault: boolean
  readOnly: string | null
  findings: Finding[]
}

function shown(map: ContextMap, id: string | null): Shown | null {
  if (id === null) return null
  const block = map.lanes.flatMap((l) => l.bands.flatMap((b) => b.blocks)).find((b) => b.id === id)
  if (block) return { ...block, groupId: block.collapsed ? block.groupId : null, expanded: false }
  const group = map.groups.find((g) => g.id === id)
  if (!group) return null
  const blocks = map.lanes.flatMap((l) => l.bands.flatMap((b) => b.blocks)).filter((b) => b.groupId === group.id)
  return {
    ...group,
    item: null,
    groupId: group.id,
    sharedWithDefault: group.items.every((i) => i.sharedWithDefault),
    readOnly: group.items.every((i) => i.readOnly !== null) ? group.items[0].readOnly : null,
    findings: blocks.flatMap((b) => b.findings)
  }
}

function numbers(s: Shown): [string, string][] {
  const out: [string, string][] = [['Tokens', s.tokens === null ? 'not counted at start' : `${formatTokens(s.tokens)} at every start`]]
  if (s.item === null) out.push(['Items', String(s.items.length)])
  if (s.item?.path) out.push(['File', s.item.path])
  if (s.item?.note) out.push(['Note', s.item.note])
  out.push(['Where', `${LANE_TITLES[s.layer]} · ${BAND_TITLES[s.band]}`])
  return out
}

export function MapDetail({ map, defaultName }: { map: ContextMap; defaultName: string }) {
  const selected = useContextStore((s) => s.mapSelected)
  const s = shown(map, selected)
  if (!s) return <EmptyState>Click a block to see what it is and how Claude loads it.</EmptyState>
  const { item } = s
  const openInFiles = (): void => {
    if (!item?.path) return
    useContextStore.getState().openInFiles({ path: item.path, label: item.label, sharedWithDefault: item.sharedWithDefault, readOnly: item.readOnly, creating: false })
  }
  return (
    <Pane label="Block detail">
      <Toolbar
        compact
        actions={
          item?.path && !item.missing ? (
            <Button variant="secondary" onClick={openInFiles}>
              Open in Files
            </Button>
          ) : s.groupId ? (
            <Button variant="secondary" onClick={() => useContextStore.getState().toggleGroup(s.groupId as string)}>
              {s.expanded ? 'Collapse' : 'Expand'}
            </Button>
          ) : undefined
        }
      >
        <span className="block truncate text-xs text-fg" title={s.label}>
          {s.label}
        </span>
      </Toolbar>
      <ScrollStack padded>
        <section aria-label="What it is" className="flex flex-col gap-1">
          <SectionLabel as="h3">{KIND_TITLES[s.kind]}</SectionLabel>
          <p className="text-xs text-fg">{KIND_EXPLANATIONS[s.kind]}</p>
        </section>
        <div className="flex flex-wrap gap-1">
          {s.sharedWithDefault && <Badge tone="quiet">shared with {defaultName}</Badge>}
          {s.readOnly && (
            <Badge tone="quiet" tooltip={s.readOnly}>
              read-only
            </Badge>
          )}
          {item?.missing && <Badge tone="quiet-warning">not found</Badge>}
        </div>
        <PropertyList label="Numbers" entries={numbers(s)} />
        <Panel title="Findings" count={s.findings.length} empty="No findings.">
          <ul className="flex flex-col gap-1 text-xs">
            {s.findings.map((f) => (
              <li key={f.id}>{f.claim}</li>
            ))}
          </ul>
        </Panel>
      </ScrollStack>
    </Pane>
  )
}

import { formatTokens, type ContextItem, type ContextItemKind, type ContextLayerName } from '../../../../shared/context'
import type { ShownFinding } from '../../../../shared/findings'
import { fileTarget, findingKey, tickable, useContextStore } from '../../../state/contextStore'
import { BAND_TITLES, KIND_EXPLANATIONS, KIND_TITLES, LANE_TITLES, SLASH_ONLY_SKILL, UNINDEXED_MEMORY_FILE } from '../../../state/mapCopy'
import { blocksOf, type ContextMap, type MapBandName } from '../../../state/mapLayout'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Checkbox } from '../../ui/Checkbox'
import { EmptyState } from '../../ui/EmptyState'
import { Pane } from '../../ui/Pane'
import { Panel } from '../../ui/Panel'
import { PropertyList } from '../../ui/PropertyList'
import { ScrollStack } from '../../ui/ScrollStack'
import { SectionLabel } from '../../ui/SectionLabel'
import { Toolbar } from '../../ui/Toolbar'

/** What the detail panel shows: one block, or a large group whether collapsed or expanded. */
interface BlockDetail {
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
  unindexed: boolean
  findings: ShownFinding[]
}

function detailOf(map: ContextMap, id: string | null): BlockDetail | null {
  if (id === null) return null
  const block = blocksOf(map).find((b) => b.id === id)
  if (block) return { ...block, groupId: block.collapsed ? block.groupId : null, expanded: false }
  const group = map.groups.find((g) => g.id === id)
  if (!group) return null
  const members = blocksOf(map).filter((b) => b.groupId === group.id)
  return { ...group, item: null, groupId: group.id, findings: members.flatMap((b) => b.findings) }
}

function explanation(s: BlockDetail): string {
  if (s.kind === 'skill' && s.band === 'on-demand') return SLASH_ONLY_SKILL
  if (s.unindexed) return UNINDEXED_MEMORY_FILE
  return KIND_EXPLANATIONS[s.kind]
}

function detailRows(s: BlockDetail): [string, string][] {
  const out: [string, string][] = [['Tokens', s.tokens === null ? 'not counted at start' : `${formatTokens(s.tokens)} at every start`]]
  if (s.item === null) out.push(['Items', String(s.items.length)])
  if (s.item?.path) out.push(['File', s.item.path])
  if (s.item?.note) out.push(['Note', s.item.note])
  out.push(['Where', `${LANE_TITLES[s.layer]} · ${BAND_TITLES[s.band]}`])
  return out
}

function FixTick({ finding }: { finding: ShownFinding }) {
  const key = findingKey(finding)
  const ticked = useContextStore((s) => s.ticked.includes(key))
  return (
    <Checkbox checked={ticked} onChange={() => useContextStore.getState().toggleTick(key)}>
      Fix {finding.id}
    </Checkbox>
  )
}

export function MapDetail({ map, defaultName }: { map: ContextMap; defaultName: string }) {
  const selected = useContextStore((s) => s.mapSelected)
  const s = detailOf(map, selected)
  if (!s) return <EmptyState>Click a block to see what it is and how Claude loads it.</EmptyState>
  const { item } = s
  const openInFiles = (): void => {
    if (item?.path) useContextStore.getState().openInFiles(fileTarget(item, item.path))
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
          <p className="text-xs text-fg">{explanation(s)}</p>
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
        <PropertyList label="Numbers" entries={detailRows(s)} />
        <Panel title="Findings" count={s.findings.length} empty="No findings.">
          <ul className="flex flex-col gap-3 text-xs">
            {s.findings.map((f) => (
              <li key={findingKey(f)} data-stale={f.stale ? '' : undefined} className={`flex flex-col gap-1 ${f.stale ? 'opacity-50' : ''}`}>
                <span className="text-fg">
                  {f.severity === 'note' && <Badge tone="quiet">note</Badge>} {f.status !== 'open' && <Badge tone="quiet">{f.status}</Badge>} {f.claim}
                </span>
                {tickable(f) && <FixTick finding={f} />}
                {(f.stale || f.accountWide) && (
                  <span className="flex flex-wrap gap-1">
                    {f.stale && (
                      <Badge tone="quiet-warning" tooltip="The file was modified after the drift check started, so this may no longer hold.">
                        file changed since
                      </Badge>
                    )}
                    {f.accountWide && (
                      <Badge tone="quiet" tooltip="An account file loads in every workspace of this account; a fix changes all of them.">
                        affects every workspace of this account
                      </Badge>
                    )}
                  </span>
                )}
                <PropertyList
                  label={`Finding ${f.id}`}
                  entries={[
                    ['Evidence', f.evidence],
                    ['Fix', f.fix]
                  ]}
                />
              </li>
            ))}
          </ul>
        </Panel>
      </ScrollStack>
    </Pane>
  )
}

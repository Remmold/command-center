import { useMemo, type ReactNode } from 'react'
import { Link2, Lock } from 'lucide-react'
import { formatTokens, type ContextLayerName, type ContextReport } from '../../../../shared/context'
import { healthCheck } from '../../../../shared/healthCheck'
import { useContextStore } from '../../../state/contextStore'
import { BAND_NOTES, BAND_TITLES, LANE_TITLES } from '../../../state/mapCopy'
import { BAND_ORDER, BLOCK_SIZE_FLOOR, mapLayout, type ContextMap as ContextMapModel, type MapBand, type MapBandName, type MapBlock } from '../../../state/mapLayout'
import { Button } from '../../ui/Button'
import { Connectors } from '../../ui/Connectors'
import { CountDot } from '../../ui/CountDot'
import { EmptyState } from '../../ui/EmptyState'
import { LabeledDivider } from '../../ui/LabeledDivider'
import { NoticeLine } from '../../ui/NoticeLine'
import { Pane } from '../../ui/Pane'
import { SectionLabel } from '../../ui/SectionLabel'
import { Tile } from '../../ui/Tile'
import { MapDetail } from './MapDetail'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Width and height in px: the area grows with the tokens, from the floor's smallest tile. */
function tileSize(size: number): { width: number; height: number } {
  const s = Math.sqrt(size / BLOCK_SIZE_FLOOR) - 1
  return { width: Math.round(88 + 24 * s), height: Math.min(120, Math.round(42 + 8 * s)) }
}

export function ContextMapPane({ workspacePath, report, defaultName }: { workspacePath: string; report: ContextReport | null; defaultName: string }) {
  const expanded = useContextStore((s) => s.mapExpanded)
  const health = useMemo(() => (report ? healthCheck(report) : []), [report])
  const map = useMemo(() => (report ? mapLayout(report, health, new Set(expanded)) : null), [report, health, expanded])
  if (!report || !map) return <EmptyState>Reading…</EmptyState>
  if (!report.folderExists) return <EmptyState>The folder {workspacePath} is gone, so there is nothing to map.</EmptyState>
  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 min-w-0 flex-1">
        <Pane label="Context map">
          <NoticeLine strip>Start total {formatTokens(map.startTotal)} tokens · estimates, as configured</NoticeLine>
          <MapGrid map={map} defaultName={defaultName} />
        </Pane>
      </div>
      <div className="min-h-0 w-80 shrink-0 border-l border-subtle">
        <MapDetail map={map} defaultName={defaultName} />
      </div>
    </div>
  )
}

function MapGrid({ map, defaultName }: { map: ContextMapModel; defaultName: string }) {
  return (
    <div className="scrollbar-thin min-h-0 flex-1 overflow-auto p-3">
      <div className="relative grid min-w-[44rem] grid-cols-[7rem_repeat(3,minmax(0,1fr))] gap-2">
        <Connectors connectors={map.edges} label="Import and index lines" />
        <span />
        {map.lanes.map((lane) => (
          <div key={lane.layer} className="px-1">
            <SectionLabel as="h3">{LANE_TITLES[lane.layer]}</SectionLabel>
          </div>
        ))}
        {BAND_ORDER.map((band, row) => (
          <BandRow key={band} band={band} cells={map.lanes.map((lane) => ({ layer: lane.layer, band: lane.bands[row] }))} defaultName={defaultName} />
        ))}
      </div>
    </div>
  )
}

function BandRow({ band, cells, defaultName }: { band: MapBandName; cells: { layer: ContextLayerName; band: MapBand }[]; defaultName: string }) {
  return (
    <>
      <div className="flex flex-col gap-0.5 border-t border-subtle px-1 pt-2">
        <SectionLabel as="h3">{BAND_TITLES[band]}</SectionLabel>
        <span className="text-[10px] text-faint">{BAND_NOTES[band]}</span>
      </div>
      {cells.map((cell) => (
        <BandCell key={cell.layer} label={`${LANE_TITLES[cell.layer]} · ${BAND_TITLES[band]}`} cell={cell.band} defaultName={defaultName} />
      ))}
    </>
  )
}

/** One lane's part of a band: its blocks, an expanded group's members under a Collapse button. */
function BandCell({ label, cell, defaultName }: { label: string; cell: MapBand; defaultName: string }) {
  return (
    <section aria-label={label} className="flex min-w-0 flex-col gap-1.5 border-t border-subtle pt-2">
      {cell.tokens !== null && <span className="px-1 text-[10px] tabular-nums text-muted">{formatTokens(cell.tokens)} tokens</span>}
      <div className="flex min-w-0 flex-wrap content-start gap-1.5">
        {cell.blocks.length === 0 && <span className="px-1 text-[11px] text-faint">Nothing here.</span>}
        {cell.blocks.map((block, n) => {
          const startsGroup = block.groupId !== null && !block.collapsed && cell.blocks[n - 1]?.groupId !== block.groupId
          const startsUnindexed = block.unindexed && !cell.blocks[n - 1]?.unindexed
          return (
            <UnindexedStart key={block.id} show={startsUnindexed}>
              <GroupStart show={startsGroup} groupId={block.groupId}>
                <MapTile block={block} defaultName={defaultName} />
              </GroupStart>
            </UnindexedStart>
          )
        })}
      </div>
    </section>
  )
}

/** Memory files MEMORY.md never links start on a line of their own. */
function UnindexedStart({ show, children }: { show: boolean; children: ReactNode }) {
  if (!show) return <>{children}</>
  return (
    <>
      <span className="basis-full">
        <LabeledDivider>Not linked from MEMORY.md</LabeledDivider>
      </span>
      {children}
    </>
  )
}

function GroupStart({ show, groupId, children }: { show: boolean; groupId: string | null; children: ReactNode }) {
  if (!show || groupId === null) return <>{children}</>
  return (
    <>
      <span className="basis-full">
        <Button variant="ghost" onClick={() => useContextStore.getState().toggleGroup(groupId)} tooltip="Draw these as one block again">
          Collapse
        </Button>
      </span>
      {children}
    </>
  )
}

function MapTile({ block, defaultName }: { block: MapBlock; defaultName: string }) {
  const selected = useContextStore((s) => s.mapSelected === block.id)
  const { width, height } = tileSize(block.size)
  const click = (): void => {
    const store = useContextStore.getState()
    if (block.collapsed && block.groupId) store.toggleGroup(block.groupId)
    store.selectBlock(block.id)
  }
  const problems = block.findings.filter((f) => f.severity === 'problem').length
  const notes = block.findings.length - problems
  const marks = (
    <>
      {block.sharedWithDefault && <Link2 size={10} aria-label={`shared with ${defaultName}`} className="shrink-0" />}
      {block.readOnly && <Lock size={10} aria-label="read-only" className="shrink-0" />}
      {problems > 0 && <CountDot count={problems} tone="warning" label={plural(problems, 'finding')} />}
      {notes > 0 && <CountDot count={notes} tone="muted" label={plural(notes, 'note')} />}
    </>
  )
  return (
    <Tile
      nodeId={block.id}
      label={block.label}
      meta={block.tokens === null ? undefined : formatTokens(block.tokens)}
      marks={block.sharedWithDefault || block.readOnly || block.findings.length > 0 ? marks : undefined}
      width={width}
      height={height}
      selected={selected}
      stack={block.collapsed}
      tooltip={block.item?.path ?? (block.collapsed ? `${block.label}: click to show each one` : block.label)}
      onClick={click}
    />
  )
}

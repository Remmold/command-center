import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Check, Link2, Lock } from 'lucide-react'
import { formatTokens, type ContextLayerName, type ContextReport } from '../../../../shared/context'
import { shownFindings, type DriftChecksView, type ShownFinding } from '../../../../shared/findings'
import { healthCheck } from '../../../../shared/healthCheck'
import { applyFixes } from '../../../state/applyFixes'
import { findingKey, tickable, useContextStore } from '../../../state/contextStore'
import { useWorkspacesStore } from '../../../state/workspacesStore'
import { BAND_NOTES, BAND_TITLES, LANE_TITLES } from '../../../state/mapCopy'
import { stepIndex, tourSteps } from '../../../state/mapTour'
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
import { DriftRuns } from './DriftRuns'
import { GuidedTour } from './GuidedTour'
import { MapDetail } from './MapDetail'

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** Width and height in px: the area grows with the tokens, from the floor's smallest tile. */
function tileSize(size: number): { width: number; height: number } {
  const s = Math.sqrt(size / BLOCK_SIZE_FLOOR) - 1
  return { width: Math.round(88 + 24 * s), height: Math.min(120, Math.round(42 + 8 * s)) }
}

export function ContextMapPane({ workspacePath, report, defaultName }: { workspacePath: string; report: ContextReport | null; defaultName: string }) {
  const expanded = useContextStore((s) => s.mapExpanded)
  const workspaceId = useContextStore((s) => s.selectedId)
  const drift = useContextStore((s) => s.drift)
  useEffect(() => {
    useContextStore.getState().showDrift()
    const off = window.api.driftChecks.onChanged(() => useContextStore.getState().showDrift())
    return () => {
      off()
      void window.api.driftChecks.release()
    }
  }, [workspaceId])
  const health = useMemo(() => (report ? healthCheck(report) : []), [report])
  const findings = useMemo(
    () => [...health, ...(report && drift ? drift.runs.flatMap((r) => shownFindings(r.run, r.modified, report.accountFolder, r.files)) : [])],
    [report, health, drift]
  )
  const map = useMemo(() => (report ? mapLayout(report, findings, new Set(expanded)) : null), [report, findings, expanded])
  const steps = useMemo(() => (map ? tourSteps(map, health) : []), [map, health])
  const tourStep = useContextStore((s) => s.tourStep)
  if (!report || !map) return <EmptyState>Reading…</EmptyState>
  if (!report.folderExists) return <EmptyState>The folder {workspacePath} is gone, so there is nothing to map.</EmptyState>
  return (
    <div className="flex h-full min-h-0">
      <div className="min-h-0 w-72 shrink-0 border-r border-subtle">
        <GuidedTour steps={steps} report={report} health={health} />
      </div>
      <div className="min-h-0 min-w-0 flex-1">
        <Pane label="Context map">
          <NoticeLine strip>Start total {formatTokens(map.startTotal)} tokens · estimates, as configured</NoticeLine>
          <DriftRuns drift={drift} />
          <ApplyBar findings={findings} report={report} drift={drift} />
          <MapGrid map={map} highlight={steps[stepIndex(tourStep, steps)].highlight} defaultName={defaultName} />
        </Pane>
      </div>
      <div className="min-h-0 w-80 shrink-0 border-l border-subtle">
        <MapDetail map={map} defaultName={defaultName} />
      </div>
    </div>
  )
}

/** "Apply N fixes" for the ticked findings, while any is ticked. */
function ApplyBar({ findings, report, drift }: { findings: readonly ShownFinding[]; report: ContextReport; drift: DriftChecksView | null }) {
  const keys = useContextStore((s) => s.ticked)
  const selectedId = useContextStore((s) => s.selectedId)
  const workspace = useWorkspacesStore((s) => s.workspaces.find((w) => w.id === selectedId) ?? null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const ticked = useMemo(() => findings.filter((f) => tickable(f) && keys.includes(findingKey(f))), [findings, keys])
  if (ticked.length === 0 && error === null) return null
  const apply = async (): Promise<void> => {
    if (!workspace) return
    setSending(true)
    setError(null)
    try {
      const failed = await applyFixes({ workspace, report, drift, ticked })
      setError(failed)
      if (failed === null) useContextStore.getState().sentFixes([...new Set(ticked.flatMap((f) => (f.runId ? [f.runId] : [])))])
    } catch (err) {
      console.error('[context] could not apply fixes', err)
      setError('Could not send the fixes.')
    } finally {
      setSending(false)
    }
  }
  return (
    <div className="flex shrink-0 flex-col gap-1 border-b border-subtle px-3 py-2">
      {ticked.length > 0 && (
        <div className="flex items-center gap-2 text-[11px] text-muted">
          <span>Claude edits the files and marks each one applied or skipped.</span>
          <span className="ml-auto">
            <Button onClick={() => void apply()} disabled={sending || !workspace}>
              {sending ? 'Sending…' : `Apply ${ticked.length} ${ticked.length === 1 ? 'fix' : 'fixes'}`}
            </Button>
          </span>
        </div>
      )}
      {error && <NoticeLine tone="warning">{error}</NoticeLine>}
    </div>
  )
}

function MapGrid({ map, highlight, defaultName }: { map: ContextMapModel; highlight: ReadonlySet<string>; defaultName: string }) {
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
          <BandRow key={band} band={band} cells={map.lanes.map((lane) => ({ layer: lane.layer, band: lane.bands[row] }))} highlight={highlight} defaultName={defaultName} />
        ))}
      </div>
    </div>
  )
}

function BandRow({ band, cells, highlight, defaultName }: { band: MapBandName; cells: { layer: ContextLayerName; band: MapBand }[]; highlight: ReadonlySet<string>; defaultName: string }) {
  return (
    <>
      <div className="flex flex-col gap-0.5 border-t border-subtle px-1 pt-2">
        <SectionLabel as="h3">{BAND_TITLES[band]}</SectionLabel>
        <span className="text-[10px] text-faint">{BAND_NOTES[band]}</span>
      </div>
      {cells.map((cell) => (
        <BandCell key={cell.layer} label={`${LANE_TITLES[cell.layer]} · ${BAND_TITLES[band]}`} cell={cell.band} highlight={highlight} defaultName={defaultName} />
      ))}
    </>
  )
}

/** One lane's part of a band: its blocks, an expanded group's members under a Collapse button. */
function BandCell({ label, cell, highlight, defaultName }: { label: string; cell: MapBand; highlight: ReadonlySet<string>; defaultName: string }) {
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
                <MapTile block={block} lit={highlight.has(block.id)} defaultName={defaultName} />
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

function MapTile({ block, lit, defaultName }: { block: MapBlock; lit: boolean; defaultName: string }) {
  const selected = useContextStore((s) => s.mapSelected === block.id)
  const { width, height } = tileSize(block.size)
  const click = (): void => {
    const store = useContextStore.getState()
    if (block.collapsed && block.groupId) store.toggleGroup(block.groupId)
    store.selectBlock(block.id)
  }
  const problems = block.findings.filter(tickable).length
  const notes = block.findings.filter((f) => f.severity === 'note').length
  const done = block.findings.filter((f) => f.status !== 'open').length
  const marks = (
    <>
      {block.sharedWithDefault && <Link2 size={10} aria-label={`shared with ${defaultName}`} className="shrink-0" />}
      {block.readOnly && <Lock size={10} aria-label="read-only" className="shrink-0" />}
      {problems > 0 && <CountDot count={problems} tone="warning" label={plural(problems, 'finding')} />}
      {notes > 0 && <CountDot count={notes} tone="muted" label={plural(notes, 'note')} />}
      {done > 0 && <Check size={10} aria-label={`${done} applied or skipped`} className="shrink-0" />}
    </>
  )
  return (
    <Tile
      nodeId={block.id}
      label={block.label}
      meta={block.tokens === null ? undefined : formatTokens(block.tokens)}
      marks={block.sharedWithDefault || block.readOnly || problems + notes + done > 0 ? marks : undefined}
      width={width}
      height={height}
      selected={selected}
      stack={block.collapsed}
      dimmed={!lit && !selected}
      tooltip={block.item?.path ?? (block.collapsed ? `${block.label}: click to show each one` : block.label)}
      onClick={click}
    />
  )
}

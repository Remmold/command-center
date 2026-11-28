import type { DriftChecksView, DriftRunView, FindingsRun } from '../../../../shared/findings'
import { driftCheckTitle } from '../../../../shared/driftCheck'
import { timeAgo } from '../../../state/nowBuilding'
import { useProjectViewsStore } from '../../../state/projectViewsStore'
import { isHosted } from '../../../state/chatDrawer'
import { openSession } from '../../../state/sessionNavigation'
import { Badge } from '../../ui/Badge'
import { Button } from '../../ui/Button'
import { Checklist, type CheckState } from '../../ui/Checklist'
import { SectionLabel } from '../../ui/SectionLabel'

const STEP_STATES: Record<FindingsRun['steps'][number]['status'], CheckState> = { pending: 'unchecked', running: 'mixed', done: 'checked' }

function DriftRun({ shown, now }: { shown: DriftRunView; now: number }) {
  const { run } = shown
  const at = Date.parse(run.startedAt)
  const chatOpen = useProjectViewsStore((s) => isHosted(s.views, run.sessionId)) && shown.state !== 'stopped'
  return (
    <section aria-label={`Drift check ${run.runId}`} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <SectionLabel as="h3">{driftCheckTitle(run.scope)}</SectionLabel>
        {Number.isNaN(at) ? <span>checked at an unknown time</span> : <span title={new Date(at).toLocaleString()}>checked {timeAgo(at, now)}</span>}
        {shown.state === 'running' && <Badge tone="quiet">running</Badge>}
        {shown.state === 'stopped' && (
          <Badge tone="quiet" tooltip="Its session is gone from Work before the run finished.">
            stopped
          </Badge>
        )}
        {shown.writing && <Badge tone="quiet">run is writing…</Badge>}
        {shown.files === 'account' && (
          <Badge tone="quiet" tooltip="This run covers other projects; only its findings on account files show here.">
            account files only
          </Badge>
        )}
        {shown.note && <Badge tone="quiet-warning">{shown.note}</Badge>}
        {chatOpen && (
          <span className="ml-auto">
            <Button variant="ghost" onClick={() => openSession(run.sessionId)} tooltip="Show this run's session in Work">
              Open chat
            </Button>
          </span>
        )}
      </div>
      <Checklist entries={run.steps.map((s) => ({ label: s.title, state: STEP_STATES[s.status] }))} />
    </section>
  )
}

/** The latest drift checks covering the workspace, each with its date and its steps' status. */
export function DriftRuns({ drift }: { drift: DriftChecksView | null }) {
  if (drift === null) return null
  if (drift.runs.length === 0) return <p className="px-3 pt-2 text-[11px] text-faint">No drift check covers this workspace yet.</p>
  const now = Date.now()
  return (
    <div className="flex shrink-0 flex-col gap-2 border-b border-subtle px-3 py-2">
      {drift.runs.map((shown) => (
        <DriftRun key={shown.file} shown={shown} now={now} />
      ))}
    </div>
  )
}

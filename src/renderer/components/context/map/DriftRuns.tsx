import type { DriftChecksView, DriftRunView, FindingsRun } from '../../../../shared/findings'
import { timeAgo } from '../../../state/nowBuilding'
import { Badge } from '../../ui/Badge'
import { Checklist, type CheckState } from '../../ui/Checklist'
import { SectionLabel } from '../../ui/SectionLabel'

const SCOPE_TITLES: Record<FindingsRun['scope'], string> = { project: 'This project', account: 'Account', 'cross-project': 'Across projects' }

const STEP_STATES: Record<FindingsRun['steps'][number]['status'], CheckState> = { pending: 'unchecked', running: 'mixed', done: 'checked' }

function checked(run: FindingsRun, now: number): string {
  const at = Date.parse(run.startedAt)
  return Number.isNaN(at) ? 'checked at an unknown time' : `checked ${timeAgo(at, now)}`
}

function DriftRun({ shown, now }: { shown: DriftRunView; now: number }) {
  const { run } = shown
  const at = Date.parse(run.startedAt)
  return (
    <section aria-label={`Drift check ${run.runId}`} className="flex min-w-0 flex-col gap-1">
      <div className="flex min-w-0 flex-wrap items-center gap-1.5 text-[11px] text-muted">
        <SectionLabel as="h3">Drift check · {SCOPE_TITLES[run.scope]}</SectionLabel>
        <span title={Number.isNaN(at) ? run.startedAt : new Date(at).toLocaleString()}>{checked(run, now)}</span>
        {!run.done && <Badge tone="quiet">running</Badge>}
        {shown.writing && <Badge tone="quiet">run is writing…</Badge>}
        {shown.accountOnly && (
          <Badge tone="quiet" tooltip="This run covers other projects; only its findings on account files show here.">
            account files only
          </Badge>
        )}
        {shown.note && <Badge tone="quiet-warning">{shown.note}</Badge>}
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

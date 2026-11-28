import { useMemo, useState } from 'react'
import type { ActionState } from '../../../shared/actionBlocks'
import { resolveWorkspace } from '../../../shared/featureProposal'
import { HOUSEKEEPING_TAG, HOUSEKEEPING_WORDS, housekeepingOf, housekeepingRequest, type HousekeepingPlan, type HousekeepingRun } from '../../../shared/housekeeping'
import { useFeaturesStore } from '../../state/featuresStore'
import { ActionCardShell, CardField } from './ActionCardShell'
import { useToolContext } from './toolContext'

const lines = (items: readonly string[]): string => items.join('\n')

/** Finished work the main chat offers to tidy: what will go, what is skipped and why, then each item's result. */
export function HousekeepingCard({ cardKey, fields, state }: { cardKey: string; fields: Record<string, string>; state: ActionState }) {
  const { actions } = useToolContext()
  const block = useMemo(() => housekeepingOf(fields), [fields])
  const workspace = useMemo(() => resolveWorkspace(block.workspace, actions?.options ?? []), [block.workspace, actions])
  const workspaceId = workspace.kind === 'ok' ? workspace.id : null
  const request = useMemo(() => (workspaceId === null ? null : housekeepingRequest(block, workspaceId)), [block, workspaceId])
  // The last preflight's plan, and the click's results once it ran.
  const [plan, setPlan] = useState<HousekeepingPlan | null>(null)
  const [run, setRun] = useState<Extract<HousekeepingRun, { ok: true }> | null>(null)
  const stages = useFeaturesStore((s) => s.stages)
  const action = request?.ok ? request.request.action : null
  const words = action ? HOUSEKEEPING_WORDS[action] : null
  const count = plan?.will.length ?? 0
  const tests = action === 'complete-feature' && request?.ok ? stages[request.request.items[0]] : undefined
  const allPass = tests !== undefined && !tests.missing && tests.tests !== undefined && tests.tests.pass > 0 && tests.tests.fail === 0 && tests.tests.waiting === 0
  return (
    <ActionCardShell
      tag={HOUSEKEEPING_TAG}
      title="Housekeeping"
      subject={`${block.action} in ${block.workspace}`}
      state={state}
      doneNote="Done"
      preflight={
        actions && request
          ? async () => {
              if (!request.ok) return request.error
              const checked = await actions.housekeeping.check(request.request)
              setPlan(checked.ok ? checked.plan : null)
              if (!checked.ok) return checked.error
              return checked.plan.will.length > 0 ? null : 'Nothing to do: every item is skipped.'
            }
          : null
      }
      preflightKey={[workspaceId, block.action, block.feature, block.items, ...(actions?.featureNames ?? [])].join('\n')}
      button={action === 'complete-feature' ? 'Complete' : `${words?.button ?? 'Run'} ${count}`}
      running="Working…"
      run={async () => {
        if (!actions || !request?.ok) return undefined
        const result = await actions.housekeeping.run(cardKey, request.request)
        if (!result) return undefined
        if (!result.ok) return result.error
        setRun(result)
        const failed = result.results.filter((r) => !r.ok).length
        return failed === 0 ? null : `${failed} of ${result.results.length} failed; each one is listed above.`
      }}
      failed="Housekeeping did not finish"
    >
      <CardField label="Action">{block.action}</CardField>
      <CardField label="Workspace">{block.workspace}</CardField>
      {workspace.kind === 'unclear' && (
        <p data-action-warning="" role="alert" className="-mt-1 text-error">
          Workspace unclear
        </p>
      )}
      {block.feature !== undefined && <CardField label="Feature">{block.feature}</CardField>}
      {run ? (
        <CardField label="Results">{lines(run.results.map((r) => (r.ok ? `${r.item}: ${words?.done ?? 'done'}` : `${r.item}: failed: ${r.error}`)))}</CardField>
      ) : (
        plan &&
        words &&
        plan.will.length > 0 && <CardField label={words.will}>{lines(plan.will)}</CardField>
      )}
      {(run?.skipped ?? plan?.skip ?? []).length > 0 && <CardField label="Will skip">{lines((run?.skipped ?? plan?.skip ?? []).map((s) => `${s.item}: ${s.reason}`))}</CardField>}
      {action === 'complete-feature' && plan && plan.will.length > 0 && !allPass && (
        <p data-action-warning="" className="text-muted">
          Not every test step is marked Pass; Complete goes ahead anyway, as the Complete button does after asking.
        </p>
      )}
    </ActionCardShell>
  )
}

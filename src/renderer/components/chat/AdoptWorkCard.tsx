import { useMemo, useState } from 'react'
import type { ActionState } from '../../../shared/actionBlocks'
import { ADOPT_KIND_LABEL, ADOPT_TAG, adoptName, adoptOf, type AdoptPreview } from '../../../shared/adoptWork'
import { resolveWorkspace } from '../../../shared/featureProposal'
import { ActionCardShell, CardField } from './ActionCardShell'
import { useToolContext } from './toolContext'

const day = (ms: number): string => new Date(ms).toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })

function sessionNote(preview: AdoptPreview): string {
  return preview.session ? `Session found: ${preview.session.id} (${day(preview.session.mtime)})` : 'No session: a new one reads .scratch and git log first'
}

/** Open work the main chat offers to make a feature: where it is, what moves, and the session that carries on. */
export function AdoptWorkCard({ cardKey, fields, state }: { cardKey: string; fields: Record<string, string>; state: ActionState }) {
  const { actions } = useToolContext()
  const block = useMemo(() => adoptOf(fields), [fields])
  const workspace = useMemo(() => resolveWorkspace(block.workspace, actions?.options ?? []), [block.workspace, actions])
  const workspaceId = workspace.kind === 'ok' ? workspace.id : null
  // What the last preflight found; the card shows it once the scan has run.
  const [preview, setPreview] = useState<AdoptPreview | null>(null)
  const name = preview?.name ?? block.name ?? adoptName(block.branch)
  return (
    <ActionCardShell
      tag={ADOPT_TAG}
      title="Adopt work"
      subject={block.branch}
      state={state}
      doneNote="Adopted"
      preflight={
        actions && workspaceId !== null
          ? async () => {
              const checked = await actions.adopt.check(block, workspaceId)
              setPreview(checked.ok ? checked.preview : null)
              return checked.ok ? null : checked.error
            }
          : null
      }
      preflightKey={[workspaceId, block.branch, block.path, block.name, ...(actions?.featureNames ?? [])].join('\n')}
      button="Adopt"
      running="Adopting…"
      run={async () => (actions && workspaceId !== null ? actions.adopt.go(cardKey, block, workspaceId) : undefined)}
      failed="The work was not adopted"
      doneAction={actions && { label: 'Open session', run: () => actions.proposal.open(name) }}
    >
      <CardField label="Workspace">{block.workspace}</CardField>
      {workspace.kind === 'unclear' && (
        <p data-action-warning="" role="alert" className="-mt-1 text-error">
          Workspace unclear
        </p>
      )}
      <CardField label="Branch">{block.branch}</CardField>
      <CardField label="Path">{preview ? (preview.path ?? 'none (a branch without a worktree)') : (block.path ?? 'not given')}</CardField>
      {preview && (
        <>
          <CardField label="Kind">{ADOPT_KIND_LABEL[preview.kind]}</CardField>
          <CardField label="Ahead">{`${preview.ahead} commit${preview.ahead === 1 ? '' : 's'} ahead of ${preview.mainBranch}`}</CardField>
          {preview.dirty !== null && <CardField label="Dirty">{preview.dirty ? 'yes, uncommitted changes' : 'no, clean'}</CardField>}
          <CardField label="Feature">{preview.name}</CardField>
          {preview.kind !== 'worktree' && <CardField label="New worktree">{preview.worktreePath}</CardField>}
          {preview.kind === 'main-checkout' && <CardField label="Main checkout">{`${preview.mainPath} goes back to ${preview.mainBranch}`}</CardField>}
          <CardField label="Session">{sessionNote(preview)}</CardField>
        </>
      )}
    </ActionCardShell>
  )
}

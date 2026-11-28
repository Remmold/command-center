import { useMemo } from 'react'
import type { ActionState } from '../../../shared/actionBlocks'
import { PROPOSAL_TAG, proposalOf, resolveWorkspace } from '../../../shared/featureProposal'
import { ActionCardShell, CardField } from './ActionCardShell'
import { useToolContext } from './toolContext'

/** A feature the main chat proposes: its four parts in full, and Go. */
export function ProposalCard({ cardKey, fields, state }: { cardKey: string; fields: Record<string, string>; state: ActionState }) {
  const { actions } = useToolContext()
  const proposal = useMemo(() => proposalOf(fields), [fields])
  const workspace = useMemo(() => resolveWorkspace(proposal.workspace, actions?.options ?? []), [proposal.workspace, actions])
  const workspaceId = workspace.kind === 'ok' ? workspace.id : null
  const namesKey = (actions?.featureNames ?? []).join('|')
  return (
    <ActionCardShell
      tag={PROPOSAL_TAG}
      title="Feature proposal"
      subject={proposal.name}
      state={state}
      doneNote="Started"
      preflight={actions && workspaceId !== null ? () => actions.proposal.check(proposal, workspaceId) : null}
      preflightKey={[workspaceId, proposal.name, proposal.description, proposal.brief, namesKey].join('\n')}
      problemHint="Ask the main chat for another name."
      button="Go"
      running="Starting…"
      run={async () => (actions && workspaceId !== null ? actions.proposal.go(cardKey, proposal, workspaceId) : undefined)}
      failed="The feature did not start"
      doneAction={actions && { label: 'Open session', run: () => actions.proposal.open(proposal.name) }}
    >
      <CardField label="Workspace">{proposal.workspace}</CardField>
      {workspace.kind === 'unclear' && (
        <p data-action-warning="" role="alert" className="-mt-1 text-error">
          Workspace unclear
        </p>
      )}
      <CardField label="Name">{proposal.name}</CardField>
      <CardField label="Description" markdown>
        {proposal.description}
      </CardField>
      <CardField label="Starting brief" markdown>
        {proposal.brief}
      </CardField>
    </ActionCardShell>
  )
}

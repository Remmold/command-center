import { useMemo } from 'react'
import { PROPOSAL_NOT_UNDERSTOOD, proposalKey, proposalSegments, resolveWorkspace, type FeatureProposal, type ProposalState } from '../../../shared/featureProposal'
import { Markdown } from '../ui/Markdown'
import { useToolContext } from './toolContext'

const STATE_NOTE: Record<ProposalState, string | null> = {
  live: null,
  waiting: 'The chat is still answering.',
  started: 'Started',
  superseded: 'Superseded'
}

function Field({ label, children, error = false }: { label: string; children: string; error?: boolean }) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted">{label}</dt>
      <dd data-proposal-field={label.toLowerCase()} className={`whitespace-pre-wrap break-words ${error ? 'text-error' : 'text-fg'}`}>
        {children}
      </dd>
    </div>
  )
}

/** A feature the main chat proposes: its four parts in full, and where it stands. */
function ProposalCard({ proposal, state }: { proposal: FeatureProposal; state: ProposalState }) {
  const { proposals } = useToolContext()
  const workspace = useMemo(() => resolveWorkspace(proposal.workspace, proposals?.options ?? []), [proposal.workspace, proposals])
  const note = STATE_NOTE[state]
  return (
    <section data-proposal-card="" data-proposal-state={state} aria-label={`Feature proposal ${proposal.name}`} className="my-2 rounded-md border border-strong bg-sidebar px-3 py-2 text-xs">
      <div className="mb-1.5 flex items-center justify-between gap-3">
        <span className="font-medium text-fg">Feature proposal</span>
        {note && (
          <span data-proposal-note="" className="text-muted">
            {note}
          </span>
        )}
      </div>
      <dl className="flex flex-col gap-2">
        <Field label="Workspace">{proposal.workspace}</Field>
        {workspace.kind === 'unclear' && (
          <p data-proposal-warning="" role="alert" className="-mt-1 text-error">
            Workspace unclear
          </p>
        )}
        <Field label="Name">{proposal.name}</Field>
        <Field label="Description">{proposal.description}</Field>
        <Field label="Starting brief">{proposal.brief}</Field>
      </dl>
    </section>
  )
}

/** A reply's text with each proposal block drawn as a card; a block that did not parse stays text, with a note. */
export function ProposalText({ text, itemId, block }: { text: string; itemId: string; block: number }) {
  const { proposals } = useToolContext()
  return (
    <>
      {proposalSegments(text).map((segment, s) => {
        if (segment.kind === 'text') return <Markdown key={s} text={segment.text} />
        if (segment.kind === 'invalid') {
          return (
            <div key={s}>
              <Markdown text={segment.raw} />
              <p data-proposal-note="" className="text-xs text-muted">
                {PROPOSAL_NOT_UNDERSTOOD}
              </p>
            </div>
          )
        }
        return <ProposalCard key={s} proposal={segment.proposal} state={proposals?.states.get(proposalKey(itemId, block, s)) ?? 'superseded'} />
      })}
    </>
  )
}

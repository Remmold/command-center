import { useEffect, useMemo, useRef, useState } from 'react'
import { PROPOSAL_NOT_UNDERSTOOD, proposalKey, proposalSegments, resolveWorkspace, type FeatureProposal, type ProposalState } from '../../../shared/featureProposal'
import { Button } from '../ui/Button'
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
function ProposalCard({ cardKey, proposal, state }: { cardKey: string; proposal: FeatureProposal; state: ProposalState }) {
  const { proposals } = useToolContext()
  const workspace = useMemo(() => resolveWorkspace(proposal.workspace, proposals?.options ?? []), [proposal.workspace, proposals])
  const note = STATE_NOTE[state]
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // undefined: asking main; null: nothing in the way; text: why Go would fail.
  const [problem, setProblem] = useState<string | null | undefined>(undefined)
  const check = useRef(proposals?.check)
  check.current = proposals?.check
  const workspaceId = workspace.kind === 'ok' ? workspace.id : null
  const namesKey = (proposals?.featureNames ?? []).join('|')
  const { name, description, brief } = proposal
  useEffect(() => {
    if (state !== 'live' || workspaceId === null || starting) return
    let current = true
    setProblem(undefined)
    check.current?.(proposal, workspaceId).then(
      (found) => current && setProblem(found),
      () => current && setProblem('The proposal could not be checked.')
    )
    return () => {
      current = false
    }
  }, [state, workspaceId, name, description, brief, namesKey, starting])
  const go = async () => {
    if (!proposals || workspace.kind !== 'ok') return
    setStarting(true)
    setError(null)
    const failed = await proposals.go(cardKey, proposal, workspace.id)
    setStarting(false)
    if (failed) setError(failed)
  }
  const open = async () => {
    const failed = await proposals?.open(proposal.name)
    if (failed) setError(failed)
  }
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
      {error && (
        <div data-proposal-error="" role="alert" className="mt-2 text-error">
          <p className="font-medium">The feature did not start</p>
          <p className="whitespace-pre-wrap break-words">{error}</p>
        </div>
      )}
      {state === 'live' && typeof problem === 'string' && !starting && (
        <div data-proposal-problem="" role="alert" className="mt-2 text-error">
          <p>{problem}</p>
          <p>Ask the main chat for another name.</p>
        </div>
      )}
      {state === 'live' && (
        <div className="mt-2 flex justify-end">
          <Button onClick={() => void go()} disabled={starting || workspaceId === null || problem !== null}>
            {starting ? 'Starting…' : 'Go'}
          </Button>
        </div>
      )}
      {state === 'started' && (
        <div className="mt-2 flex justify-end">
          <Button variant="secondary" onClick={() => void open()}>
            Open session
          </Button>
        </div>
      )}
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
        return <ProposalCard key={s} cardKey={proposalKey(itemId, block, s)} proposal={segment.proposal} state={proposals?.states.get(proposalKey(itemId, block, s)) ?? 'superseded'} />
      })}
    </>
  )
}

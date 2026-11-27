import { actionSegments, writeActionBlock, type ActionBlockKind } from './actionBlocks'

/** The four parts of a proposal, as the card shows them. */
export interface FeatureProposal {
  /** A label from the Workspaces section of the digest, as written by the chat. */
  workspace: string
  name: string
  description: string
  brief: string
}

export const PROPOSAL_TAG = 'feature-proposal'

const PARTS: ActionBlockKind<keyof FeatureProposal>['parts'] = [
  { label: 'workspace', oneLine: true },
  { label: 'name', oneLine: true },
  { label: 'description', oneLine: false },
  { label: 'brief', oneLine: false }
]

/** The block the chat is told to write. */
export const writeProposal = (p: FeatureProposal): string =>
  writeActionBlock({ tag: PROPOSAL_TAG, parts: PARTS, instructions: [] }, { workspace: p.workspace, name: p.name, description: p.description, brief: p.brief })

const EXAMPLE = writeProposal({
  workspace: '<a label from the Workspaces section of the digest, without its folder>',
  name: '<folder-and-branch name: lowercase letters, digits and dashes>',
  description: '<what New feature would take as its description>',
  brief: '<the agreed plan: goal, scope, out of scope, open questions, first steps; it may hold fenced code>'
})

const INSTRUCTIONS = [
  'Starting a feature: when the user asks you to start a feature, write one feature-proposal block in that reply, exactly in this form (the fence is four backticks so the brief may hold fenced code):',
  EXAMPLE,
  'Rules for a feature proposal:',
  '- Fill the brief from the discussion and from what you read; list anything still undecided under open questions rather than holding the proposal back.',
  '- The workspace is a label copied exactly from the Workspaces section of the feature digest. When it is unclear which workspace the feature belongs in, ask the user instead of proposing.',
  '- Write one proposal at a time. For several features from one discussion, propose them one after another, each after the user has dealt with the one before.',
  '- After the block, tell the user to press Go on the card. Typing "go" does nothing; point at the button.',
  '- To change anything, write a new proposal block; the old card then goes read-only.',
  '- After Go, the app starts a fresh main chat, and the feature session reads the brief first. The brief is all that carries over, so put everything agreed into it. A failed start is reported to you instead; tell the user and wait for them.'
]

/** The start-feature kind: Go makes the feature. An older card reads Started once a feature has its name. */
export const FEATURE_PROPOSAL_BLOCK: ActionBlockKind<keyof FeatureProposal> = {
  tag: PROPOSAL_TAG,
  parts: PARTS,
  instructions: INSTRUCTIONS,
  doneEarlier: (fields, facts) => facts.featureNames.some((n) => n.toLowerCase() === fields.name.toLowerCase())
}

export type ProposalSegment =
  | { kind: 'text'; text: string }
  | { kind: 'proposal'; proposal: FeatureProposal }
  /** A closed `feature-proposal` block whose parts are missing, empty or out of order. */
  | { kind: 'invalid'; raw: string }

/** The proposal a parsed `feature-proposal` block holds. */
export const proposalOf = (fields: Record<string, string>): FeatureProposal => ({
  workspace: fields.workspace,
  name: fields.name,
  description: fields.description,
  brief: fields.brief
})

/** A reply's text split into ordinary text and proposal blocks. A block with no closing fence yet (still streaming) stays text. */
export function proposalSegments(text: string): ProposalSegment[] {
  return actionSegments(text, [FEATURE_PROPOSAL_BLOCK]).map((segment): ProposalSegment => {
    if (segment.kind === 'text') return segment
    if (segment.kind === 'invalid') return { kind: 'invalid', raw: segment.raw }
    return { kind: 'proposal', proposal: proposalOf(segment.fields) }
  })
}

export interface WorkspaceOption {
  id: string
  label: string
}

/** The workspace a proposal names, matched on the exact label of the New feature picker; none or several matches is unclear. */
export function resolveWorkspace(text: string, options: readonly WorkspaceOption[]): { kind: 'ok'; id: string } | { kind: 'unclear' } {
  const wanted = text.trim()
  const found = options.filter((o) => o.label === wanted)
  return found.length === 1 ? { kind: 'ok', id: found[0].id } : { kind: 'unclear' }
}

export const PROPOSAL_NOT_UNDERSTOOD = 'Proposal not understood, ask the chat to write it again'

import type { ChatItem } from './chatItems'

export const PROPOSAL_TAG = 'feature-proposal'

/** The four parts of a proposal, as the card shows them. */
export interface FeatureProposal {
  /** A label from the Workspaces section of the digest, as written by the chat. */
  workspace: string
  name: string
  description: string
  brief: string
}

export type ProposalSegment =
  | { kind: 'text'; text: string }
  | { kind: 'proposal'; proposal: FeatureProposal }
  /** A closed `feature-proposal` block whose parts are missing, empty or out of order. */
  | { kind: 'invalid'; raw: string }

const PARTS = ['workspace', 'name', 'description', 'brief'] as const
type Part = (typeof PARTS)[number]

const OPEN = new RegExp('^(`{3,})' + PROPOSAL_TAG + '[ \\t]*$')
const closes = (line: string, ticks: number): boolean => new RegExp('^`{' + ticks + ',}[ \\t]*$').test(line)
const LABEL = /^(workspace|name|description|brief):[ \t]*(.*)$/

const longestRun = (text: string): number => Math.max(0, ...(text.match(/`+/g) ?? []).map((run) => run.length))

/** The block the chat is told to write; the fence is longer than any run of backticks inside it, so a brief may hold fenced code. */
export function writeProposal(p: FeatureProposal): string {
  const fence = '`'.repeat(Math.max(4, longestRun(`${p.workspace}${p.name}${p.description}${p.brief}`) + 1))
  return [fence + PROPOSAL_TAG, `workspace: ${p.workspace}`, `name: ${p.name}`, `description: ${p.description}`, 'brief:', p.brief, fence].join('\n')
}

function parseBody(lines: readonly string[]): FeatureProposal | null {
  const parts: Record<Part, string[]> = { workspace: [], name: [], description: [], brief: [] }
  let at = -1
  for (const line of lines) {
    const label = at < 3 ? LABEL.exec(line) : null
    if (label && label[1] === PARTS[at + 1]) {
      at++
      if (label[2] !== '') parts[PARTS[at]].push(label[2])
    } else if (at >= 0) parts[PARTS[at]].push(line)
    else if (line.trim() !== '') return null
  }
  if (at < 3) return null
  const text = (part: Part): string => parts[part].join('\n').trim()
  const oneLine = (part: Part): string => {
    const lines = parts[part].filter((l) => l.trim() !== '')
    return lines.length === 1 ? lines[0].trim() : ''
  }
  const proposal = { workspace: oneLine('workspace'), name: oneLine('name'), description: text('description'), brief: text('brief') }
  return Object.values(proposal).some((v) => v === '') ? null : proposal
}

/** A reply's text split into ordinary text and proposal blocks. A block with no closing fence yet (still streaming) stays text. */
export function proposalSegments(text: string): ProposalSegment[] {
  if (!text.includes(PROPOSAL_TAG)) return [{ kind: 'text', text }]
  const lines = text.split('\n')
  const segments: ProposalSegment[] = []
  let plain: string[] = []
  const flush = (): void => {
    if (plain.join('').trim() !== '') segments.push({ kind: 'text', text: plain.join('\n') })
    plain = []
  }
  for (let i = 0; i < lines.length; i++) {
    const open = OPEN.exec(lines[i])
    const end = open ? lines.findIndex((l, j) => j > i && closes(l, open[1].length)) : -1
    if (!open || end < 0) {
      plain.push(lines[i])
      continue
    }
    flush()
    const proposal = parseBody(lines.slice(i + 1, end))
    segments.push(proposal ? { kind: 'proposal', proposal } : { kind: 'invalid', raw: lines.slice(i, end + 1).join('\n') })
    i = end
  }
  flush()
  return segments
}

/** What the card says about its proposal. `waiting`: the newest card while the chat is still answering. */
export type ProposalState = 'live' | 'waiting' | 'started' | 'superseded'

export const proposalKey = (itemId: string, block: number, segment: number): string => `${itemId}:${block}:${segment}`

/**
 * Each proposal block of the transcript, keyed by `proposalKey`. The newest block, even one that did not parse, is the only
 * one that can be live, and only while no user message follows it and the chat has settled its turn. A card reads
 * Started when a feature of its name exists, live or not, else an older one reads Superseded.
 */
export function proposalStates(items: readonly ChatItem[], settled: boolean, featureNames: readonly string[]): Map<string, ProposalState> {
  const entries: { key: string; name: string | null; itemIndex: number }[] = []
  items.forEach((item, itemIndex) => {
    if (item.kind !== 'assistant' || item.parentToolUseId) return
    item.content.forEach((block, b) => {
      if (block.type !== 'text' || typeof block.text !== 'string') return
      proposalSegments(block.text).forEach((segment, s) => {
        if (segment.kind !== 'text') entries.push({ key: proposalKey(item.id, b, s), name: segment.kind === 'proposal' ? segment.proposal.name : null, itemIndex })
      })
    })
  })
  const states = new Map<string, ProposalState>()
  const last = entries[entries.length - 1]
  const taken = new Set(featureNames.map((n) => n.toLowerCase()))
  for (const e of entries) {
    if (e.name !== null && taken.has(e.name.toLowerCase())) states.set(e.key, 'started')
    else if (e === last && !items.slice(e.itemIndex + 1).some((i) => i.kind === 'user')) states.set(e.key, settled ? 'live' : 'waiting')
    else states.set(e.key, 'superseded')
  }
  return states
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

const EXAMPLE = writeProposal({
  workspace: '<a label from the Workspaces section of the digest>',
  name: '<folder-and-branch name: lowercase letters, digits and dashes>',
  description: '<what New feature would take as its description>',
  brief: '<the agreed plan: what to build and why, decisions made, limits; it may hold fenced code>'
})

/** The main chat's rules for proposing; appended to its system prompt so a chat resumed from before this feature has them too. */
export const FEATURE_PROPOSAL_INSTRUCTIONS = [
  'You may propose a feature for the user to start. You never start one yourself: you have no tool for it, and the app starts it only when the user presses the Go button on the card your proposal becomes.',
  'When a plan is agreed and the user asks to start it, write one proposal block in your reply, exactly in this form (the fence is four backticks so the brief may hold fenced code):',
  EXAMPLE,
  'Rules:',
  '- Write one proposal at a time. For several features from one discussion, propose them one after another, each after the user has dealt with the one before.',
  '- The workspace must be copied exactly from the Workspaces section of the feature digest. When it is unclear which workspace the feature belongs in, ask the user instead of proposing.',
  '- After the block, tell the user to press Go on the card. Never say a feature has been started, created or is running until a message beginning [Command Center] says so.',
  '- To change anything, write a new proposal block; the old card then goes read-only.',
  'Apart from proposing, you stay read-only: you cannot write files, run commands, or stop, complete, reopen or delete a feature.',
  'A message beginning [Command Center] comes from the app: after a success, confirm it in words and say where to continue; after a failure, report it and wait for the user.'
].join('\n')

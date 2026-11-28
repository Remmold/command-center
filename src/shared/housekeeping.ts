import { writeActionBlock, type ActionBlockKind } from './actionBlocks'

export const HOUSEKEEPING_TAG = 'housekeeping'

export const HOUSEKEEPING_ACTIONS = ['remove-merged-worktrees', 'delete-merged-branches', 'prune-missing-worktrees', 'complete-feature'] as const

export type HousekeepingAction = (typeof HOUSEKEEPING_ACTIONS)[number]

/** The parts of a housekeeping block: `items` (one per line) for the git actions, `feature` for complete-feature. */
export interface HousekeepingBlock {
  action: string
  workspace: string
  feature?: string
  items?: string
}

const PARTS: ActionBlockKind<keyof HousekeepingBlock>['parts'] = [
  { label: 'action', oneLine: true },
  { label: 'workspace', oneLine: true },
  { label: 'feature', oneLine: true, optional: true },
  { label: 'items', oneLine: false, optional: true }
]

export const writeHousekeeping = (block: HousekeepingBlock): string => writeActionBlock({ tag: HOUSEKEEPING_TAG, parts: PARTS, instructions: [] }, block)

export const housekeepingOf = (fields: Record<string, string>): HousekeepingBlock => ({
  action: fields.action,
  workspace: fields.workspace,
  ...(fields.feature !== undefined ? { feature: fields.feature } : {}),
  ...(fields.items !== undefined ? { items: fields.items } : {})
})

/** What the card asks main to check and do: the block, its workspace resolved and its items split. */
export interface HousekeepingRequest {
  workspaceId: string
  action: HousekeepingAction
  /** Worktree paths, branch names or one feature name. */
  items: string[]
}

/** The block as a request, or why it cannot be one: an unknown action, or the wrong part for it. */
export function housekeepingRequest(block: HousekeepingBlock, workspaceId: string): { ok: true; request: HousekeepingRequest } | { ok: false; error: string } {
  const action = HOUSEKEEPING_ACTIONS.find((a) => a === block.action.trim())
  if (!action) return { ok: false, error: `Unknown housekeeping action ${block.action}; it is one of ${HOUSEKEEPING_ACTIONS.join(', ')}.` }
  if (action === 'complete-feature') {
    if (block.feature === undefined || block.items !== undefined) return { ok: false, error: 'complete-feature takes a feature: part and no items: part.' }
    return { ok: true, request: { workspaceId, action, items: [block.feature.trim()] } }
  }
  if (block.items === undefined || block.feature !== undefined) return { ok: false, error: `${action} takes an items: part, one per line, and no feature: part.` }
  const items = [...new Set(block.items.split(/\r?\n/).map((l) => l.trim().replace(/^[-*]\s+/, '')).filter((l) => l !== ''))]
  return { ok: true, request: { workspaceId, action, items } }
}

export interface HousekeepingSkip {
  item: string
  reason: string
}

/** What a click would do now: the items that pass every check, and the rest with why. */
export interface HousekeepingPlan {
  will: string[]
  skip: HousekeepingSkip[]
}

export type HousekeepingCheck = { ok: true; plan: HousekeepingPlan } | { ok: false; error: string }

export type HousekeepingItemResult = { item: string; ok: true } | { item: string; ok: false; error: string }

export type HousekeepingRun = { ok: true; results: HousekeepingItemResult[]; skipped: HousekeepingSkip[] } | { ok: false; error: string }

/** How each action reads on the card and in the outcome. */
export const HOUSEKEEPING_WORDS: Record<HousekeepingAction, { will: string; button: string; done: string; noun: string }> = {
  'remove-merged-worktrees': { will: 'Will remove', button: 'Remove', done: 'removed', noun: 'worktree' },
  'delete-merged-branches': { will: 'Will delete', button: 'Delete', done: 'deleted', noun: 'branch' },
  'prune-missing-worktrees': { will: 'Will prune', button: 'Prune', done: 'pruned', noun: 'missing worktree' },
  'complete-feature': { will: 'Will complete', button: 'Complete', done: 'completed', noun: 'feature' }
}

/** The one message the app sends the main chat after a housekeeping click: the counts, then each failure. */
export function housekeepingOutcomeMessage(workspace: string, action: HousekeepingAction, run: HousekeepingRun): string {
  if (!run.ok) return `[Command Center] Housekeeping in ${workspace} did not run: ${run.error} Report this to the user and wait for them.`
  const failed = run.results.filter((r): r is Extract<HousekeepingItemResult, { ok: false }> => !r.ok)
  const done = run.results.length - failed.length
  const counts = `${HOUSEKEEPING_WORDS[action].done} ${done}, skipped ${run.skipped.length}, failed ${failed.length}`
  const details = [...failed.map((f) => `failed ${f.item}: ${f.error}`), ...run.skipped.map((s) => `skipped ${s.item}: ${s.reason}`)]
  return `[Command Center] Housekeeping in ${workspace}: ${counts}.${details.length > 0 ? ` ${details.join('; ')}.` : ''} Confirm this to the user in words.`
}

const EXAMPLE = writeHousekeeping({
  action: '<one of: remove-merged-worktrees, delete-merged-branches, prune-missing-worktrees>',
  workspace: '<the workspace label of its Open work heading, without the folder>',
  items: '<one worktree path or branch name per line, copied from the Open work section>'
})

const COMPLETE_EXAMPLE = writeHousekeeping({ action: 'complete-feature', workspace: '<the workspace label>', feature: '<a feature name from the digest, exactly as its ## heading>' })

const INSTRUCTIONS = [
  'Housekeeping: to tidy finished work, write one housekeeping block naming each item. Removing a merged worktree, deleting a merged local branch or pruning a worktree whose folder is gone:',
  EXAMPLE,
  'Completing a feature, as its Complete button does:',
  COMPLETE_EXAMPLE,
  'Rules for housekeeping:',
  '- Propose it only from what the Open work section lists, or when the user asks. List every item explicitly, one per line, never "all".',
  '- Branches to delete come from a workspace\'s "Merged, deletable:" line: propose delete-merged-branches with each of its names on its own line. When it ends with "and N more", those are not named in the digest; say so and list only the names shown.',
  '- Before the block, say per item why it looks done: merged into main (ahead 0), its folder missing, or its tests passed.',
  '- The app checks every item again when the card shows and skips any that is not safe: a worktree with uncommitted changes or unmerged commits, a branch not fully merged or checked out, a feature\'s worktree or branch, the main checkout, any remote branch. It never forces.',
  '- After the block, tell the user to press the button on the card. The app reports how many it did, skipped and failed in a message beginning [Command Center].'
]

/** The housekeeping kind; an older card reads Superseded unless this app session ran it. */
export const HOUSEKEEPING_BLOCK: ActionBlockKind<keyof HousekeepingBlock> = { tag: HOUSEKEEPING_TAG, parts: PARTS, instructions: INSTRUCTIONS }

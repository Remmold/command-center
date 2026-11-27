import { writeActionBlock, type ActionBlockKind } from './actionBlocks'
import type { FeatureRecord } from './features'
import type { OpenWorkSession } from './openWork'

export const ADOPT_TAG = 'adopt-work'

/** The parts of an adopt-work block, as the chat writes them. `path` and `name` are optional. */
export interface AdoptBlock {
  /** A label from the Open work section of the digest. */
  workspace: string
  branch: string
  /** The worktree or main checkout the branch is in, when the chat names it. */
  path?: string
  /** The feature's name, when the branch's own would clash or not fit. */
  name?: string
}

const PARTS: ActionBlockKind<keyof AdoptBlock>['parts'] = [
  { label: 'workspace', oneLine: true },
  { label: 'branch', oneLine: true },
  { label: 'path', oneLine: true, optional: true },
  { label: 'name', oneLine: true, optional: true }
]

export const writeAdopt = (block: AdoptBlock): string => writeActionBlock({ tag: ADOPT_TAG, parts: PARTS, instructions: [] }, block)

export const adoptOf = (fields: Record<string, string>): AdoptBlock => ({
  workspace: fields.workspace,
  branch: fields.branch,
  ...(fields.path !== undefined ? { path: fields.path } : {}),
  ...(fields.name !== undefined ? { name: fields.name } : {})
})

/** The feature name a branch gives: its last segment, folder-safe. It may still clash; then the chat names one. */
export function adoptName(branch: string): string {
  const last = branch.trim().split('/').filter(Boolean).pop() ?? ''
  return last
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40)
    .replace(/-+$/, '')
}

const EXAMPLE = writeAdopt({
  workspace: '<the workspace label of its Open work heading, without the folder>',
  branch: '<the branch, exactly as the Open work line shows it>',
  path: '<optional: the path the Open work line shows, for a worktree or main checkout>',
  name: '<optional, only when the app asks for one: lowercase letters, digits and dashes>'
})

const INSTRUCTIONS = [
  'Adopting open work: when the user asks to adopt, take over or track work from the Open work section as a feature, write one adopt-work block per item:',
  EXAMPLE,
  'Rules for adopting work:',
  '- Offer adopting only for items the Open work section of the digest lists, and copy the workspace label, branch and path from it exactly. Leave out the path line for a branch without a worktree, and the name line unless the card asked for a name.',
  '- One block per item, one at a time. When the user says "adopt all" or names several, ask which ones first, then write one block, and the next after the app reports on it.',
  '- Adopting makes the work a feature in place: a worktree is kept where it is; a branch without a worktree gets one; a main checkout on a branch is switched back to main and the branch moves to a new worktree (refused while it has uncommitted changes). A Claude session found for the folder is resumed; else a new session reads the notes and git log first.',
  '- After the block, tell the user to press Adopt on the card. The app reports the outcome in a message beginning [Command Center].'
]

/** The adopt-work kind. An older card reads Done once a feature has the name it would make. */
export const ADOPT_WORK_BLOCK: ActionBlockKind<keyof AdoptBlock> = {
  tag: ADOPT_TAG,
  parts: PARTS,
  instructions: INSTRUCTIONS,
  doneEarlier: (fields, facts) => {
    const name = fields.name ?? adoptName(fields.branch)
    return facts.featureNames.some((n) => n.toLowerCase() === name.toLowerCase())
  }
}

/** What the card asks main to check and adopt: the block, its workspace resolved. */
export interface AdoptRequest {
  workspaceId: string
  branch: string
  path?: string
  name?: string
}

/** Where the work sits now: a worktree, a branch checked out nowhere, or the main checkout on that branch. */
export type AdoptKind = 'worktree' | 'branch' | 'main-checkout'

export const ADOPT_KIND_LABEL: Record<AdoptKind, string> = {
  worktree: 'worktree',
  branch: 'branch without a worktree',
  'main-checkout': 'main checkout on a branch'
}

/** What adopting would do, as found by a fresh scan of the workspace's repo. */
export interface AdoptPreview {
  kind: AdoptKind
  /** The feature's name. */
  name: string
  branch: string
  /** Where the work is now; null for a branch without a worktree. */
  path: string | null
  /** The feature's worktree: the same folder for a worktree, a new one otherwise. */
  worktreePath: string
  /** The repo's main checkout and main branch; a main checkout on the branch is switched back to it. */
  mainPath: string
  mainBranch: string
  ahead: number
  /** Null for a branch without a worktree. */
  dirty: boolean | null
  /** The Claude session the feature session resumes; null starts a new one. */
  session: OpenWorkSession | null
}

export type AdoptPreflight = { ok: true; preview: AdoptPreview } | { ok: false; error: string }

export type AdoptWorkResult = { ok: true; feature: FeatureRecord; preview: AdoptPreview } | { ok: false; error: string }

/** The steps of an adopt after its checks, in order; a failure names the one it stopped at. */
export type AdoptStep = 'switch' | 'worktree' | 'workspace' | 'record' | 'session'

const STEP_LABEL: Record<AdoptStep, string> = {
  switch: 'switching the main checkout back to main',
  worktree: 'making the worktree for the branch',
  workspace: 'adding the worktree as a workspace',
  record: 'recording the feature',
  session: 'starting the feature session'
}

/** What a failed adopt says: the step, the reason, and what its rollback could not put back (nothing, when it put back all). */
export function adoptFailureReport(branch: string, step: AdoptStep, reason: string, left: readonly string[]): string {
  const why = reason.trim().replace(/[.\s]+$/, '')
  const rest = left.length === 0 ? 'Everything was put back as it was.' : `Still to put back by hand: ${left.join('; ')}.`
  return `Could not adopt ${branch} while ${STEP_LABEL[step]}: ${why}. ${rest}`
}

/** The one message the app sends the main chat after an adopt that ran. No reset follows either way. */
export function adoptOutcomeMessage(branch: string, workspace: string, outcome: { name: string; resumed: string | null } | { error: string }): string {
  if ('error' in outcome) return `[Command Center] Adopting ${branch} in ${workspace} failed. ${outcome.error} Nothing was retried. Report this to the user and wait for them.`
  const session = outcome.resumed ? `its session resumes the Claude session ${outcome.resumed}` : 'a new session reads its .scratch notes and git log first'
  return `[Command Center] Adopted ${branch} in ${workspace} as the feature ${outcome.name}; ${session}. It has left the Open work section. Confirm this to the user in words.`
}

/** The first prompt of a new session for adopted work: read what is there, then wait. */
export function adoptedFirstPrompt(feature: Pick<FeatureRecord, 'branch' | 'worktreePath'>): string {
  return `Adopted work: branch ${feature.branch} in ${feature.worktreePath}. Read its .scratch notes and git log -20 first, then summarise where it stands and wait.`
}

/**
 * The first prompt of a resumed session whose work moved from the main checkout to a new worktree. The CLI resumes it
 * from the new folder, but the conversation remembers the old one, which is now on main.
 */
export function movedWorkPrompt(feature: Pick<FeatureRecord, 'branch' | 'worktreePath'>, from: string, mainBranch: string): string {
  return `This work moved: branch ${feature.branch} is now in ${feature.worktreePath}, and ${from} is back on ${mainBranch}. Work only in ${feature.worktreePath} from now on. Run git log -20 there, then summarise where it stands and wait.`
}

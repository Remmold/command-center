/** The newest Claude transcript for a folder: its session id (the file stem) and when it was last written. */
export interface OpenWorkSession {
  id: string
  mtime: number
}

/** A worktree no feature tracks. `branch` is null when it is detached. */
export interface OpenWorktree {
  kind: 'worktree'
  path: string
  branch: string | null
  /** Unix ms of the last commit on its HEAD; null when there is none. */
  lastCommitAt: number | null
  ahead: number
  dirty: boolean
  session: OpenWorkSession | null
}

/** A local branch not merged into main and checked out nowhere. */
export interface OpenBranch {
  kind: 'branch'
  branch: string
  lastCommitAt: number | null
  ahead: number
}

/** The repo's main checkout sitting on another branch than main. Adopting it must refuse while it is dirty. */
export interface OpenMainCheckout {
  kind: 'main-checkout'
  path: string
  branch: string | null
  lastCommitAt: number | null
  ahead: number
  dirty: boolean
  session: OpenWorkSession | null
}

export type OpenWorkItem = OpenWorktree | OpenBranch | OpenMainCheckout

/** A worktree git still lists whose folder is gone or that git marks prunable. */
export interface MissingWorktree {
  path: string
  branch: string | null
}

/** One repo, named after its main checkout's workspace when that is added, else the first of its workspaces. */
export interface OpenWorkspaceReport {
  workspaceId: string
  label: string
  path: string
  mainBranch: string | null
  items: OpenWorkItem[]
  missing: MissingWorktree[]
  /** Set when a git command failed; the items are then empty. */
  error?: string
}

export interface OpenWorkReport {
  scannedAt: number
  workspaces: OpenWorkspaceReport[]
}

/** How many items each workspace shows in the formatted section before "and N more". */
export const OPEN_WORK_CAP = 15

const DAY_MS = 86_400_000

const newestFirst = (a: OpenWorkItem, b: OpenWorkItem): number => (b.lastCommitAt ?? -Infinity) - (a.lastCommitAt ?? -Infinity)

function ageOf(at: number | null, now: number): string {
  return at === null ? 'no commits' : `${Math.max(0, Math.floor((now - at) / DAY_MS))}d`
}

function line(item: OpenWorkItem, now: number): string {
  const branch = item.branch ?? '(detached)'
  const parts = item.kind === 'branch' ? [`branch ${branch}`] : [`${item.kind} ${branch}`, item.path]
  parts.push(ageOf(item.lastCommitAt, now), `ahead ${item.ahead}`)
  if (item.kind !== 'branch') parts.push(item.dirty ? 'dirty' : 'clean', item.session ? `session ${item.session.id}` : 'no session')
  return `- ${parts.join(' · ')}`
}

/** The digest section the main chat reads: per workspace, its untracked work newest first, at most 15 items each. */
export function formatOpenWork(report: OpenWorkReport): string {
  const out = ['# Open work, not tracked', '', 'Per item: kind, branch, path, days since last commit, commits ahead of main, dirty, last Claude session.']
  const shown = report.workspaces.filter((w) => w.error !== undefined || w.items.length > 0 || w.missing.length > 0)
  if (shown.length === 0) out.push('', 'Nothing open.')
  for (const w of shown) {
    out.push('', `## ${w.label} (${w.path}${w.mainBranch ? `, main ${w.mainBranch}` : ''})`)
    if (w.error !== undefined) {
      out.push(`error: ${w.error}`)
      continue
    }
    const items = [...w.items].sort(newestFirst)
    out.push(...items.slice(0, OPEN_WORK_CAP).map((item) => line(item, report.scannedAt)))
    if (items.length > OPEN_WORK_CAP) out.push(`- and ${items.length - OPEN_WORK_CAP} more`)
    const missing = w.missing.slice(0, OPEN_WORK_CAP).map((m) => `${m.path} (${m.branch ?? 'detached'})`)
    if (w.missing.length > OPEN_WORK_CAP) missing.push(`and ${w.missing.length - OPEN_WORK_CAP} more`)
    if (missing.length > 0) out.push(`- missing worktrees: ${missing.join('; ')}`)
  }
  return `${out.join('\n')}\n`
}

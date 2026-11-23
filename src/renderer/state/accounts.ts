import { DEFAULT_PROFILE_NAME } from '../../shared/profiles'
import { DEFAULT_PROFILE_ID, type AccountProfile, type CliAccount, type ProfileUsage, type Workspace } from '../../shared/types'

/** One Claude account profile as the app shows it, e.g. "Personal · Max". */
export interface Account {
  profileId: string
  name: string
  plan: string | null
  label: string
  /** The login's email, for tooltips; null until a check or session has read it. */
  email: string | null
}

export interface AccountsInput {
  /** In the order Settings lists them, Default first. */
  profiles: ReadonlyArray<Pick<AccountProfile, 'id' | 'name'>>
  usage: Readonly<Record<string, Pick<ProfileUsage, 'account'>>>
  /** The account a session's `initialize` reply named, by profile id. */
  initAccounts: Readonly<Record<string, CliAccount>>
}

export function planName(subscriptionType: string | undefined): string | null {
  const plan = subscriptionType?.trim()
  return plan ? plan[0].toUpperCase() + plan.slice(1) : null
}

export function accountList(input: AccountsInput): Account[] {
  return input.profiles.map((p) => {
    const known = input.usage[p.id]?.account ?? null
    const init = input.initAccounts[p.id]
    const email = known?.email ?? init?.email ?? null
    const plan = planName(known?.subscriptionType ?? init?.subscriptionType)
    return { profileId: p.id, name: p.name, plan, label: plan ? `${p.name} · ${plan}` : p.name, email }
  })
}

/** The Work list's account header, e.g. "Personal · Ultra": the plan loses its "Claude " prefix to fit 300 px. */
export function sectionTitle(account: Pick<Account, 'name' | 'plan'>): string {
  const plan = account.plan?.replace(/^Claude\s+/i, '')
  return plan ? `${account.name} · ${plan}` : account.name
}

const UNKNOWN: Account = { profileId: DEFAULT_PROFILE_ID, name: DEFAULT_PROFILE_NAME, plan: null, label: DEFAULT_PROFILE_NAME, email: null }

/** A profile the list no longer has runs on Default, as main resolves it. */
export function accountOf(accounts: readonly Account[], profileId: string): Account {
  return accounts.find((a) => a.profileId === profileId) ?? accounts.find((a) => a.profileId === DEFAULT_PROFILE_ID) ?? UNKNOWN
}

/** Index of an account in Settings order, for sorting. */
export function accountRank(accounts: readonly Account[]): (profileId: string) => number {
  const rank = new Map(accounts.map((a, i) => [a.profileId, i]))
  return (profileId) => rank.get(accountOf(accounts, profileId).profileId) ?? accounts.length
}

export interface AccountWorkspaces {
  account: Account
  workspaces: Workspace[]
}

/** Accounts that have workspaces, in Settings order; workspaces keep their saved order. */
export function workspacesByAccount(workspaces: readonly Workspace[], accounts: readonly Account[]): AccountWorkspaces[] {
  const byAccount = new Map<string, Workspace[]>()
  for (const w of workspaces) {
    const id = accountOf(accounts, w.profileId).profileId
    byAccount.set(id, [...(byAccount.get(id) ?? []), w])
  }
  const known = accounts.length > 0 ? accounts : [UNKNOWN]
  return known.flatMap((account) => {
    const list = byAccount.get(account.profileId)
    return list ? [{ account, workspaces: list }] : []
  })
}

/** A repo's account is the account of its first workspace in saved order. */
export function repoAccounts(workspaces: readonly Workspace[], accounts: readonly Account[]): Record<string, Account> {
  const out: Record<string, Account> = {}
  for (const w of workspaces) out[w.repoGroupKey] ??= accountOf(accounts, w.profileId)
  return out
}

/** The ids with `moved` taken out and put where `target` was. */
export function moveWorkspace(ids: readonly string[], moved: string, target: string): string[] {
  const from = ids.indexOf(moved)
  const to = ids.indexOf(target)
  if (from === -1 || to === -1 || from === to) return [...ids]
  const rest = ids.filter((id) => id !== moved)
  return [...rest.slice(0, to), moved, ...rest.slice(to)]
}

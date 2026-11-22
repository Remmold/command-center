import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { accountList, accountOf, moveWorkspace, repoAccounts, workspacesByAccount, type AccountsInput } from './accounts'

const PROFILES = [
  { id: 'default', name: 'Default' },
  { id: 'p-work', name: 'Work' },
  { id: 'p-personal', name: 'Personal' }
]

function input(over: Partial<AccountsInput> = {}): AccountsInput {
  return { profiles: PROFILES, usage: {}, initAccounts: {}, ...over }
}

const workspace = (id: string, profileId: string, repo = id, worktreeTag = ''): Workspace => ({
  id,
  name: id,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId,
  repoGroupKey: `key-${repo}`,
  repoName: repo,
  worktreeTag
})

describe('account list', () => {
  it('names each account by profile and plan, in the order Settings lists the profiles', () => {
    const list = accountList(
      input({
        usage: {
          'p-work': { account: { email: 'a@work.com', subscriptionType: 'team' } },
          'p-personal': { account: { email: 'a@home.com', subscriptionType: 'max' } }
        }
      })
    )
    expect(list.map((a) => a.label)).toEqual(['Default', 'Work · Team', 'Personal · Max'])
  })

  it("shows the Default profile under its account's email, not as Default", () => {
    const list = accountList(input({ usage: { default: { account: { email: 'andreas@home.com', subscriptionType: 'pro' } } } }))
    expect(list[0].label).toBe('andreas@home.com · Pro')
  })

  it("takes the plan from a session's initialize reply when usage has not read it yet", () => {
    const list = accountList(input({ initAccounts: { 'p-work': { subscriptionType: 'enterprise' } } }))
    expect(list[1].label).toBe('Work · Enterprise')
  })

  it('finds the account of a profile id, falling back to the default account for a removed profile', () => {
    const list = accountList(input())
    expect(accountOf(list, 'p-personal').label).toBe('Personal')
    expect(accountOf(list, 'gone').profileId).toBe('default')
  })
})

describe('workspaces by account', () => {
  const list = accountList(input())

  it('lists workspaces under their account, accounts in Settings order, workspaces in saved order', () => {
    const groups = workspacesByAccount(
      [workspace('a', 'p-personal'), workspace('b', 'default'), workspace('c', 'p-personal'), workspace('d', 'gone')],
      list
    )
    expect(groups.map((g) => [g.account.label, g.workspaces.map((w) => w.id)])).toEqual([
      ['Default', ['b', 'd']],
      ['Personal', ['a', 'c']]
    ])
  })

  it("gives a repo the account of its first workspace in saved order", () => {
    const byRepo = repoAccounts([workspace('wt', 'p-work', 'mm', 'shard-2'), workspace('main', 'default', 'mm'), workspace('x', 'p-personal')], list)
    expect(byRepo['key-mm'].profileId).toBe('p-work')
    expect(byRepo['key-x'].profileId).toBe('p-personal')
  })
})

describe('moving a workspace', () => {
  const ids = ['a', 'b', 'c', 'd']

  it('moves a workspace to the place of the one it is dropped on', () => {
    expect(moveWorkspace(ids, 'a', 'c')).toEqual(['b', 'c', 'a', 'd'])
    expect(moveWorkspace(ids, 'd', 'b')).toEqual(['a', 'd', 'b', 'c'])
  })

  it('leaves the order alone for a drop on itself or an unknown id', () => {
    expect(moveWorkspace(ids, 'b', 'b')).toEqual(ids)
    expect(moveWorkspace(ids, 'x', 'b')).toEqual(ids)
  })
})

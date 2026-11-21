import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { workspacePicks } from './workspacePicker'

const workspace = (id: string, repoName: string, worktreeTag = ''): Workspace => ({
  id,
  name: worktreeTag ? `${repoName}-${worktreeTag}` : repoName,
  path: `C:/src/${id}`,
  createdAt: 0,
  profileId: 'default',
  repoGroupKey: `key-${repoName}`,
  repoName,
  worktreeTag
})

const WORKSPACES = [
  workspace('mm2', 'mmorpg', 'shard-2'),
  workspace('cc', 'command-center'),
  workspace('mm', 'mmorpg'),
  workspace('mm1', 'mmorpg', 'shard-1')
]

const ids = (query: string, identities = {}) => workspacePicks({ workspaces: WORKSPACES, identities, query }).map((p) => p.workspace.id)

describe('workspace picker', () => {
  it('lists every workspace by repo name, main checkout before its worktrees', () => {
    expect(ids('')).toEqual(['cc', 'mm', 'mm1', 'mm2'])
  })

  it('keeps the workspaces whose repo, worktree tag or folder contain every typed word', () => {
    expect(ids('MMO shard')).toEqual(['mm1', 'mm2'])
    expect(ids('shard-2')).toEqual(['mm2'])
    expect(ids('src/cc')).toEqual(['cc'])
    expect(ids('src\\cc')).toEqual(['cc'])
    expect(ids('nothing')).toEqual([])
  })

  it('matches and orders by the repo display name a rename gave it', () => {
    expect(ids('hub', { 'key-command-center': { displayName: 'Hub' } })).toEqual(['cc'])
    expect(ids('', { 'key-mmorpg': { displayName: 'Arena' } })).toEqual(['mm', 'mm1', 'mm2', 'cc'])
  })
})

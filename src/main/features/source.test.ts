import { describe, expect, it } from 'vitest'
import type { Workspace } from '../../shared/types'
import { sourceCandidates } from './source'

const ws = (id: string, repoGroupKey: string, worktreeTag: string): Workspace => ({ id, name: id, path: `/${id}`, createdAt: 1, profileId: 'p', repoGroupKey, repoName: 'r', worktreeTag })

describe('sourceCandidates', () => {
  const all = [ws('main', 'g', ''), ws('other-tree', 'g', 'x'), ws('feat', 'g', 'login'), ws('stranger', 'h', '')]

  it('puts the stored source first', () => {
    expect(sourceCandidates({ workspaceId: 'feat', sourceWorkspaceId: 'other-tree' }, all)).toEqual(['other-tree', 'main'])
  })

  it('maps an old record back through the repo group, main checkout first, never another repo', () => {
    expect(sourceCandidates({ workspaceId: 'feat' }, all)).toEqual(['main', 'other-tree'])
  })

  it('has nothing for a removed worktree workspace and no stored source', () => {
    expect(sourceCandidates({ workspaceId: 'gone' }, all)).toEqual([])
  })
})

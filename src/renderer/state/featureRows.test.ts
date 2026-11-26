import { describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import { accountNote, featureRows } from './featureRows'

const feature = (name: string, workspaceId: string, completedAt: number | null = null): FeatureRecord => ({
  name,
  workspaceId,
  worktreePath: `C:/w/${name}`,
  branch: `feat/${name}`,
  sessionId: `s-${name}`,
  ports: [],
  startedAt: 1,
  completedAt
})
const workspace = (id: string, profileId: string): Workspace => ({ id, name: id, path: `C:/${id}`, createdAt: 1, profileId, repoGroupKey: 'k', repoName: 'r', worktreeTag: id })

describe('featureRows', () => {
  const workspaces = [workspace('w1', 'p1'), workspace('w2', 'gone')]
  const profiles = [{ id: 'p1', name: 'Work (renamed)' }]

  it('shows a renamed profile under its new name and the session status', () => {
    const rows = featureRows([feature('a', 'w1')], workspaces, profiles, { 's-a': { paneId: 's-a', status: 'running', since: 1, cwd: '' } as never })
    expect(rows.map((r) => [r.name, r.status, accountNote(r)])).toEqual([['a', 'running', 'Work (renamed)']])
  })

  it('keeps a feature whose profile was removed, with a plain note', () => {
    const rows = featureRows([feature('b', 'w2')], workspaces, profiles, {})
    expect(rows.map((r) => [r.name, r.status, accountNote(r)])).toEqual([['b', 'idle', 'account removed']])
  })

  it('keeps a feature whose workspace is missing, and leaves completed ones out', () => {
    const rows = featureRows([feature('c', 'nope'), feature('d', 'w1', 5)], workspaces, profiles, {})
    expect(rows.map((r) => r.name)).toEqual(['c'])
    expect(rows[0].workspace).toBeUndefined()
  })
})

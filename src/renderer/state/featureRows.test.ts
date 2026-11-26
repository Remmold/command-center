import { describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import type { Workspace } from '../../shared/types'
import type { FeatureStageView } from '../../shared/featureStage'
import { accountNote, completedFeatureRows, featureRows, stageNote } from './featureRows'

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
    const rows = featureRows([feature('a', 'w1')], workspaces, profiles, { 's-a': { paneId: 's-a', status: 'running', since: 1, cwd: '' } as never }, {})
    expect(rows.map((r) => [r.name, r.status, accountNote(r)])).toEqual([['a', 'running', 'Work (renamed)']])
  })

  it('keeps a feature whose profile was removed, with a plain note', () => {
    const rows = featureRows([feature('b', 'w2')], workspaces, profiles, {}, {})
    expect(rows.map((r) => [r.name, r.status, accountNote(r)])).toEqual([['b', 'idle', 'account removed']])
  })

  it('keeps a feature whose workspace is missing, and leaves completed ones out', () => {
    const rows = featureRows([feature('c', 'nope'), feature('d', 'w1', 5)], workspaces, profiles, {}, {})
    expect(rows.map((r) => r.name)).toEqual(['c'])
    expect(rows[0].workspace).toBeUndefined()
    expect(accountNote(rows[0])).toBe('workspace removed')
  })

  it('shows the stage with tickets done out of total, or a plain note when the worktree is gone', () => {
    const stages: Record<string, FeatureStageView> = { a: { missing: false, stage: 'Building', done: 2, total: 5 }, b: { missing: true } }
    const rows = featureRows([feature('a', 'w1'), feature('b', 'w1'), feature('c', 'w1')], workspaces, profiles, {}, stages)
    expect(rows.map((r) => stageNote(r))).toEqual(['Building · 2/5', 'worktree missing', ''])
  })

  it('adds the last test result once a checklist exists, and leaves the stage alone before', () => {
    const t = (tests?: { pass: number; fail: number; waiting: number }): FeatureStageView => ({ missing: false, stage: 'Testing', done: 3, total: 3, tests })
    const stages: Record<string, FeatureStageView> = { a: t({ pass: 1, fail: 2, waiting: 0 }), b: t({ pass: 0, fail: 0, waiting: 4 }), c: t({ pass: 4, fail: 0, waiting: 0 }), d: t() }
    const rows = featureRows(['a', 'b', 'c', 'd'].map((n) => feature(n, 'w1')), workspaces, profiles, {}, stages)
    expect(rows.map((r) => stageNote(r))).toEqual(['Testing · 3/3 · 2 failed', 'Testing · 3/3 · 4 waiting', 'Testing · 3/3 · all Pass', 'Testing · 3/3'])
  })

  it('lists completed features separately, and a completed record keeps its row out of the active group', () => {
    const all = [feature('x', 'w1'), feature('y', 'w1', 9)]
    expect(featureRows(all, workspaces, profiles, {}, {}).map((r) => r.name)).toEqual(['x'])
    expect(completedFeatureRows(all, workspaces, profiles, {}, {}).map((r) => r.name)).toEqual(['y'])
  })
})

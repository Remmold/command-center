import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { FeatureRecord } from '../../shared/features'
import { createFeatureStore } from './store'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

const record = (name: string): FeatureRecord => ({
  name,
  workspaceId: 'w',
  worktreePath: `/wt/${name}`,
  branch: name,
  sessionId: `pane-${name}`,
  ports: [],
  startedAt: 1,
  completedAt: null
})

describe('feature store', () => {
  it('keeps the Claude session id on one record and leaves the others', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-features-'))
    dirs.push(dir)
    const store = createFeatureStore(join(dir, 'features.json'))
    await store.add(record('a'))
    await store.add(record('b'))
    await store.setClaudeSessionId('a', 'claude-1')
    await store.setClaudeSessionId('a', 'claude-2')
    const [a, b] = await store.list()
    expect(a.claudeSessionId).toBe('claude-2')
    expect(b.claudeSessionId).toBeUndefined()
  })
  it('ignores a feature that does not exist', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-features-'))
    dirs.push(dir)
    const store = createFeatureStore(join(dir, 'features.json'))
    await store.setClaudeSessionId('nope', 'x')
    expect(await store.list()).toEqual([])
  })
  it('marks one feature completed and re-opens it, leaving the others', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cc-features-'))
    dirs.push(dir)
    const store = createFeatureStore(join(dir, 'features.json'))
    await store.add(record('a'))
    await store.add(record('b'))
    await store.setCompleted('a', 7)
    expect((await store.list()).map((r) => r.completedAt)).toEqual([7, null])
    await store.setCompleted('a', null)
    expect((await store.list()).map((r) => r.completedAt)).toEqual([null, null])
  })
})

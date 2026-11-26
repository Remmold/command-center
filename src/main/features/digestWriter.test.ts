import { mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DigestFeature } from './digest'
import { createDigestWriter } from './digestWriter'

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-digest-'))
})
afterEach(() => {
  vi.useRealTimers()
  rmSync(root, { recursive: true, force: true })
})

const feature = (over: Partial<DigestFeature> = {}): DigestFeature => ({
  name: 'a',
  workspaceName: 'app',
  worktreePath: join(root, 'wt'),
  completedAt: null,
  accountName: 'Work',
  status: 'idle',
  stage: { missing: false, stage: 'Spec', done: 0, total: 0 },
  servers: [],
  rateLimit: null,
  ...over
})

describe('digest writer', () => {
  it('writes the digest, with a folder made on the way', async () => {
    const file = join(root, 'deep', 'feature-digest.md')
    const writer = createDigestWriter({ file, features: async () => [feature()], now: () => 1_000 })
    expect(await writer.flush()).toBe(true)
    expect(readFileSync(file, 'utf-8')).toContain('## a')
    writer.stop()
  })

  it('does not write again when only the time moved', async () => {
    const file = join(root, 'd.md')
    let at = 1_000
    const writer = createDigestWriter({ file, features: async () => [feature()], now: () => at })
    await writer.flush()
    const first = readFileSync(file, 'utf-8')
    at = 9_999_999
    expect(await writer.flush()).toBe(false)
    expect(readFileSync(file, 'utf-8')).toBe(first)
    writer.stop()
  })

  it('does not write on a start with the same facts already on disk', async () => {
    const file = join(root, 'd.md')
    await createDigestWriter({ file, features: async () => [feature()] }).flush()
    const before = statSync(file).mtimeMs
    expect(await createDigestWriter({ file, features: async () => [feature()] }).flush()).toBe(false)
    expect(statSync(file).mtimeMs).toBe(before)
  })

  it('writes again when only the workspace list changed', async () => {
    const file = join(root, 'd.md')
    let labels = ['app']
    const writer = createDigestWriter({ file, features: async () => [feature()], workspaceLabels: async () => labels })
    await writer.flush()
    expect(readFileSync(file, 'utf-8')).toContain('- app\n')
    expect(await writer.flush()).toBe(false)
    labels = ['app', 'api']
    expect(await writer.flush()).toBe(true)
    expect(readFileSync(file, 'utf-8')).toContain('- api\n')
    writer.stop()
  })

  it('writes again when a fact changed', async () => {
    const file = join(root, 'd.md')
    let features = [feature()]
    const writer = createDigestWriter({ file, features: async () => features })
    await writer.flush()
    features = [feature({ status: 'running' })]
    expect(await writer.flush()).toBe(true)
    expect(readFileSync(file, 'utf-8')).toContain('- Session: running')
    writer.stop()
  })

  it('folds a burst of changes into one read after the debounce', async () => {
    vi.useFakeTimers()
    const gather = vi.fn(async () => [feature()])
    const writer = createDigestWriter({ file: join(root, 'd.md'), features: gather, debounceMs: 500 })
    writer.changed()
    writer.changed()
    writer.changed()
    await vi.advanceTimersByTimeAsync(499)
    expect(gather).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(gather).toHaveBeenCalledTimes(1)
    writer.stop()
  })

  it('writes nothing on its own, with no change announced', async () => {
    vi.useFakeTimers()
    const gather = vi.fn(async () => [feature()])
    const writer = createDigestWriter({ file: join(root, 'd.md'), features: gather })
    await vi.advanceTimersByTimeAsync(10 * 60_000)
    expect(gather).not.toHaveBeenCalled()
    writer.stop()
  })

  it('survives a failing read and keeps the file as it was', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    const writer = createDigestWriter({ file: join(root, 'd.md'), features: async () => Promise.reject(new Error('boom')) })
    expect(await writer.flush()).toBe(false)
    err.mockRestore()
    writer.stop()
  })
})

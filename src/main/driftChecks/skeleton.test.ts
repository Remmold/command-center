import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { FindingsRun } from '../../shared/findings'
import { discardSkeleton, writeSkeleton } from './skeleton'

let folder: string

const skeleton = (runId: string): FindingsRun => ({
  version: 1,
  check: 'drift',
  scope: 'project',
  runId,
  sessionId: 's1',
  startedAt: '2026-11-20T10:00:00.000Z',
  accountFolder: 'C:\\Users\\a\\.claude',
  workspaces: ['C:\\projects\\one'],
  steps: [],
  findings: [],
  done: false
})

const exists = (file: string): Promise<boolean> => fs.access(file).then(() => true, () => false)

beforeEach(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), 'cc-drift-skeleton-'))
})

afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true })
})

describe('discardSkeleton', () => {
  it('removes a run file that is still the skeleton the app wrote', async () => {
    const written = await writeSkeleton(folder, skeleton('r1'))
    if (!written.ok) throw new Error(written.error)
    await discardSkeleton(folder, written.file)
    expect(await exists(written.file)).toBe(false)
  })

  it('keeps a run file the session has written steps into', async () => {
    const file = join(folder, 'r2.json')
    await fs.writeFile(file, JSON.stringify({ ...skeleton('r2'), steps: [{ id: 'a', title: 'A', status: 'running' }] }))
    await discardSkeleton(folder, file)
    expect(await exists(file)).toBe(true)
  })

  it('touches nothing outside the drift-checks folder', async () => {
    const outside = await fs.mkdtemp(join(tmpdir(), 'cc-drift-outside-'))
    try {
      const file = join(outside, 'r3.json')
      await fs.writeFile(file, JSON.stringify(skeleton('r3')))
      await discardSkeleton(folder, file)
      expect(await exists(file)).toBe(true)
    } finally {
      await fs.rm(outside, { recursive: true, force: true })
    }
  })
})

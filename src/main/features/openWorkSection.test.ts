import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpenWorkReport } from '../../shared/openWork'
import { createDigestWriter } from './digestWriter'
import { OPEN_WORK_TTL_MS, createOpenWorkSection } from './openWorkSection'

const report = (branch: string): OpenWorkReport => ({
  scannedAt: 0,
  workspaces: [{ workspaceId: 'a', label: 'app', path: 'C:\\app', mainBranch: 'main', items: [{ kind: 'branch', branch, lastCommitAt: 0, ahead: 2 }], missing: [] }]
})

let root: string
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'cc-open-work-'))
})
afterEach(() => {
  rmSync(root, { recursive: true, force: true })
})

describe('the Open work section of the digest', () => {
  it('is the scan, formatted', async () => {
    const section = createOpenWorkSection({ scan: async () => report('spike') })
    const text = await section()
    expect(text).toMatch(/^# Open work, not tracked\n/)
    expect(text).toContain('- branch spike · 0d · ahead 2')
  })

  it('scans at most once per 60 s, and again after', async () => {
    let at = 1_000
    let scans = 0
    const scan = vi.fn(async () => report(`b${scans++}`))
    const section = createOpenWorkSection({ scan, now: () => at })
    const first = await section()
    at += OPEN_WORK_TTL_MS - 1
    expect(await section()).toBe(first)
    expect(scan).toHaveBeenCalledTimes(1)
    at += 1
    expect(await section()).toContain('- branch b1 ')
    expect(scan).toHaveBeenCalledTimes(2)
  })

  it('lets callers during a scan share it', async () => {
    const scan = vi.fn(async () => report('x'))
    const section = createOpenWorkSection({ scan })
    await Promise.all([section(), section(), section()])
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('writes the failure line instead when the scan fails, and does not retry within 60 s', async () => {
    let at = 0
    const scan = vi.fn(async (): Promise<OpenWorkReport> => Promise.reject(new Error('spawn git ENOENT\nmore detail')))
    const section = createOpenWorkSection({ scan, now: () => at })
    expect(await section()).toBe('Open work: scan failed (spawn git ENOENT)\n')
    at += 30_000
    await section()
    expect(scan).toHaveBeenCalledTimes(1)
  })

  it('never keeps the digest from being written', async () => {
    const file = join(root, 'feature-digest.md')
    const section = createOpenWorkSection({ scan: () => Promise.reject(new Error('boom')) })
    const writer = createDigestWriter({ file, features: async () => [], places: async () => ({ workspaces: [{ label: 'app', path: 'C:\\app' }], openWork: await section() }) })
    expect(await writer.flush()).toBe(true)
    const text = readFileSync(file, 'utf-8')
    expect(text).toContain('# Workspaces')
    expect(text).toContain('Open work: scan failed (boom)')
    writer.stop()
  })
})

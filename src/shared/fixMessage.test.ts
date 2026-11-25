import { describe, expect, it } from 'vitest'
import type { ShownFinding } from './findings'
import { fixMessage } from './fixMessage'

const finding = (over: Partial<ShownFinding>): ShownFinding => ({
  id: 'F1',
  path: 'C:\\projects\\one\\CLAUDE.md',
  verdict: 'stale',
  severity: 'problem',
  claim: 'Says pnpm test runs Jest',
  evidence: 'vitest.config.ts',
  fix: 'Say Vitest',
  status: 'open',
  ...over
})

const FILES = { r1: 'C:\\data\\drift-checks\\r1.json', r2: 'C:\\data\\drift-checks\\r2.json' }

const HEALTH = finding({
  id: 'H-memory-cut-1a2b',
  path: 'C:\\Users\\a\\.claude\\projects\\one\\memory\\MEMORY.md',
  verdict: 'structural',
  claim: 'MEMORY.md is 205 lines, but Claude loads only the first 200 lines',
  evidence: 'Lines 201 to 205 never reach a chat',
  fix: 'Move detail out of the index'
})

describe('fixMessage', () => {
  it('names the findings file and the ticked drift ids, asking for each to be marked applied or skipped', () => {
    const message = fixMessage([finding({ id: 'F1', runId: 'r1' }), finding({ id: 'F3', runId: 'r1' })], FILES)
    expect(message).toContain('Findings file: C:\\data\\drift-checks\\r1.json\nIds: F1, F3')
    expect(message).toMatch(/"applied" or "skipped"/)
    expect(message).not.toContain('Says pnpm test runs Jest')
  })

  it('lists each run file with its own ids when the ticks come from two runs', () => {
    const message = fixMessage([finding({ id: 'F2', runId: 'r2' }), finding({ id: 'F1', runId: 'r1' })], FILES)
    expect(message).toContain('Findings file: C:\\data\\drift-checks\\r2.json\nIds: F2')
    expect(message).toContain('Findings file: C:\\data\\drift-checks\\r1.json\nIds: F1')
  })

  it('lists health findings in full, since they are in no file', () => {
    const message = fixMessage([HEALTH], FILES)
    expect(message).not.toContain('Findings file:')
    expect(message).toContain('H-memory-cut-1a2b')
    expect(message).toContain(HEALTH.path)
    expect(message).toContain(HEALTH.claim)
    expect(message).toContain(HEALTH.evidence)
    expect(message).toContain(HEALTH.fix)
  })

  it('carries drift ids by file and health findings in full in one message for mixed ticks', () => {
    const message = fixMessage([HEALTH, finding({ id: 'F1', runId: 'r1' })], FILES)
    expect(message).toContain('Findings file: C:\\data\\drift-checks\\r1.json\nIds: F1')
    expect(message).toContain(HEALTH.claim)
    expect(message.indexOf('Findings file:')).toBeLessThan(message.indexOf(HEALTH.claim))
  })
})

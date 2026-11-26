import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureServerView } from '../../shared/featureServers'
import type { FeatureStageView } from '../../shared/featureStage'
import { digestBody, digestFileName, digestHeader, rateLimitOf, renderFeatureDigest, type DigestFeature } from './digest'

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0)
const WT = join('C:', 'wt', 'dark-mode')

const feature = (over: Partial<DigestFeature> = {}): DigestFeature => ({
  name: 'dark-mode',
  workspaceName: 'app (dark-mode)',
  worktreePath: WT,
  completedAt: null,
  accountName: 'Work',
  status: 'idle',
  stage: { missing: false, stage: 'Building', done: 1, total: 3 },
  servers: [],
  rateLimit: null,
  ...over
})

const server = (status: FeatureServerView['status'], name = 'web'): FeatureServerView => ({ name, port: 4100, status, terminalId: 't' })
const stageOf = (stage: 'Grilling' | 'Spec' | 'Tickets' | 'Building' | 'Testing' | 'Completed', done = 0, total = 0): FeatureStageView => ({ missing: false, stage, done, total })

describe('feature digest', () => {
  it.each(['Grilling', 'Spec', 'Tickets', 'Building', 'Testing'] as const)('names the %s stage with tickets done out of total', (stage) => {
    const text = digestBody([feature({ stage: stageOf(stage, 2, 5) })])
    expect(text).toContain(`- Stage: ${stage}`)
    expect(text).toContain('- Tickets: 2/5 done')
  })

  it('names workspace, account, session status, worktree and the folder to read on every feature', () => {
    const text = digestBody([feature({ status: 'needs-approval' })])
    expect(text).toContain('## dark-mode')
    expect(text).toContain('- Workspace: app (dark-mode)')
    expect(text).toContain('- Account: Work')
    expect(text).toContain('- Session: needs-approval')
    expect(text).toContain(`- Worktree: ${WT}`)
    expect(text).toContain(`- Read: ${join(WT, '.scratch', 'dark-mode')}`)
  })

  it('lists features of every account, each with its own account name', () => {
    const text = digestBody([feature({ name: 'a', accountName: 'Work' }), feature({ name: 'b', accountName: 'Personal' })])
    expect(text).toContain('- Account: Work')
    expect(text).toContain('- Account: Personal')
  })

  it('says a rate limited account is rate limited, with its reset time', () => {
    const text = digestBody([feature({ rateLimit: { window: '5-hour', resetsAt: NOW + 3_600_000 } })])
    expect(text).toContain('- Rate limit: limited (5-hour window, resets 2026-11-26T13:00:00.000Z)')
  })

  it('says an account that is not limited is not limited', () => {
    expect(digestBody([feature()])).toContain('- Rate limit: no')
  })

  it('shows a failed test result and a failed server', () => {
    const text = digestBody([
      feature({
        stage: { missing: false, stage: 'Testing', done: 3, total: 3, tests: { pass: 1, fail: 2, waiting: 0 } },
        servers: [server('failed'), server('ready', 'api')]
      })
    ])
    expect(text).toContain('- Last test result: 2 failed')
    expect(text).toContain('- Servers: Failed (web failed, api ready)')
  })

  it('says plainly when there is no test result or no server yet', () => {
    const text = digestBody([feature()])
    expect(text).toContain('- Last test result: none yet')
    expect(text).toContain('- Servers: not started')
  })

  it('says the worktree is missing instead of a stage', () => {
    expect(digestBody([feature({ stage: { missing: true } })])).toContain('- Stage: worktree folder missing')
  })

  it('says the stage is unread before it was read', () => {
    expect(digestBody([feature({ stage: undefined })])).toContain('- Stage: not read yet')
  })

  it('names an account or workspace that was removed', () => {
    const text = digestBody([feature({ accountName: null, workspaceName: null })])
    expect(text).toContain('- Account: removed')
    expect(text).toContain('- Workspace: removed')
  })

  it('lists completed features in a separate short list, not as blocks', () => {
    const text = digestBody([feature({ name: 'live' }), feature({ name: 'done-one', completedAt: 5, stage: stageOf('Completed', 3, 3) })])
    const [active, completed] = text.split('# Completed')
    expect(active).toContain('## live')
    expect(active).not.toContain('done-one')
    expect(completed).toContain('- done-one')
    expect(completed).not.toContain('## done-one')
  })

  it('says so when no feature is in progress', () => {
    expect(digestBody([])).toContain('No features in progress.')
  })

  it('puts what the file is and when it was written in the first line, apart from the body', () => {
    const text = renderFeatureDigest([feature()], NOW)
    expect(text.split('\n')[0]).toBe(digestHeader(NOW))
    expect(digestHeader(NOW)).toContain('2026-11-26T12:00:00.000Z')
    expect(text.slice(digestHeader(NOW).length + 1)).toBe(digestBody([feature()]))
  })

  it('has one fixed file name', () => {
    expect(digestFileName).toBe('feature-digest.md')
  })
})

describe('rateLimitOf', () => {
  it('finds a window used up and not yet reset', () => {
    expect(rateLimitOf({ fiveHour: { utilization: 100, resetsAt: NOW + 1 }, sevenDay: { utilization: 10, resetsAt: NOW + 9 } }, NOW)).toEqual({ window: '5-hour', resetsAt: NOW + 1 })
  })

  it('ignores a used-up window whose reset time has passed', () => {
    expect(rateLimitOf({ sevenDay: { utilization: 100, resetsAt: NOW - 1 } }, NOW)).toBeNull()
  })

  it('is not limited below the allowance or without a reading', () => {
    expect(rateLimitOf({ fiveHour: { utilization: 99, resetsAt: NOW + 1 } }, NOW)).toBeNull()
    expect(rateLimitOf(undefined, NOW)).toBeNull()
  })
})

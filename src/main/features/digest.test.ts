import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import type { FeatureServerView } from '../../shared/featureServers'
import type { FeatureStageView } from '../../shared/featureStage'
import { REPLY_LINE_MAX, digestBody, digestFileName, digestHeader, rateLimitOf, renderFeatureDigest, replyLine, type DigestFeature, type DigestModel3d } from './digest'

const NOW = Date.UTC(2026, 10, 26, 12, 0, 0)
const WT = join('C:', 'wt', 'dark-mode')

const feature = (over: Partial<DigestFeature> = {}): DigestFeature => ({
  name: 'dark-mode',
  workspaceName: 'app (dark-mode)',
  worktreePath: WT,
  completedAt: null,
  accountName: 'Work',
  status: 'idle',
  lastReply: null,
  stage: { missing: false, stage: 'Building', done: 1, total: 3 },
  servers: [],
  rateLimit: null,
  ...over
})

const server = (status: FeatureServerView['status'], name = 'web'): FeatureServerView => ({ name, port: 4100, status, terminalId: 't' })
const stageOf = (stage: 'Grilling' | 'Spec' | 'Tickets' | 'Building' | 'Testing' | 'Completed', done = 0, total = 0): FeatureStageView => ({ missing: false, stage, done, total })

const blockLines = (): string[] => [
  '## dark-mode',
  '- Workspace: app (dark-mode)',
  '- Stage: Building',
  '- Tickets: 1/3 done',
  '- State: idle',
  '- Last reply: none known',
  '- Account: Work',
  '- Rate limit: no',
  '- Last test result: none yet',
  '- Servers: not started',
  `- Worktree: ${WT}`,
  `- Read: ${join(WT, '.scratch', 'dark-mode')}`,
  ''
]

describe('feature digest', () => {
  it.each([
    ['running', 'running'],
    ['needs-approval', 'waiting on approval'],
    ['your-turn', 'idle'],
    ['idle', 'idle']
  ] as const)('reads session status %s as State: %s', (status, state) => {
    expect(digestBody([feature({ status })])).toContain(`- State: ${state}\n`)
  })

  it("puts the session's last reply on the line after its state", () => {
    expect(digestBody([feature({ lastReply: 'Built the toggle.' })])).toContain('- State: idle\n- Last reply: Built the toggle.\n')
  })

  it('puts the Open work section after the Workspaces and before the test flows', () => {
    const text = digestBody([feature()], { workspaces: [{ label: 'app', path: 'C:\\app' }], openWork: '# Open work, not tracked\n\nNothing open.\n', testFlowsFolder: 'C:\\tf' })
    expect(text).toContain('# Open work, not tracked\n\nNothing open.\n\n# Test flows')
    expect(text.indexOf('# Workspaces')).toBeLessThan(text.indexOf('# Open work'))
    expect(digestBody([feature()])).not.toContain('Open work')
  })

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
    expect(text).toContain('- State: waiting on approval')
    expect(text).toContain(`- Worktree: ${WT}`)
    expect(text).toContain(`- Read: ${join(WT, '.scratch', 'dark-mode')}`)
  })

  it('lists features of every account, each with its own account name', () => {
    const text = digestBody([feature({ name: 'a', accountName: 'Work' }), feature({ name: 'b', accountName: 'Personal' })])
    expect(text).toContain('- Account: Work')
    expect(text).toContain('- Account: Personal')
  })

  it('lists each workspace label with its folder in a Workspaces section after the feature blocks', () => {
    const text = digestBody([feature()], { workspaces: [{ label: 'app', path: 'C:\\app' }, { label: 'app · dark-mode', path: WT }] })
    const section = text.slice(text.indexOf('# Workspaces'))
    expect(section).toContain(['- app (C:\\app)', `- app · dark-mode (${WT})`, ''].join('\n'))
    expect(section).toMatch(/names the label exactly, without the folder/)
    expect(text.indexOf('## dark-mode')).toBeLessThan(text.indexOf('# Workspaces'))
  })

  it('names the test-flows folder last, and leaves it out when none is given', () => {
    const text = digestBody([feature()], { testFlowsFolder: 'C:\\projects\\test-flows' })
    expect(text.slice(text.indexOf('# Test flows'))).toContain('C:\\projects\\test-flows')
    expect(text.indexOf('# Workspaces')).toBeLessThan(text.indexOf('# Test flows'))
    expect(digestBody([feature()])).not.toContain('# Test flows')
  })

  it('keeps every per-feature block exactly as it was, whatever the workspace list says', () => {
    const features = [feature(), feature({ name: 'b', completedAt: 5 })]
    const before = digestBody(features)
    expect(digestBody(features, { workspaces: [{ label: 'one', path: 'C:\\one' }] }).startsWith(before.slice(0, before.indexOf('# Workspaces')))).toBe(true)
    expect(before.slice(0, before.indexOf('# Workspaces'))).toBe(
      ['# Features in progress', '', ...blockLines(), '# Completed', '', '- b (app (dark-mode), Work)', '', ''].join('\n')
    )
  })

  it('says so when there are no workspaces', () => {
    expect(digestBody([])).toContain('No workspaces.')
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

describe('the last reply line', () => {
  it('collapses every run of whitespace, newlines included, to one space', () => {
    expect(replyLine('  Done.\n\n  Tests\tpass,   all  3.\r\n')).toBe('Done. Tests pass, all 3.')
  })

  it('keeps a reply of exactly 300 characters whole and cuts a longer one after 300', () => {
    expect(replyLine('a'.repeat(REPLY_LINE_MAX))).toBe('a'.repeat(300))
    expect(replyLine(`${'b'.repeat(299)}\n\ncd${'e'.repeat(50)}`)).toBe(`${'b'.repeat(299)} …`)
    expect(replyLine('x'.repeat(400))).toBe(`${'x'.repeat(300)}…`)
  })
})

describe('the 3D models section', () => {
  const GLB = join('C:', 'src', 'game', 'out', 'crate.glb')
  const BARREL = join('C:', 'x', 'barrel.glb')
  const model3d: DigestModel3d = {
    jobs: [
      { summary: 'axe.png · prop', session: 'dark-mode', state: 'Waiting: Darkfall cluster running' },
      { summary: 'Editor turn', session: 'Command Center', state: 'Held' }
    ],
    models: [
      { name: 'crate', glb: GLB, session: 'Outside the app · game', workspace: 'game', tris: 12000, finishedAt: NOW },
      { name: 'barrel', glb: BARREL, session: 'dark-mode', workspace: null, tris: null, finishedAt: null }
    ]
  }

  it('lists the queued and running jobs, then the finished models with path, session, workspace, tris and finished time', () => {
    const text = digestBody([feature()], { model3d })
    expect(text.slice(text.indexOf('# 3D models'))).toContain(
      [
        '# 3D models',
        '',
        'The 3D service runs model3d jobs from every session, one at a time. Point the user at a finished model by its path and the 3D view (Ctrl+6).',
        '',
        '## Queued and running',
        '',
        '- axe.png · prop · dark-mode · Waiting: Darkfall cluster running',
        '- Editor turn · Command Center · Held',
        '',
        '## Last finished models',
        '',
        `- crate: ${GLB} · session Outside the app · game · workspace game · 12000 tris · finished 2026-11-26T12:00:00.000Z`,
        `- barrel: ${BARREL} · session dark-mode · no workspace · tris unknown · finished at an unknown time`,
        ''
      ].join('\n')
    )
  })

  it('says so when no job is open and no model is finished, and leaves the section out when none is given', () => {
    const text = digestBody([feature()], { model3d: { jobs: [], models: [] } })
    expect(text).toContain('## Queued and running\n\nNo 3D jobs queued or running.\n\n## Last finished models\n\nNo finished models.\n')
    expect(digestBody([feature()])).not.toContain('# 3D models')
  })

  it('comes after the workspaces and before the test flows', () => {
    const text = digestBody([feature()], { model3d, testFlowsFolder: 'C:\tf' })
    expect(text.indexOf('# Workspaces')).toBeLessThan(text.indexOf('# 3D models'))
    expect(text.indexOf('# 3D models')).toBeLessThan(text.indexOf('# Test flows'))
  })
})

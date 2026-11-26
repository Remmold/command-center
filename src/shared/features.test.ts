import { describe, expect, it } from 'vitest'
import { failureReport, featureFirstPrompt, featureOpenPlan, startOutcomeMessage } from './features'

const feature = { name: 'x', sessionId: 'pane', claudeSessionId: 'abc' as string | undefined }

describe('featureOpenPlan', () => {
  it('shows a chat that is still hosted', () => {
    expect(featureOpenPlan(feature, true, true, false)).toEqual({ kind: 'open' })
  })
  it('hosts a gone chat again, resumed, from the saved Claude id', () => {
    expect(featureOpenPlan(feature, false, true, false)).toEqual({ kind: 'rehost', claudeSessionId: 'abc' })
  })
  it('says plainly when no Claude id was ever saved', () => {
    const plan = featureOpenPlan({ ...feature, claudeSessionId: undefined }, false, true, false)
    expect(plan.kind).toBe('missing')
  })
  it('says plainly when the workspace or the worktree is gone', () => {
    expect(featureOpenPlan(feature, false, false, false).kind).toBe('missing')
    expect(featureOpenPlan(feature, false, true, true).kind).toBe('missing')
  })
})

describe('featureFirstPrompt', () => {
  const made = { name: 'login', worktreePath: 'C:/w/login' }
  const base = ['/flow Add login', '', 'Feature name: login', 'Feature worktree: C:/w/login', 'Work in this worktree; do not make another one.']
  it('is the plain prompt without a preview browser', () => {
    expect(featureFirstPrompt(made, ' Add login ')).toBe(base.join('\n'))
    expect(featureFirstPrompt(made, 'Add login', false)).toBe(base.join('\n'))
  })
  it('names the starting brief right after the worktree line, and only when there is one', () => {
    const path = 'C:/w/login/.scratch/login/brief.md'
    const line = `Starting brief: ${path} (agreed in the main chat; read it first, it holds what was already decided)`
    expect(featureFirstPrompt(made, 'Add login', false, path)).toBe([...base.slice(0, 4), line, base[4]].join('\n'))
    expect(featureFirstPrompt(made, 'Add login', false, undefined)).toBe(base.join('\n'))
  })
  it('adds the preview browser line right after the worktree line', () => {
    expect(featureFirstPrompt(made, 'Add login', true)).toBe([...base.slice(0, 4), 'Preview browser: yes', base[4]].join('\n'))
  })
})

describe('failureReport', () => {
  it('names the step and says nothing was left behind after a clean undo', () => {
    expect(failureReport('install', 'network down.', [])).toBe('Could not make the feature while running the install command: network down. Nothing was left behind.')
  })
  it('lists what the undo could not remove', () => {
    expect(failureReport('worktree', 'git failed', ['the worktree folder C:\w\a', 'the branch feat/a'])).toBe(
      'Could not make the feature while making the worktree and branch: git failed. Left behind, to remove by hand: the worktree folder C:\w\a; the branch feat/a.'
    )
  })
})

describe('startOutcomeMessage', () => {
  it('confirms a success and says where to continue', () => {
    const text = startOutcomeMessage('login', null)
    expect(text.startsWith('[Command Center]')).toBe(true)
    expect(text).toContain('login started')
    expect(text).toContain('Open session')
  })
  it('carries the failure report, says nothing was retried, and asks to wait', () => {
    const text = startOutcomeMessage('login', 'Could not make the feature while saving the starting brief: disk full. Nothing was left behind.')
    expect(text.startsWith('[Command Center]')).toBe(true)
    expect(text).toContain('did not start')
    expect(text).toContain('disk full. Nothing was left behind.')
    expect(text).toContain('wait')
  })
})

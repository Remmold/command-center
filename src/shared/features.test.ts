import { describe, expect, it } from 'vitest'
import { featureFirstPrompt, featureOpenPlan } from './features'

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

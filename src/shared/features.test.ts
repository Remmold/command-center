import { describe, expect, it } from 'vitest'
import { featureOpenPlan } from './features'

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

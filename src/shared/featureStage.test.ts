import { describe, expect, it } from 'vitest'
import { featureStage, type FeatureFacts } from './featureStage'

const facts = (over: Partial<FeatureFacts> = {}): FeatureFacts => ({ spec: false, tickets: [], testSteps: false, completed: false, ...over })
const ticket = (status: string | null, hasProgress = false) => ({ status, hasProgress })

describe('featureStage', () => {
  it('is Grilling with no spec', () => {
    expect(featureStage(facts())).toEqual({ stage: 'Grilling', done: 0, total: 0 })
  })
  it('is Spec with a spec and no tickets', () => {
    expect(featureStage(facts({ spec: true })).stage).toBe('Spec')
  })
  it('is Tickets while no ticket is started', () => {
    const r = featureStage(facts({ spec: true, tickets: [ticket('ready-for-agent'), ticket(null), ticket('blocked')] }))
    expect(r).toEqual({ stage: 'Tickets', done: 0, total: 3 })
  })
  it('is Building with an in-progress ticket, and counts only the done ones', () => {
    const r = featureStage(facts({ spec: true, tickets: [ticket('resolved'), ticket('in-progress'), ticket('ready-for-agent')] }))
    expect(r).toEqual({ stage: 'Building', done: 1, total: 3 })
  })
  it('is Building with a done ticket alone', () => {
    expect(featureStage(facts({ spec: true, tickets: [ticket('resolved'), ticket('ready-for-agent')] })).stage).toBe('Building')
  })
  it('reads a ticket with a progress note as started', () => {
    expect(featureStage(facts({ spec: true, tickets: [ticket('ready-for-agent', true)] })).stage).toBe('Building')
  })
  it('is Testing once test steps are written', () => {
    expect(featureStage(facts({ spec: true, tickets: [ticket('resolved')], testSteps: true }))).toEqual({ stage: 'Testing', done: 1, total: 1 })
  })
  it('is Completed whatever else is there', () => {
    expect(featureStage(facts({ testSteps: true, completed: true })).stage).toBe('Completed')
  })
})

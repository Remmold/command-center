import { describe, expect, it } from 'vitest'
import { RefreshPlan } from './refreshPlan'

const POLL = 5 * 60_000
const DEBOUNCE = 5_000

function plan(ids: string[] = ['default', 'work']): RefreshPlan {
  const p = new RefreshPlan({ pollMs: POLL, debounceMs: DEBOUNCE })
  p.setProfiles(ids, 0)
  return p
}

function run(p: RefreshPlan, id: string, at: number): void {
  p.started(id, at)
  p.finished(id)
}

describe('RefreshPlan', () => {
  it('fetches every profile at start', () => {
    expect(plan().due(0)).toEqual(['default', 'work'])
  })

  it('fetches a profile again 5 minutes after its last fetch began', () => {
    const p = plan(['default'])
    run(p, 'default', 0)
    expect(p.due(POLL - 1)).toEqual([])
    expect(p.due(POLL)).toEqual(['default'])
    expect(p.wakeAt()).toBe(POLL)
  })

  it('never starts a second fetch for a profile while one is in flight', () => {
    const p = plan(['default'])
    p.started('default', 0)
    p.noteResult('default', 1)
    expect(p.due(POLL * 2)).toEqual([])
    expect(p.wakeAt()).toBeNull()
  })

  it('fetches a profile shortly after a turn ends on it, once for a burst of results', () => {
    const p = plan()
    run(p, 'default', 0)
    run(p, 'work', 0)
    p.noteResult('default', 10_000)
    p.noteResult('default', 12_000)
    expect(p.due(12_000 + DEBOUNCE - 1)).toEqual([])
    expect(p.due(12_000 + DEBOUNCE)).toEqual(['default'])
    expect(p.wakeAt()).toBe(12_000 + DEBOUNCE)
  })

  it('keeps a result that arrives mid-fetch for after the fetch', () => {
    const p = plan(['default'])
    p.started('default', 0)
    p.noteResult('default', 1_000)
    p.finished('default')
    expect(p.due(1_000 + DEBOUNCE)).toEqual(['default'])
  })

  it('fetches at once on Refresh and for a newly added profile', () => {
    const p = plan(['default'])
    run(p, 'default', 0)
    p.requestNow('default', 7_000)
    p.setProfiles(['default', 'new'], 7_000)
    expect(p.due(7_000)).toEqual(['default', 'new'])
  })

  it('forgets a removed profile', () => {
    const p = plan()
    p.setProfiles(['work'], 0)
    expect(p.due(0)).toEqual(['work'])
  })
})

import { describe, expect, it } from 'vitest'
import { autoRestartAt, clickRestart, INITIAL_RESTART, reduceRestart, type RestartEvent, type RestartState } from './restartPlan'

const MIN = 60_000
const IDLE_MS = 5 * MIN

const run = (events: RestartEvent[]): RestartState => events.reduce(reduceRestart, INITIAL_RESTART)

describe('restart plan', () => {
  it('nothing restarts before an update is downloaded', () => {
    const state = run([{ kind: 'busy', busy: false, at: 0 }])
    expect(autoRestartAt(state, IDLE_MS)).toBeNull()
    expect(clickRestart(state, [])).toEqual({ kind: 'none' })
  })

  it('a click while nothing is busy restarts at once', () => {
    const state = run([{ kind: 'downloaded', version: '0.1.2', at: 0 }])
    expect(clickRestart(state, [])).toEqual({ kind: 'restart' })
  })

  it('a click while chats are busy asks first, naming them', () => {
    const state = run([{ kind: 'downloaded', version: '0.1.2', at: 0 }])
    expect(clickRestart(state, ['a', 'b'])).toEqual({ kind: 'confirm', busy: ['a', 'b'] })
  })

  it('restarts by itself 5 minutes after the download when nothing is busy', () => {
    const state = run([{ kind: 'downloaded', version: '0.1.2', at: 10 * MIN }])
    expect(autoRestartAt(state, IDLE_MS)).toBe(15 * MIN)
  })

  it('never restarts by itself while something is busy', () => {
    const state = run([
      { kind: 'busy', busy: true, at: 0 },
      { kind: 'downloaded', version: '0.1.2', at: MIN }
    ])
    expect(autoRestartAt(state, IDLE_MS)).toBeNull()
  })

  it('a busy moment resets the timer to 5 minutes after it ends', () => {
    const state = run([
      { kind: 'downloaded', version: '0.1.2', at: 0 },
      { kind: 'busy', busy: true, at: 4 * MIN },
      { kind: 'busy', busy: false, at: 6 * MIN }
    ])
    expect(autoRestartAt(state, IDLE_MS)).toBe(11 * MIN)
  })

  it('a repeated idle report keeps the timer running from the first', () => {
    const state = run([
      { kind: 'downloaded', version: '0.1.2', at: 0 },
      { kind: 'busy', busy: false, at: 2 * MIN }
    ])
    expect(autoRestartAt(state, IDLE_MS)).toBe(5 * MIN)
  })
})

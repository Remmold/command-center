import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { holdQuit, type QuittingApp } from './quitHold'

class FakeApp implements QuittingApp {
  private listeners: Array<(event: { preventDefault(): void }) => void> = []
  quits = 0
  exited = false

  on(_event: 'before-quit', listener: (event: { preventDefault(): void }) => void): void {
    this.listeners.push(listener)
  }

  quit(): void {
    this.quits++
    let prevented = false
    for (const l of this.listeners) l({ preventDefault: () => (prevented = true) })
    if (!prevented) this.exited = true
  }
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = () => {}
  const promise = new Promise<void>((r) => (resolve = r))
  return { promise, resolve }
}

describe('holding the quit for the session kills', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('exits only after the kills finished, running them once', async () => {
    const app = new FakeApp()
    const kills = deferred()
    const end = vi.fn(() => kills.promise)
    holdQuit(app, end, 5000)

    app.quit()
    expect(app.exited).toBe(false)
    app.quit()
    expect(app.exited).toBe(false)

    kills.resolve()
    await vi.advanceTimersByTimeAsync(0)
    expect(app.exited).toBe(true)
    expect(end).toHaveBeenCalledTimes(1)
  })

  it('exits after the limit when a kill never finishes', async () => {
    const app = new FakeApp()
    holdQuit(app, () => new Promise<void>(() => {}), 5000)

    app.quit()
    await vi.advanceTimersByTimeAsync(4999)
    expect(app.exited).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    expect(app.exited).toBe(true)
  })

  it('exits when the kills fail', async () => {
    const app = new FakeApp()
    holdQuit(app, () => Promise.reject(new Error('taskkill missing')), 5000)

    app.quit()
    await vi.advanceTimersByTimeAsync(0)
    expect(app.exited).toBe(true)
  })
})

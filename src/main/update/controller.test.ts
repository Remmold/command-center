import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createUpdateController, type UpdaterPort } from './controller'

const MIN = 60_000

class FakeUpdater implements UpdaterPort {
  checks = 0
  installs = 0
  fail: Error | null = null
  private downloaded: ((version: string) => void) | null = null
  async check(): Promise<void> {
    this.checks++
    if (this.fail) throw this.fail
  }
  onDownloaded(cb: (version: string) => void): void {
    this.downloaded = cb
  }
  deliver(version: string): void {
    this.downloaded?.(version)
  }
  quitAndInstall(): void {
    this.installs++
  }
}

const clock = {
  now: () => Date.now(),
  setTimeout: (fn: () => void, ms: number) => setTimeout(fn, ms),
  clearTimeout: (h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>),
  setInterval: (fn: () => void, ms: number) => setInterval(fn, ms)
}

function setup() {
  const updater = new FakeUpdater()
  const controller = createUpdateController({ updater, clock, version: '0.1.1', idleMs: 5 * MIN, checkEveryMs: 30 * MIN })
  return { updater, controller }
}

describe('update controller', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
  })
  afterEach(() => vi.useRealTimers())

  it('an update that arrives while a chat runs waits, then restarts 5 minutes after the chat goes idle', async () => {
    const { updater, controller } = setup()
    controller.feed({ kind: 'sent', paneId: 'a', uuid: 'u1' })
    updater.deliver('0.1.2')
    expect(controller.status().downloaded).toBe('0.1.2')
    await vi.advanceTimersByTimeAsync(20 * MIN)
    expect(updater.installs).toBe(0)

    controller.feed({ kind: 'claude-event', paneId: 'a', event: { type: 'result' } })
    await vi.advanceTimersByTimeAsync(5 * MIN - 1)
    expect(updater.installs).toBe(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(updater.installs).toBe(1)
  })

  it('a busy moment inside the 5 minutes resets the timer', async () => {
    const { updater, controller } = setup()
    updater.deliver('0.1.2')
    await vi.advanceTimersByTimeAsync(4 * MIN)
    controller.feed({ kind: 'sent', paneId: 'a', uuid: 'u1' })
    controller.feed({ kind: 'claude-event', paneId: 'a', event: { type: 'result' } })
    await vi.advanceTimersByTimeAsync(4 * MIN)
    expect(updater.installs).toBe(0)
    await vi.advanceTimersByTimeAsync(MIN)
    expect(updater.installs).toBe(1)
  })

  it('a click while idle restarts at once; while busy it asks and only a forced click restarts', () => {
    const { updater, controller } = setup()
    updater.deliver('0.1.2')
    controller.feed({ kind: 'approval-raised', paneId: 'a', requestId: 'r1' })
    expect(controller.restart(false)).toEqual({ kind: 'confirm', busy: ['a'] })
    expect(updater.installs).toBe(0)
    expect(controller.restart(true)).toEqual({ kind: 'restart' })
    expect(updater.installs).toBe(1)
  })

  it('a click with no update downloaded does nothing', () => {
    const { updater, controller } = setup()
    expect(controller.restart(true)).toEqual({ kind: 'none' })
    expect(updater.installs).toBe(0)
  })

  it('checks on start and every 30 minutes, recording the last check', async () => {
    const { updater, controller } = setup()
    controller.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(updater.checks).toBe(1)
    expect(controller.status().lastCheck).toBe(0)
    await vi.advanceTimersByTimeAsync(30 * MIN)
    expect(updater.checks).toBe(2)
    expect(controller.status().lastCheck).toBe(30 * MIN)
  })

  it('a failed check keeps its message until the next good one', async () => {
    const { updater, controller } = setup()
    updater.fail = new Error('offline')
    await controller.check()
    expect(controller.status()).toMatchObject({ version: '0.1.1', error: 'offline', checking: false })
    updater.fail = null
    await controller.check()
    expect(controller.status().error).toBeNull()
  })

  it('tells listeners when the status changes', () => {
    const { updater, controller } = setup()
    const seen: (string | null)[] = []
    controller.onChange((s) => seen.push(s.downloaded))
    updater.deliver('0.1.2')
    expect(seen).toEqual(['0.1.2'])
  })
})

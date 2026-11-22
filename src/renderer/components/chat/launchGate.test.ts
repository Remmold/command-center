import { describe, expect, it, vi } from 'vitest'
import type { ControlResult } from '../../../shared/types'
import { NOT_RUNNING, controlOnceStarted } from './launchGate'

const notRunning: ControlResult = { ok: false, error: NOT_RUNNING }
const done: ControlResult = { ok: true, response: {} }

describe('controlOnceStarted', () => {
  it('sends again once a start that was under way when it was refused has finished', async () => {
    let finish!: (ok: boolean) => void
    const starting = new Promise<boolean>((resolve) => (finish = resolve))
    const send = vi.fn<() => Promise<ControlResult>>().mockResolvedValueOnce(notRunning).mockResolvedValueOnce(done)
    const result = controlOnceStarted(send, starting)
    await Promise.resolve()
    expect(send).toHaveBeenCalledTimes(1)
    finish(true)
    expect(await result).toBe(done)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('passes on a refusal from the started process', async () => {
    const refused: ControlResult = { ok: false, error: 'bypass is off' }
    const send = vi.fn<() => Promise<ControlResult>>().mockResolvedValueOnce(notRunning).mockResolvedValueOnce(refused)
    expect(await controlOnceStarted(send, Promise.resolve(true))).toBe(refused)
  })

  it('is not running when no start is under way, or the start failed', async () => {
    const send = vi.fn<() => Promise<ControlResult>>().mockResolvedValue(notRunning)
    expect(await controlOnceStarted(send, null)).toBe(notRunning)
    expect(await controlOnceStarted(send, Promise.resolve(false))).toBe(notRunning)
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('sends once when the process is running', async () => {
    const send = vi.fn<() => Promise<ControlResult>>().mockResolvedValue(done)
    expect(await controlOnceStarted(send, Promise.resolve(true))).toBe(done)
    expect(send).toHaveBeenCalledTimes(1)
  })
})

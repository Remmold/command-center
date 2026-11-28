import { describe, expect, it } from 'vitest'
import type { SessionStatus } from '../../shared/types'
import { createMessageQueue } from './messageQueue'

function queue(initial: Record<string, SessionStatus>, failing: string[] = []) {
  const status = { ...initial }
  const sent: { feature: string; text: string }[] = []
  const told: unknown[] = []
  const q = createMessageQueue({
    status: (feature) => status[feature] ?? 'idle',
    send: async (feature, text) => {
      if (failing.includes(feature)) return 'its session did not start.'
      sent.push({ feature, text })
      return null
    },
    settled: (feature, outcome) => told.push({ feature, ...outcome })
  })
  return { q, status, sent, told }
}

const settle = (): Promise<void> => new Promise((r) => setTimeout(r, 0))

describe('the send-message queue', () => {
  it('sends to a session between turns at once, idle or your turn', async () => {
    const { q, sent, told } = queue({ a: 'idle', b: 'your-turn' })
    expect(await q.submit('a', 'k1', 'run the tests')).toEqual({ state: 'sent' })
    expect(await q.submit('b', 'k2', 'hi')).toEqual({ state: 'sent' })
    expect(sent).toEqual([
      { feature: 'a', text: 'run the tests' },
      { feature: 'b', text: 'hi' }
    ])
    expect(told).toEqual([
      { feature: 'a', queued: false },
      { feature: 'b', queued: false }
    ])
  })

  it('queues for a running session or one waiting on approval, and sends once its turn ended', async () => {
    const { q, status, sent, told } = queue({ a: 'running', b: 'needs-approval' })
    expect(await q.submit('a', 'k1', 'one')).toEqual({ state: 'queued' })
    expect(await q.submit('b', 'k2', 'two')).toEqual({ state: 'queued' })
    expect(q.stateOf('k1')).toEqual({ state: 'queued' })
    q.tick()
    await settle()
    expect(sent).toEqual([])
    status.a = 'your-turn'
    q.tick()
    await settle()
    expect(sent).toEqual([{ feature: 'a', text: 'one' }])
    expect(q.stateOf('k1')).toEqual({ state: 'sent' })
    expect(told).toEqual([{ feature: 'a', queued: true }])
    q.tick()
    await settle()
    expect(sent).toHaveLength(1)
    expect(q.stateOf('k2')).toEqual({ state: 'queued' })
  })

  it('lets a newer message to the same feature replace the waiting one, whose card says so', async () => {
    const { q, status, sent } = queue({ a: 'running' })
    let changes = 0
    q.subscribe(() => changes++)
    await q.submit('a', 'k1', 'old')
    await q.submit('a', 'k2', 'new')
    expect(q.stateOf('k1')).toEqual({ state: 'replaced' })
    expect(q.stateOf('k2')).toEqual({ state: 'queued' })
    status.a = 'idle'
    q.tick()
    await settle()
    expect(sent).toEqual([{ feature: 'a', text: 'new' }])
    expect(changes).toBe(4)
  })

  it('marks a send that did not reach the session, and tells the chat why', async () => {
    const { q, told } = queue({}, ['a'])
    expect(await q.submit('a', 'k1', 'x')).toEqual({ state: 'failed', error: 'its session did not start.' })
    expect(told).toEqual([{ feature: 'a', error: 'its session did not start.' }])
  })
})

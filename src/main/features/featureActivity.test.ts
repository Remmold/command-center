import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import { ACTIVITY_DELAY_MS, coalesce, createLastReplies, lastReplyOf, replyAfter } from './featureActivity'

const reply = (id: string, ...texts: string[]): ChatItem => ({ kind: 'assistant', id, content: texts.map((text) => ({ type: 'text', text })), raw: {} as never })
const toolOnly = (id: string): ChatItem => ({ kind: 'assistant', id, content: [{ type: 'tool_use', id: 't', name: 'Read', input: {} }], raw: {} as never })
const user = (id: string): ChatItem => ({ kind: 'user', id, text: 'hi' })

afterEach(() => {
  vi.useRealTimers()
})

describe('the last reply of a session', () => {
  it('is the newest reply of its own agent with text, as one line', () => {
    const sub = { ...reply('s', 'from a subagent'), parentToolUseId: 'call' } as ChatItem
    expect(lastReplyOf([reply('a1', 'Old.'), user('u'), reply('a2', 'Built it.\n\nTests pass.'), toolOnly('a3'), sub])).toBe('Built it. Tests pass.')
  })

  it('is null for a session with no reply yet', () => {
    expect(lastReplyOf([user('u'), toolOnly('a')])).toBeNull()
  })

  it('follows each saved change: a reply replaces it, a change without one keeps it, a clear drops it', () => {
    expect(replyAfter(null, [{ kind: 'append', items: [user('u'), reply('a', 'First.')] }])).toBe('First.')
    expect(replyAfter('First.', [{ kind: 'append', items: [toolOnly('b')] }])).toBe('First.')
    expect(replyAfter('First.', [{ kind: 'replace', item: reply('a', 'First.', 'And more.') as never }])).toBe('First. And more.')
    expect(replyAfter('First.', [{ kind: 'set', items: [user('u')] }])).toBeNull()
    expect(replyAfter('First.', [{ kind: 'clear' }, { kind: 'append', items: [reply('c', 'Fresh.')] }])).toBe('Fresh.')
    expect(replyAfter('First.', [{ kind: 'delete' }])).toBeNull()
  })

  it('announces a pane only when its reply changed', () => {
    const changed = vi.fn()
    const replies = createLastReplies(changed)
    replies.loaded({ p1: [reply('a', 'Hello.')], p2: [] })
    expect(changed.mock.calls).toEqual([['p1']])
    replies.applied('p1', [{ kind: 'append', items: [toolOnly('b')] }])
    replies.applied('p2', [{ kind: 'append', items: [user('u')] }])
    expect(changed).toHaveBeenCalledTimes(1)
    replies.applied('p1', [{ kind: 'append', items: [reply('c', 'Done.')] }])
    expect(changed).toHaveBeenLastCalledWith('p1')
    expect(replies.get('p1')).toBe('Done.')
    expect(replies.get('unknown')).toBeNull()
  })
})

describe('coalescing activity for the digest', () => {
  it('runs once, 2 s after the first of a burst of pokes', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const activity = coalesce(run)
    activity.poke()
    await vi.advanceTimersByTimeAsync(500)
    activity.poke()
    activity.poke()
    await vi.advanceTimersByTimeAsync(ACTIVITY_DELAY_MS - 501)
    expect(run).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('still runs every 2 s under a steady stream of pokes, never starved', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const activity = coalesce(run)
    for (let t = 0; t < 10_000; t += 100) {
      activity.poke()
      await vi.advanceTimersByTimeAsync(100)
    }
    expect(run).toHaveBeenCalledTimes(5)
  })

  it('runs nothing once stopped', async () => {
    vi.useFakeTimers()
    const run = vi.fn()
    const activity = coalesce(run)
    activity.poke()
    activity.stop()
    activity.poke()
    await vi.advanceTimersByTimeAsync(10_000)
    expect(run).not.toHaveBeenCalled()
  })
})

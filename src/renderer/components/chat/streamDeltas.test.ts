import { describe, expect, it } from 'vitest'
import { applyDeltas, frameBatch } from './streamDeltas'
import type { AssistantMessageItem } from './types'
import type { ContentBlock } from '../../../shared/types'

function fakeFrames(): { schedule: (cb: () => void) => void; runFrame: () => void; waiting: () => number } {
  let queued: (() => void)[] = []
  return {
    schedule: (cb) => void queued.push(cb),
    runFrame: () => {
      const due = queued
      queued = []
      for (const cb of due) cb()
    },
    waiting: () => queued.length
  }
}

describe('streamed deltas gathered per frame', () => {
  it('applies every delta that arrived before a frame together, once, in arrival order', () => {
    const frames = fakeFrames()
    const applied: string[][] = []
    const batch = frameBatch<string>((xs) => applied.push(xs), frames.schedule)
    batch.push('a')
    batch.push('b')
    batch.push('c')
    expect(applied).toEqual([])
    frames.runFrame()
    expect(applied).toEqual([['a', 'b', 'c']])
    batch.push('d')
    frames.runFrame()
    expect(applied).toEqual([['a', 'b', 'c'], ['d']])
  })

  it('asks for no frame while nothing is waiting', () => {
    const frames = fakeFrames()
    const batch = frameBatch<string>(() => {}, frames.schedule)
    expect(frames.waiting()).toBe(0)
    batch.push('a')
    batch.push('b')
    expect(frames.waiting()).toBe(1)
  })

  it('applies what is waiting at once on flush, so a later event lands after it, and the frame then applies nothing', () => {
    const frames = fakeFrames()
    const applied: string[][] = []
    const batch = frameBatch<string>((xs) => applied.push(xs), frames.schedule)
    batch.push('a')
    batch.flush()
    expect(applied).toEqual([['a']])
    batch.push('b')
    frames.runFrame()
    expect(applied).toEqual([['a'], ['b']])
    frames.runFrame()
    expect(applied).toEqual([['a'], ['b']])
  })

  it('drops what is waiting on cancel', () => {
    const frames = fakeFrames()
    const applied: string[][] = []
    const batch = frameBatch<string>((xs) => applied.push(xs), frames.schedule)
    batch.push('a')
    batch.cancel()
    frames.runFrame()
    batch.flush()
    expect(applied).toEqual([])
  })
})

const message = (content: ContentBlock[]): AssistantMessageItem => ({
  kind: 'assistant',
  id: 'msg_1',
  content,
  raw: { type: 'assistant', message: { id: 'msg_1', role: 'assistant', content: [] } }
})

describe('applying gathered deltas to the streaming message', () => {
  it('appends text and thinking deltas to their blocks in order', () => {
    const before = message([
      { type: 'thinking', thinking: 'Let me ', signature: '' },
      { type: 'text', text: 'Hel' }
    ])
    const after = applyDeltas(before, [
      { index: 0, delta: { type: 'thinking_delta', thinking: 'think' } },
      { index: 1, delta: { type: 'text_delta', text: 'lo, ' } },
      { index: 1, delta: { type: 'text_delta', text: 'world' } },
      { index: 0, delta: { type: 'thinking_delta', thinking: '.' } }
    ])
    expect(after.content).toEqual([
      { type: 'thinking', thinking: 'Let me think.', signature: '' },
      { type: 'text', text: 'Hello, world' }
    ])
    expect(before.content[1]).toEqual({ type: 'text', text: 'Hel' })
  })

  it('leaves the message as it was when no delta fits a block', () => {
    const tool: ContentBlock = { type: 'tool_use', id: 'toolu_1', name: 'Read', input: {} }
    const before = message([tool])
    const after = applyDeltas(before, [
      { index: 0, delta: { type: 'input_json_delta', partial_json: '{"a"' } },
      { index: 3, delta: { type: 'text_delta', text: 'lost' } }
    ])
    expect(after).toBe(before)
  })
})

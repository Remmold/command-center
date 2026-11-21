import { describe, expect, it } from 'vitest'
import { reduceSessionStatus, type SessionStatusEvent, type SessionStatusState } from './statusReducer'

function replay(events: SessionStatusEvent[]): SessionStatusState[] {
  const out: SessionStatusState[] = []
  let state: SessionStatusState | null = null
  for (const e of events) {
    state = reduceSessionStatus(state, e)
    out.push(state)
  }
  return out
}

function statuses(events: SessionStatusEvent[]): Array<[string, number]> {
  return replay(events).map((s) => [s.status, s.since])
}

const initEvent = { type: 'system', subtype: 'init', session_id: 's1', cwd: 'C:/ws', model: 'sonnet' }
const streamDelta = {
  type: 'stream_event',
  event: { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hi' } },
  session_id: 's1'
}
const assistantText = {
  type: 'assistant',
  message: { id: 'm1', role: 'assistant', content: [{ type: 'text', text: 'Hi' }] },
  session_id: 's1'
}
const assistantToolUse = {
  type: 'assistant',
  message: {
    id: 'm2',
    role: 'assistant',
    content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: { command: 'ls' } }]
  },
  session_id: 's1'
}
const toolResult = {
  type: 'user',
  message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 't1', content: 'a.txt' }] }
}
const resultEvent = {
  type: 'result',
  subtype: 'success',
  is_error: false,
  duration_ms: 900,
  num_turns: 1,
  result: 'Hi',
  session_id: 's1'
}

const claude = (event: unknown, at: number): SessionStatusEvent => ({ kind: 'claude-event', event, at })

describe('session status reducer', () => {
  it('a turn runs until its result event, then it is your turn', () => {
    expect(
      statuses([
        { kind: 'spawned', at: 100 },
        claude(initEvent, 110),
        { kind: 'user-message', at: 200 },
        claude(streamDelta, 210),
        claude(assistantText, 220),
        claude(resultEvent, 300),
        { kind: 'user-message', at: 400 },
        claude(resultEvent, 500)
      ])
    ).toEqual([
      ['running', 100],
      ['running', 100],
      ['running', 100],
      ['running', 100],
      ['running', 100],
      ['your-turn', 300],
      ['running', 400],
      ['your-turn', 500]
    ])
  })

  it('overlapping permission requests keep Needs approval, from the first raise, until the last is resolved', () => {
    expect(
      statuses([
        { kind: 'spawned', at: 100 },
        { kind: 'user-message', at: 200 },
        claude(assistantToolUse, 210),
        { kind: 'permission-raised', requestId: 'A', at: 220 },
        { kind: 'permission-raised', requestId: 'B', at: 230 },
        { kind: 'permission-resolved', requestId: 'A', at: 300 },
        { kind: 'permission-resolved', requestId: 'B', at: 400 },
        claude(toolResult, 410),
        claude(resultEvent, 500)
      ])
    ).toEqual([
      ['running', 100],
      ['running', 100],
      ['running', 100],
      ['needs-approval', 220],
      ['needs-approval', 220],
      ['needs-approval', 220],
      ['running', 400],
      ['running', 400],
      ['your-turn', 500]
    ])
  })

  it('an exit during Needs approval is Idle, and the late resolve of its request changes nothing', () => {
    expect(
      statuses([
        { kind: 'spawned', at: 100 },
        { kind: 'user-message', at: 200 },
        { kind: 'permission-raised', requestId: 'A', at: 300 },
        { kind: 'exit', at: 400 },
        { kind: 'permission-resolved', requestId: 'A', at: 410 },
        { kind: 'spawned', at: 500 }
      ])
    ).toEqual([
      ['running', 100],
      ['running', 100],
      ['needs-approval', 300],
      ['idle', 400],
      ['idle', 400],
      ['running', 500]
    ])
  })

  it('a spawned process is Running', () => {
    expect(statuses([{ kind: 'spawned', at: 100 }])).toEqual([['running', 100]])
  })
})

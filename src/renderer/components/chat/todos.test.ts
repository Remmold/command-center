import { describe, expect, it } from 'vitest'
import { latestTodoCallId, parseTodos } from './todos'
import { pairToolResults } from './toolCall'
import type { ChatItem } from './types'

const todoCall = (id: string, todos: unknown): ChatItem => ({
  kind: 'assistant',
  id: `msg_${id}`,
  content: [{ type: 'tool_use', id, name: 'TodoWrite', input: { todos } }],
  raw: { type: 'assistant', message: { id: `msg_${id}`, role: 'assistant', content: [] } }
})
const result = (toolUseId: string, isError = false): ChatItem => ({ kind: 'tool_result', id: `r_${toolUseId}`, toolUseId, content: 'ok', isError })

const first = [
  { content: 'Read the spec', status: 'in_progress', activeForm: 'Reading the spec' },
  { content: 'Write the code', status: 'pending', activeForm: 'Writing the code' }
]
const second = [
  { content: 'Read the spec', status: 'completed', activeForm: 'Reading the spec' },
  { content: 'Write the code', status: 'in_progress', activeForm: 'Writing the code' }
]

describe('todo list', () => {
  it('reads each item’s text and status from a TodoWrite input', () => {
    expect(parseTodos({ todos: first })).toEqual([
      { content: 'Read the spec', status: 'in_progress' },
      { content: 'Write the code', status: 'pending' }
    ])
  })

  it('treats an unknown status as pending and ignores malformed items', () => {
    expect(parseTodos({ todos: [{ content: 'x', status: 'weird' }, { status: 'completed' }, 'nope'] })).toEqual([{ content: 'x', status: 'pending' }])
  })

  it('has no list for an input without todos', () => {
    expect(parseTodos({})).toBeUndefined()
    expect(parseTodos(null)).toBeUndefined()
  })

  it('takes the newest TodoWrite call as the current list, replacing earlier ones', () => {
    const items = [todoCall('t1', first), result('t1'), todoCall('t2', second), result('t2')]
    expect(latestTodoCallId(items, pairToolResults(items))).toBe('t2')
  })

  it('counts a call still waiting on its result', () => {
    const items = [todoCall('t1', first), result('t1'), todoCall('t2', second)]
    expect(latestTodoCallId(items, pairToolResults(items))).toBe('t2')
  })

  it('skips a call that failed, keeping the list before it', () => {
    const items = [todoCall('t1', first), result('t1'), todoCall('t2', second), result('t2', true)]
    expect(latestTodoCallId(items, pairToolResults(items))).toBe('t1')
  })

  it('has no current list without a TodoWrite call', () => {
    expect(latestTodoCallId([], pairToolResults([]))).toBeUndefined()
  })
})

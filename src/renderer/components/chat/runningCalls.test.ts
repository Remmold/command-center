import { describe, expect, it } from 'vitest'
import type { ChatItem, ToolResultItem } from './types'
import { runningCalls, toolCallStatus } from './runningCalls'

const prompt = (id: string): ChatItem => ({ kind: 'user', id, text: 'go' })
const call = (id: string, toolId: string, parentToolUseId?: string): ChatItem => ({
  kind: 'assistant',
  id,
  content: [{ type: 'tool_use', id: toolId, name: 'Bash', input: { command: 'sleep 60' } }],
  raw: { type: 'assistant', message: { id, role: 'assistant', content: [] } } as never,
  ...(parentToolUseId ? { parentToolUseId } : {})
})
const result = (toolUseId: string, isError = false): ToolResultItem => ({ kind: 'tool_result', id: `r-${toolUseId}`, toolUseId, content: 'ok', isError })

describe('which tool calls are running', () => {
  it('is every call of the current turn still without a result while the turn runs', () => {
    const items = [prompt('u1'), call('a1', 't1'), result('t1'), call('a2', 't2')]
    expect([...runningCalls(items, true)]).toEqual(['t2'])
  })

  it('is none once the turn is over', () => {
    const items = [prompt('u1'), call('a1', 't1')]
    expect(runningCalls(items, false).size).toBe(0)
  })

  it('leaves out a call of an earlier turn that never got a result', () => {
    const items = [prompt('u1'), call('a1', 't1'), prompt('u2'), call('a2', 't2')]
    expect([...runningCalls(items, true)]).toEqual(['t2'])
  })

  it('counts a subagent’s own call and the Agent call it runs under', () => {
    const items = [prompt('u1'), call('a1', 'agent'), call('s1', 'inner', 'agent')]
    expect([...runningCalls(items, true)].sort()).toEqual(['agent', 'inner'])
  })

  it('counts a call still streaming in, read from the live view of the items', () => {
    const items = [prompt('u1'), call('a1', 't1')]
    expect(runningCalls(items, true).has('t1')).toBe(true)
  })
})

describe('a tool call’s dot', () => {
  it('blinks while the call runs and turns to the done or error colour when its result arrives', () => {
    expect(toolCallStatus(undefined, true)).toBe('running')
    expect(toolCallStatus(result('t1'), true)).toBe('ok')
    expect(toolCallStatus(result('t1', true), true)).toBe('error')
  })

  it('stays an open ring for a call with no result that is not running', () => {
    expect(toolCallStatus(undefined, false)).toBe('pending')
  })
})

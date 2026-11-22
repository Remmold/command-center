import { describe, expect, it } from 'vitest'
import { agentMeta, agentStatus, applyTaskEvent, endTasks, groupSubagents, type SubagentTasks } from './subagents'
import type { AssistantMessageItem, ChatItem, ToolResultItem } from './types'

function call(id: string, name: string, input: unknown, parent?: string): AssistantMessageItem {
  return {
    kind: 'assistant',
    id: `msg-${id}`,
    content: [{ type: 'tool_use', id, name, input }],
    raw: { type: 'assistant', message: { id: `msg-${id}`, role: 'assistant', content: [] }, parent_tool_use_id: parent ?? null },
    ...(parent ? { parentToolUseId: parent } : {})
  }
}

function text(id: string, body: string, parent?: string): AssistantMessageItem {
  return {
    kind: 'assistant',
    id,
    content: [{ type: 'text', text: body }],
    raw: { type: 'assistant', message: { id, role: 'assistant', content: [] }, parent_tool_use_id: parent ?? null },
    ...(parent ? { parentToolUseId: parent } : {})
  }
}

function result(toolUseId: string, parent?: string, isError = false): ToolResultItem {
  return { kind: 'tool_result', id: `r-${toolUseId}`, toolUseId, content: 'ok', isError, ...(parent ? { parentToolUseId: parent } : {}) }
}

describe('grouping subagent items under their call', () => {
  it('moves items with a parent call out of the main flow and under that call, in order', () => {
    const items: ChatItem[] = [
      { kind: 'user', id: 'u1', text: 'go' },
      call('agent1', 'Agent', { description: 'Look around', prompt: 'look' }),
      call('read1', 'Read', { file_path: 'a.ts' }, 'agent1'),
      result('read1', 'agent1'),
      text('sub-text', 'Found it', 'agent1'),
      result('agent1'),
      text('main-text', 'Done')
    ]
    const groups = groupSubagents(items)
    expect(groups.main.map((i) => i.id)).toEqual(['u1', 'msg-agent1', 'r-agent1', 'main-text'])
    expect(groups.byCall.get('agent1')?.map((i) => i.id)).toEqual(['msg-read1', 'r-read1', 'sub-text'])
  })

  it('nests an agent started by a subagent under that subagent’s call', () => {
    const items: ChatItem[] = [
      call('outer', 'Agent', { description: 'outer' }),
      call('inner', 'Agent', { description: 'inner' }, 'outer'),
      text('deep', 'deep work', 'inner')
    ]
    const groups = groupSubagents(items)
    expect(groups.main.map((i) => i.id)).toEqual(['msg-outer'])
    expect(groups.byCall.get('outer')?.map((i) => i.id)).toEqual(['msg-inner'])
    expect(groups.byCall.get('inner')?.map((i) => i.id)).toEqual(['deep'])
  })

  it('keeps a subagent item in the main flow when its call is not in the chat', () => {
    const items: ChatItem[] = [text('orphan', 'cut off', 'gone')]
    expect(groupSubagents(items).main.map((i) => i.id)).toEqual(['orphan'])
  })

  it('groups messages of an agent woken by SendMessage under that SendMessage call', () => {
    const items: ChatItem[] = [call('send1', 'SendMessage', { to: 'scout', message: 'more' }), text('reply', 'on it', 'send1')]
    expect(groupSubagents(items).byCall.get('send1')?.map((i) => i.id)).toEqual(['reply'])
  })
})

const started = {
  type: 'system',
  subtype: 'task_started',
  task_id: 'a1b2c3',
  tool_use_id: 'agent1',
  description: 'Look around',
  task_type: 'local_agent',
  subagent_type: 'general-purpose'
}

describe('subagent task events', () => {
  it('starts a working task for a local agent and finds it by its call', () => {
    const tasks = applyTaskEvent({}, started, 1000)
    expect(tasks.a1b2c3).toMatchObject({ taskId: 'a1b2c3', toolUseId: 'agent1', status: 'working', startTime: 1000, subagentType: 'general-purpose' })
  })

  it('ignores tasks that are not agents, such as a background shell', () => {
    expect(applyTaskEvent({}, { ...started, task_type: 'local_bash' }, 1000)).toEqual({})
  })

  it('records progress usage and the last tool', () => {
    let tasks = applyTaskEvent({}, started, 1000)
    tasks = applyTaskEvent(tasks, {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'a1b2c3',
      description: 'Look around',
      usage: { total_tokens: 4500, tool_uses: 2, duration_ms: 3000 },
      last_tool_name: 'Read'
    }, 4000)
    expect(tasks.a1b2c3).toMatchObject({ usage: { totalTokens: 4500, toolUses: 2, durationMs: 3000 }, lastToolName: 'Read' })
  })

  it('maps the notification status as the extension does: completed finished, stopped stopped, failed failed', () => {
    const end = (status: string) =>
      applyTaskEvent(applyTaskEvent({}, started, 1000), { type: 'system', subtype: 'task_notification', task_id: 'a1b2c3', status, summary: 's', output_file: '' }, 9000).a1b2c3
    expect(end('completed')).toMatchObject({ status: 'finished', endTime: 9000 })
    expect(end('stopped').status).toBe('stopped')
    expect(end('failed').status).toBe('failed')
  })

  it('reads a killed task_updated as stopped and keeps its error', () => {
    const tasks = applyTaskEvent(applyTaskEvent({}, started, 1000), {
      type: 'system',
      subtype: 'task_updated',
      task_id: 'a1b2c3',
      patch: { status: 'killed', error: 'boom', end_time: 5000 }
    }, 6000)
    expect(tasks.a1b2c3).toMatchObject({ status: 'stopped', error: 'boom', endTime: 5000 })
  })

  it('marks working agents stopped when the process ends', () => {
    const tasks = endTasks(applyTaskEvent({}, started, 1000), 7000)
    expect(tasks.a1b2c3).toMatchObject({ status: 'stopped', endTime: 7000 })
  })
})

describe('agent status', () => {
  const tasks: SubagentTasks = applyTaskEvent({}, started, 1000)

  it('follows the task while one is known, even after a background agent’s call has returned', () => {
    expect(agentStatus('agent1', tasks, result('agent1'), true).status).toBe('working')
  })

  it('without a task, reads the result: none is working while the process runs, else stopped', () => {
    expect(agentStatus('x', {}, undefined, true).status).toBe('working')
    expect(agentStatus('x', {}, undefined, false).status).toBe('stopped')
    expect(agentStatus('x', {}, result('x'), false).status).toBe('finished')
    expect(agentStatus('x', {}, result('x', undefined, true), false).status).toBe('failed')
  })
})

describe('agent meta line', () => {
  it('shows elapsed time while working and tokens once known, as the agent map row', () => {
    const working = applyTaskEvent(applyTaskEvent({}, started, 1000), {
      type: 'system',
      subtype: 'task_progress',
      task_id: 'a1b2c3',
      description: 'Look around',
      usage: { total_tokens: 4500, tool_uses: 2, duration_ms: 3000 }
    }, 2000).a1b2c3
    expect(agentMeta(working, 66_000)).toBe('1m 5s · 4.5k tokens')
  })

  it('leaves out a duration under a second once ended', () => {
    const done = { ...applyTaskEvent({}, started, 1000).a1b2c3, status: 'finished' as const, endTime: 1500 }
    expect(agentMeta(done, 99_000)).toBe('')
  })
})

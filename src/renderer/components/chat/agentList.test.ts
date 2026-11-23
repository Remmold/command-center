import { describe, expect, it } from 'vitest'
import { agentsStillWorking, collectAgents, flatAgents, nowLine, type AgentTails } from './agentList'
import type { SubagentTask, SubagentTasks } from './subagents'
import type { AssistantMessageItem, ChatItem, ToolResultItem } from './types'

const CWD = 'C:\\work\\shop'

function assistant(id: string, content: AssistantMessageItem['content'], at?: number, parent?: string): AssistantMessageItem {
  return {
    kind: 'assistant',
    id,
    content,
    raw: { type: 'assistant', message: { id, role: 'assistant', content: [] } },
    ...(at !== undefined ? { at } : {}),
    ...(parent ? { parentToolUseId: parent } : {})
  }
}
const call = (id: string, name: string, input: unknown, at?: number, parent?: string): AssistantMessageItem =>
  assistant(`m-${id}`, [{ type: 'tool_use', id, name, input }], at, parent)
const said = (id: string, text: string, at?: number, parent?: string): AssistantMessageItem => assistant(id, [{ type: 'text', text }], at, parent)
const thought = (id: string, at?: number): AssistantMessageItem => assistant(id, [{ type: 'thinking', thinking: '' }], at)
const result = (toolUseId: string, content: unknown, isError = false): ToolResultItem => ({ kind: 'tool_result', id: `r-${toolUseId}`, toolUseId, content, isError })

function task(taskId: string, toolUseId: string, fields: Partial<SubagentTask> = {}): SubagentTask {
  return { taskId, toolUseId, description: 'Agent', status: 'working', startTime: 1000, ...fields }
}

describe('the now line', () => {
  it('names the latest tool call the way its timeline row does, relative to the workspace', () => {
    const items: ChatItem[] = [said('a', 'Looking.'), call('t1', 'Read', { file_path: 'C:\\work\\shop\\api\\auth.ts' })]
    expect(nowLine(items, CWD)).toBe('Read api/auth.ts')
    expect(nowLine([...items, result('t1', 'export {}'), call('t2', 'Bash', { command: 'pnpm test\n--run' })], CWD)).toBe('Bash pnpm test')
  })

  it('reads "thinking…" while it thinks, else its last line of text, and nothing before it starts', () => {
    expect(nowLine([call('t1', 'Grep', { pattern: 'token' }), result('t1', 'x'), thought('th')], CWD)).toBe('thinking…')
    expect(nowLine([said('a', 'First I read it.\n\nThe routes look fine.\n')], CWD)).toBe('The routes look fine.')
    expect(nowLine([{ kind: 'user', id: 'u', text: 'Scan the routes.' }], CWD)).toBeUndefined()
  })
})

describe('collecting a chat’s agents', () => {
  it('names an agent by its description, else its type and the first line of its prompt, never blank', () => {
    const items: ChatItem[] = [
      call('c1', 'Agent', { description: 'Scan the routes', prompt: 'p' }),
      call('c2', 'Agent', { subagent_type: 'Explore', prompt: '\nFind the dead routes.\nThen list them.' }),
      call('c3', 'Task', {})
    ]
    expect(collectAgents({ items, tasks: {}, tails: {}, running: true, cwd: CWD, now: 5000 }).map((a) => a.name)).toEqual([
      'Scan the routes',
      'Explore: Find the dead routes.',
      'Agent'
    ])
  })

  it('takes status, times and tool count from the CLI’s task events, the now line from the agent’s own file', () => {
    const tasks: SubagentTasks = {
      a1: task('a1', 'c1', { description: 'Scan the routes', startTime: 1000, usage: { totalTokens: 10, toolUses: 1, durationMs: 0 } })
    }
    const tails: AgentTails = {
      a1: {
        meta: { agentId: 'a1', toolUseId: 'c1' },
        items: [call('t1', 'Read', { file_path: 'routes.ts' }, 1500), result('t1', 'x'), call('t2', 'Bash', { command: 'pnpm lint' }, 1800)]
      }
    }
    const [agent] = collectAgents({ items: [call('c1', 'Agent', { description: 'Scan the routes' })], tasks, tails, running: true, cwd: CWD, now: 4000 })
    expect(agent).toMatchObject({ agentId: 'a1', toolUseId: 'c1', name: 'Scan the routes', status: 'working', toolUses: 2, now: 'Bash pnpm lint', elapsedMs: 3000 })
  })

  it('reads an agent known only from its file and its call, as in a VS Code chat: working while the session runs or its file grew in the last minute, done once its result is in', () => {
    const tails: AgentTails = {
      a2: { meta: { agentId: 'a2', toolUseId: 'c2', description: 'Watch the logs' }, items: [said('x', 'Watching the logs.', 2000), said('y', 'Logs are quiet.', 9000)] }
    }
    const items: ChatItem[] = [call('c2', 'Agent', { description: 'Watch the logs', run_in_background: true }), result('c2', 'Async agent launched successfully.')]
    const live = collectAgents({ items, tasks: {}, tails, running: true, cwd: CWD, now: 10_000 })
    expect(live[0]).toMatchObject({ name: 'Watch the logs', status: 'working', elapsedMs: 8000, now: 'Logs are quiet.' })

    const done = collectAgents({ items: [call('c2', 'Agent', { description: 'Watch the logs' }), result('c2', [{ type: 'text', text: 'Nothing odd.\nDetails follow.' }])], tasks: {}, tails, running: true, cwd: CWD, now: 10_000 })
    expect(done[0]).toMatchObject({ status: 'finished', elapsedMs: 7000, summary: 'Nothing odd.' })

    const quiet = collectAgents({ items, tasks: {}, tails, running: false, cwd: CWD, now: 30_000 })
    expect(quiet[0]).toMatchObject({ status: 'working', elapsedMs: 28_000 })
    const settled = collectAgents({ items, tasks: {}, tails, running: false, cwd: CWD, now: 120_000 })
    expect(settled[0]).toMatchObject({ status: 'finished', elapsedMs: 7000 })

    const fileOnly = collectAgents({ items: [], tasks: {}, tails, running: false, cwd: CWD, now: 120_000 })
    expect(fileOnly[0]).toMatchObject({ agentId: 'a2', name: 'Watch the logs', status: 'finished' })
  })

  it('lists working agents first, then by start time, with an agent’s own agents nested under it', () => {
    const tasks: SubagentTasks = {
      early: task('early', 'c1', { description: 'early, done', status: 'finished', startTime: 1000, endTime: 2000 }),
      late: task('late', 'c2', { description: 'late, working', startTime: 3000 }),
      mid: task('mid', 'c3', { description: 'mid, working', startTime: 2000 }),
      inner: task('inner', 'c4', { description: 'inner', startTime: 2500 })
    }
    const tails: AgentTails = { mid: { meta: { agentId: 'mid', toolUseId: 'c3' }, items: [call('c4', 'Agent', { description: 'inner' })] } }
    const agents = collectAgents({ items: [], tasks, tails, running: true, cwd: CWD, now: 5000 })
    expect(agents.map((a) => a.name)).toEqual(['mid, working', 'late, working', 'early, done'])
    expect(agents[0].children.map((a) => a.name)).toEqual(['inner'])
    expect(flatAgents(agents).map((a) => [a.name, a.depth])).toEqual([
      ['mid, working', 0],
      ['inner', 1],
      ['late, working', 0],
      ['early, done', 0]
    ])
  })
})

describe('agents still working after the turn', () => {
  const tasks: SubagentTasks = {
    a: task('a', 'c1'),
    b: task('b', 'c2'),
    c: task('c', 'c3', { status: 'finished', endTime: 2000 })
  }

  it('counts working agents once the main turn has ended, none while it runs', () => {
    expect(agentsStillWorking(tasks, false)).toBe(2)
    expect(agentsStillWorking(tasks, true)).toBe(0)
    expect(agentsStillWorking({ c: tasks.c }, false)).toBe(0)
  })
})

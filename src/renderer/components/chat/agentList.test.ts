import { describe, expect, it } from 'vitest'
import { agentDetail, agentRowMeta, agentsStillWorking, agentTabCount, atTime, collectAgents, flatAgents, groupAgents, nowLine, startLabel, type AgentTails } from './agentList'
import { summarizeAgent } from '../../../shared/agentSummary'
import type { SubagentTask, SubagentTasks } from './subagents'
import type { AssistantMessageItem, ChatItem, ToolResultItem } from './types'

const CWD = 'C:\\work\\shop'
const TEN_MIN = 10 * 60_000
const DAY = 24 * 60 * 60_000

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
        summary: summarizeAgent([call('t1', 'Read', { file_path: 'routes.ts' }, 1500), result('t1', 'x'), call('t2', 'Bash', { command: 'pnpm lint' }, 1800)])
      }
    }
    const [agent] = collectAgents({ items: [call('c1', 'Agent', { description: 'Scan the routes' })], tasks, tails, running: true, cwd: CWD, now: 4000 })
    expect(agent).toMatchObject({ agentId: 'a1', toolUseId: 'c1', name: 'Scan the routes', status: 'working', toolUses: 2, now: 'Bash pnpm lint', elapsedMs: 3000 })
  })

  it('reads an agent known only from its file and its call, as in a VS Code chat: working while its file grew in the last 10 minutes, done once its result is in', () => {
    const tails: AgentTails = {
      a2: { meta: { agentId: 'a2', toolUseId: 'c2', description: 'Watch the logs' }, summary: summarizeAgent([said('x', 'Watching the logs.', 2000), said('y', 'Logs are quiet.', 9000)]) }
    }
    const items: ChatItem[] = [call('c2', 'Agent', { description: 'Watch the logs', run_in_background: true }), result('c2', 'Async agent launched successfully.')]
    const live = collectAgents({ items, tasks: {}, tails, running: true, cwd: CWD, now: 10_000 })
    expect(live[0]).toMatchObject({ name: 'Watch the logs', status: 'working', elapsedMs: 8000, now: 'Logs are quiet.' })

    const done = collectAgents({ items: [call('c2', 'Agent', { description: 'Watch the logs' }), result('c2', [{ type: 'text', text: 'Nothing odd.\nDetails follow.' }])], tasks: {}, tails, running: true, cwd: CWD, now: 10_000 })
    expect(done[0]).toMatchObject({ status: 'finished', elapsedMs: 7000, summary: 'Nothing odd. Details follow.' })

    const quiet = collectAgents({ items, tasks: {}, tails, running: false, cwd: CWD, now: 30_000 })
    expect(quiet[0]).toMatchObject({ status: 'working', elapsedMs: 28_000 })
    const settled = collectAgents({ items, tasks: {}, tails, running: false, cwd: CWD, now: 9000 + TEN_MIN + 1 })
    expect(settled[0]).toMatchObject({ status: 'finished', elapsedMs: 7000, summary: 'Logs are quiet.' })

    const fileOnly = collectAgents({ items: [], tasks: {}, tails, running: false, cwd: CWD, now: 9000 + TEN_MIN + 1 })
    expect(fileOnly[0]).toMatchObject({ agentId: 'a2', name: 'Watch the logs', status: 'finished' })
  })

  it('lists working agents first, then by start time, with an agent’s own agents nested under it', () => {
    const tasks: SubagentTasks = {
      early: task('early', 'c1', { description: 'early, done', status: 'finished', startTime: 1000, endTime: 2000 }),
      late: task('late', 'c2', { description: 'late, working', startTime: 3000 }),
      mid: task('mid', 'c3', { description: 'mid, working', startTime: 2000 }),
      inner: task('inner', 'c4', { description: 'inner', startTime: 2500 })
    }
    const tails: AgentTails = { mid: { meta: { agentId: 'mid', toolUseId: 'c3' }, summary: summarizeAgent([call('c4', 'Agent', { description: 'inner' })]) } }
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

const prompt = (id: string, text: string, at: number): ChatItem => ({ kind: 'user', id, text, at })
const NOTICE = 'This agent\'s report was delivered to you as a message from "a32cb96ebed07d962" (its SubagentHandback call). Read it there; it is not repeated here.'
const RECEIPT = 'Async agent launched successfully.\nagentId: a1'

/** An agent's file shaped like the CLI's: its prompt, a tool call, then its handback and the handback's result. */
function handedBackFile(start: number, report: string): ChatItem[] {
  return [
    prompt(`p${start}`, 'Implement the ticket.', start),
    call(`r${start}`, 'Read', { file_path: 'a.ts' }, start + 1000),
    result(`r${start}`, 'x'),
    call(`h${start}`, 'SubagentHandback', { message: report }, start + 60_000),
    { ...result(`h${start}`, '{"success":true}'), at: start + 61_000 }
  ]
}

describe('a resumed chat’s old agents', () => {
  const start = 1_000_000
  const items: ChatItem[] = [
    call('c1', 'Agent', { description: 'Implement ticket 13', run_in_background: true }, start - 500),
    result('c1', [{ type: 'text', text: RECEIPT }])
  ]
  const tails: AgentTails = {
    a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent(handedBackFile(start, 'Ticket 13 is done as 87130bd.\n\n- **Tests:** green.')) }
  }

  it('are finished once their file shows the handback, though the chat runs again and days have passed', () => {
    const [agent] = collectAgents({ items, tasks: {}, tails, running: true, cwd: CWD, now: start + 3 * DAY })
    expect(agent).toMatchObject({ status: 'finished', elapsedMs: 61_000, summary: 'Ticket 13 is done as 87130bd. Tests: green.' })
    expect(agentRowMeta(agent)).toBe('Finished · 1m 1s · 2 tools')
    expect(agentDetail(agent)).toBe('Ticket 13 is done as 87130bd. Tests: green.')
  })

  it('are finished by their file even while the CLI still reports the task working', () => {
    const tasks: SubagentTasks = { a1: task('a1', 'c1', { startTime: start }) }
    expect(collectAgents({ items, tasks, tails, running: true, cwd: CWD, now: start + 70_000 })[0]).toMatchObject({ status: 'finished', elapsedMs: 61_000 })
  })

  it('keep the CLI’s own end state over a last line of plain text, as when one was stopped mid-reply', () => {
    const tasks: SubagentTasks = { a1: task('a1', 'c1', { startTime: start, status: 'stopped', endTime: start + 5000 }) }
    const talking: AgentTails = { a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent([prompt('p', 'go', start), said('s', 'Still looking.', start + 1000)]) } }
    expect(collectAgents({ items, tasks, tails: talking, running: true, cwd: CWD, now: start + 9000 })[0].status).toBe('stopped')
  })

  it('show their report, not the CLI’s "delivered to you as a message" notice', () => {
    const fg: ChatItem[] = [call('c2', 'Agent', { description: 'Spec review' }, start), result('c2', [{ type: 'text', text: NOTICE }])]
    const reviewTails: AgentTails = { a2: { meta: { agentId: 'a2', toolUseId: 'c2' }, summary: summarizeAgent(handedBackFile(start, 'Spec: all boxes ticked.\nOne nit.')) } }
    expect(collectAgents({ items: fg, tasks: {}, tails: reviewTails, running: false, cwd: CWD, now: start + DAY })[0].summary).toBe('Spec: all boxes ticked. One nit.')
    expect(collectAgents({ items: fg, tasks: {}, tails: {}, running: false, cwd: CWD, now: start + DAY })[0].summary).toBeUndefined()
  })

  it('end without a report once nothing has written for 10 minutes, and their time stops at their last line', () => {
    const stuck: AgentTails = { a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent(handedBackFile(start, 'r').slice(0, 2)) } }
    const before = collectAgents({ items, tasks: {}, tails: stuck, running: true, cwd: CWD, now: start + 1000 + TEN_MIN })[0]
    expect(before.status).toBe('working')
    const after = collectAgents({ items, tasks: {}, tails: stuck, running: true, cwd: CWD, now: start + 1000 + TEN_MIN + 1 })[0]
    expect(after).toMatchObject({ status: 'ended', elapsedMs: 1000 })
    expect(agentRowMeta(after)).toBe('Ended (no final report) · 1s · 1 tool')
    expect(atTime({ ...after, depth: 0 }, start + DAY).elapsedMs).toBe(1000)
  })

  it('a working agent turns ended on the clock once it has been quiet for 10 minutes', () => {
    const live: AgentTails = { a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent(handedBackFile(start, 'r').slice(0, 2)) } }
    const agent = { ...collectAgents({ items, tasks: {}, tails: live, running: true, cwd: CWD, now: start + 2000 })[0], depth: 0 }
    expect(atTime(agent, start + 5000)).toMatchObject({ status: 'working', elapsedMs: 5000 })
    expect(atTime(agent, start + 1000 + TEN_MIN + 1)).toMatchObject({ status: 'ended', elapsedMs: 1000 })
  })

  it('one its live process still reports stays working however quiet, its row noting the silence; without a process it ends after 10 quiet minutes', () => {
    const stuck: AgentTails = { a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent(handedBackFile(start, 'r').slice(0, 2)) } }
    const tasks: SubagentTasks = { a1: task('a1', 'c1', { startTime: start, lastEventAt: start + 1000 }) }
    const live = collectAgents({ items, tasks, tails: stuck, running: true, cwd: CWD, now: start + 1000 + 30 * 60_000 })[0]
    expect(live.status).toBe('working')
    expect(agentRowMeta(atTime({ ...live, depth: 0 }, start + 1000 + 30 * 60_000))).toBe('Working · 30m 1s · quiet 30m · 1 tool')
    const waitingOnChild: AgentTails = {
      ...stuck,
      k: { meta: { agentId: 'k', toolUseId: 'c9' }, summary: summarizeAgent([call('g', 'Grep', { pattern: 'x' }, start + 29 * 60_000)]) }
    }
    const withChild = { ...stuck.a1, summary: summarizeAgent([...handedBackFile(start, 'r').slice(0, 2), call('c9', 'Agent', { description: 'Review' }, start + 1000)]) }
    const parent = collectAgents({ items, tasks, tails: { ...waitingOnChild, a1: withChild }, running: true, cwd: CWD, now: start + 30 * 60_000 })[0]
    expect(agentRowMeta(atTime({ ...parent, depth: 0 }, start + 30 * 60_000))).not.toContain('quiet')
    const gone = collectAgents({ items, tasks: {}, tails: stuck, running: false, cwd: CWD, now: start + 1000 + 11 * 60_000 })[0]
    expect(gone.status).toBe('ended')
  })

  it('an agent waiting on its own agent stays working while that one writes', () => {
    const parentTails: AgentTails = {
      a1: { meta: { agentId: 'a1', toolUseId: 'c1' }, summary: summarizeAgent([prompt('p', 'go', start), call('c9', 'Agent', { description: 'Review' }, start + 1000)]) },
      a9: { meta: { agentId: 'a9', toolUseId: 'c9' }, summary: summarizeAgent([prompt('q', 'review', start + 2000), call('g', 'Grep', { pattern: 'x' }, start + TEN_MIN + 5000)]) }
    }
    const [agent] = collectAgents({ items, tasks: {}, tails: parentTails, running: true, cwd: CWD, now: start + TEN_MIN + 6000 })
    expect(agent.status).toBe('working')
    expect(agent.children[0].status).toBe('working')
  })
})

describe('grouping agents by the turn that started them', () => {
  const t1 = new Date(2026, 10, 24, 14, 5).getTime()
  const t2 = new Date(2026, 10, 24, 16, 30).getTime()
  const items: ChatItem[] = [
    prompt('u1', 'Run tickets 1 and 2.', t1 - 1000),
    call('c1', 'Agent', { description: 'Ticket 1' }, t1),
    call('c2', 'Agent', { description: 'Ticket 2' }, t1 + 1000),
    result('c1', 'Ticket 1 done.'),
    result('c2', 'Ticket 2 done.'),
    prompt('u2', 'Now ticket 3.', t2 - 1000),
    call('c3', 'Agent', { description: 'Ticket 3', run_in_background: true }, t2)
  ]
  const tails: AgentTails = {
    a1: { meta: { agentId: 'a1', toolUseId: 'c1', promptId: 'P1', startedAt: t1 }, summary: summarizeAgent([said('x1', 'Ticket 1 done.', t1 + 5000)]) },
    a2: { meta: { agentId: 'a2', toolUseId: 'c2', promptId: 'P1', startedAt: t1 + 1000 }, summary: summarizeAgent([said('x2', 'Ticket 2 done.', t1 + 6000)]) },
    a3: { meta: { agentId: 'a3', toolUseId: 'c3', promptId: 'P2', startedAt: t2 }, summary: summarizeAgent([call('g', 'Grep', { pattern: 'x' }, t2 + 1000)]) },
    old: { meta: { agentId: 'old', toolUseId: 'gone', promptId: 'P1', description: 'Ticket 0', startedAt: t1 - 500 }, summary: summarizeAgent([said('x0', 'Done.', t1 + 100)]) }
  }

  it('puts the newest turn first, each turn’s agents together, its call’s turn and its file’s prompt id agreeing', () => {
    const agents = collectAgents({ items, tasks: {}, tails, running: true, cwd: CWD, now: t2 + 2000 })
    const groups = groupAgents(agents, items)
    expect(groups.map((g) => [g.startTime, g.agents.map((a) => a.name), g.count, g.working])).toEqual([
      [t2, ['Ticket 3'], 1, 1],
      [t1 - 500, ['Ticket 0', 'Ticket 1', 'Ticket 2'], 3, 0]
    ])
  })

  it('heads a turn by its start time, with the day when it was not today', () => {
    expect(startLabel(t1, t2)).toBe('2:05 PM')
    expect(startLabel(t1, t1 + 3 * DAY)).toBe('Nov 24, 2:05 PM')
  })

  it('counts working agents for the tab, and nothing when none work', () => {
    const agents = collectAgents({ items, tasks: {}, tails, running: true, cwd: CWD, now: t2 + 2000 })
    expect(agentTabCount(agents)).toBe('1 working')
    expect(agentTabCount(collectAgents({ items, tasks: {}, tails, running: false, cwd: CWD, now: t2 + DAY }))).toBeUndefined()
  })
})

describe('agents still working after the turn', () => {
  const tasks: SubagentTasks = {
    a: task('a', 'c1'),
    b: task('b', 'c2'),
    c: task('c', 'c3', { status: 'finished', endTime: 2000 })
  }

  it('counts working agents once the main turn has ended, none while it runs', () => {
    expect(agentsStillWorking(tasks, {}, false, 1500)).toBe(2)
    expect(agentsStillWorking(tasks, {}, true, 1500)).toBe(0)
    expect(agentsStillWorking({ c: tasks.c }, {}, false, 1500)).toBe(0)
  })

  it('counts one waiting on its own agent while that one still writes', () => {
    const waiting: SubagentTasks = { p: task('p', 'c1', { startTime: 1000 }) }
    const tails: AgentTails = {
      p: { meta: { agentId: 'p', toolUseId: 'c1' }, summary: summarizeAgent([call('c9', 'Agent', { description: 'Review' }, 1000)]) },
      k: { meta: { agentId: 'k', toolUseId: 'c9' }, summary: summarizeAgent([call('g', 'Grep', { pattern: 'x' }, 1000 + TEN_MIN)]) }
    }
    expect(agentsStillWorking(waiting, tails, false, 2000 + TEN_MIN)).toBe(1)
  })

  it('by the same rules as the Agents tab: not one whose file handed back, but one silent for 30 minutes while its process lives', () => {
    const tails: AgentTails = { a: { meta: { agentId: 'a', toolUseId: 'c1' }, summary: summarizeAgent(handedBackFile(1000, 'Done.')) } }
    expect(agentsStillWorking(tasks, tails, false, 70_000)).toBe(1)
    expect(agentsStillWorking(tasks, tails, false, 1000 + 30 * 60_000)).toBe(1)
  })
})

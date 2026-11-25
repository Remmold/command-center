import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { NO_BACKGROUND_PROCESSES, backgroundProcessList, reduceBackgroundProcesses, type BackgroundProcessesState } from './backgroundProcesses'

function fold(lines: unknown[], start = 1000): BackgroundProcessesState {
  return lines.reduce<BackgroundProcessesState>((state, line, i) => reduceBackgroundProcesses(state, line, start + i), NO_BACKGROUND_PROCESSES)
}

const bash = (id: string, command: string) => ({
  type: 'assistant',
  message: { id: `m-${id}`, role: 'assistant', content: [{ type: 'tool_use', id, name: 'Bash', input: { command } }] }
})
const started = (taskId: string, fields: Record<string, unknown> = {}) => ({
  type: 'system',
  subtype: 'task_started',
  task_id: taskId,
  tool_use_id: `tu-${taskId}`,
  description: `about ${taskId}`,
  task_type: 'local_bash',
  is_backgrounded: true,
  ...fields
})
const updated = (taskId: string, patch: Record<string, unknown>) => ({ type: 'system', subtype: 'task_updated', task_id: taskId, patch })
const notified = (taskId: string, status: string) => ({ type: 'system', subtype: 'task_notification', task_id: taskId, status })

describe('background processes from the CLI lines', () => {
  it('the recorded turn: Running with the Bash command, then Stopped at the kill’s end time', () => {
    const recording = readFileSync(join(__dirname, '../main/claude/fixtures/turn-background-bash.jsonl'), 'utf-8')
      .split('\n')
      .filter((l) => l.trim())
      .map((l) => JSON.parse(l) as { direction: string; line: unknown })
      .filter((l) => l.direction === 'cli')
      .map((l) => l.line)
    const command = `node -e "require('http').createServer((q,s)=>s.end('ok')).listen(47831,()=>console.log('Listening on http://localhost:47831'))"`
    const killAt = recording.findIndex((l) => (l as { subtype?: string }).subtype === 'task_updated')

    const running = backgroundProcessList(fold(recording.slice(0, killAt)))
    expect(running).toEqual([{ taskId: 'b8a5asuqs', command, status: 'running', startedAt: expect.any(Number) }])

    const after = backgroundProcessList(fold(recording))
    expect(after).toEqual([{ taskId: 'b8a5asuqs', command, status: 'stopped', startedAt: running[0].startedAt, endedAt: 1795594010362 }])
  })

  it('a shell backgrounded at start is listed Running from when it started, with its Bash command', () => {
    expect(backgroundProcessList(fold([bash('tu-s1', 'pnpm dev'), started('s1')], 500))).toEqual([
      { taskId: 's1', command: 'pnpm dev', status: 'running', startedAt: 501 }
    ])
  })

  it('a foreground shell is listed once a patch backgrounds it, from when it started', () => {
    const before = fold([started('s1', { is_backgrounded: false })], 500)
    expect(backgroundProcessList(before)).toEqual([])
    expect(backgroundProcessList(reduceBackgroundProcesses(before, updated('s1', { is_backgrounded: true }), 900))).toEqual([
      { taskId: 's1', command: 'about s1', status: 'running', startedAt: 500 }
    ])
  })

  it('a foreground shell that ends without being backgrounded is never listed', () => {
    const state = fold([started('s1', { is_backgrounded: false }), updated('s1', { status: 'completed' }), updated('s1', { is_backgrounded: true })])
    expect(backgroundProcessList(state)).toEqual([])
  })

  it('agents are never listed, backgrounded or not', () => {
    const state = fold([started('a1', { task_type: 'local_agent' }), started('a2', { task_type: 'local_agent', is_backgrounded: false }), updated('a2', { is_backgrounded: true })])
    expect(backgroundProcessList(state)).toEqual([])
  })

  it.each([
    ['task_updated completed', updated('s1', { status: 'completed' }), 'finished'],
    ['task_updated failed', updated('s1', { status: 'failed' }), 'failed'],
    ['task_updated killed', updated('s1', { status: 'killed' }), 'stopped'],
    ['task_notification completed', notified('s1', 'completed'), 'finished'],
    ['task_notification failed', notified('s1', 'failed'), 'failed'],
    ['task_notification stopped', notified('s1', 'stopped'), 'stopped']
  ])('%s ends it %s, at the arrival time without an end_time', (_name, end, status) => {
    expect(backgroundProcessList(fold([started('s1'), end], 100))).toEqual([{ taskId: 's1', command: 'about s1', status, startedAt: 100, endedAt: 101 }])
  })

  it('the first end wins; later ends change neither status nor time', () => {
    const state = fold([started('s1'), updated('s1', { status: 'failed', end_time: 42 }), notified('s1', 'stopped'), updated('s1', { status: 'completed' })])
    expect(backgroundProcessList(state)).toEqual([{ taskId: 's1', command: 'about s1', status: 'failed', startedAt: 1000, endedAt: 42 }])
  })

  it('running processes come first, each group in start order', () => {
    const state = fold([started('s1'), started('s2'), started('s3'), notified('s1', 'completed'), started('s4'), notified('s3', 'failed')])
    expect(backgroundProcessList(state).map((p) => [p.taskId, p.status])).toEqual([
      ['s2', 'running'],
      ['s4', 'running'],
      ['s1', 'finished'],
      ['s3', 'failed']
    ])
  })

  it('a Bash command that arrives after its task still names it; lines about other things change nothing', () => {
    const state = fold([started('s1'), bash('tu-s1', 'pnpm watch')])
    expect(backgroundProcessList(state)[0].command).toBe('pnpm watch')
    const unrelated = [{ type: 'result', subtype: 'success' }, { type: 'system', subtype: 'background_tasks_changed', tasks: [] }, null, 'text']
    for (const line of unrelated) expect(reduceBackgroundProcesses(state, line, 5)).toBe(state)
  })
})

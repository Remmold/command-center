import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentSweep } from './agentSweep'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

let n = 0
const line = (type: 'user' | 'assistant', content: unknown): string =>
  JSON.stringify({ isSidechain: true, type, uuid: `u${++n}`, timestamp: new Date(1_700_000_000_000 + n * 1000).toISOString(), message: { role: type, content } }) + '\n'
const called = (id: string, name: string, input: unknown): string => line('assistant', [{ type: 'tool_use', id, name, input }])

function setup(): { sweep: AgentSweep; dir: string; ended: string[] } {
  const root = mkdtempSync(join(tmpdir(), 'cc-sweep-'))
  roots.push(root)
  const dir = join(root, 's1', 'subagents')
  mkdirSync(dir, { recursive: true })
  const sweep = new AgentSweep(async () => root)
  const ended: string[] = []
  sweep.onEnded((paneId, taskId) => ended.push(`${paneId}:${taskId}`))
  sweep.spawned('p', 'C:\\work')
  sweep.event('p', { type: 'system', subtype: 'init', session_id: 's1' })
  return { sweep, dir, ended }
}

const started = (taskId: string) => ({ type: 'system', subtype: 'task_started', task_id: taskId, task_type: 'local_agent' })

describe('the sweep over agents the CLI still reports working', () => {
  it('ends one whose file shows its handback, once', async () => {
    const { sweep, dir, ended } = setup()
    sweep.event('p', started('a1'))
    sweep.event('p', started('a2'))
    writeFileSync(join(dir, 'agent-a1.jsonl'), line('user', 'Go.') + called('h', 'SubagentHandback', { message: 'Done.' }))
    writeFileSync(join(dir, 'agent-a2.jsonl'), line('user', 'Go.') + called('r', 'Read', { file_path: 'a.ts' }))
    await sweep.sweep()
    expect(ended).toEqual(['p:a1'])
    await sweep.sweep()
    expect(ended).toEqual(['p:a1'])
  })

  it('keeps one silent for 30 minutes busy while its process lives: a long build writes nothing until it returns', async () => {
    const { sweep, dir, ended } = setup()
    writeFileSync(join(dir, 'agent-a1.jsonl'), line('user', 'Go.') + called('b', 'Bash', { command: 'pnpm e2e' }))
    const longAgo = new Date(Date.now() - 30 * 60_000)
    utimesSync(join(dir, 'agent-a1.jsonl'), longAgo, longAgo)
    sweep.event('p', started('a1'))
    await sweep.sweep()
    expect(ended).toEqual([])
  })

  it('forgets a chat’s agents when its process ends or the CLI reports them ended', async () => {
    const { sweep, dir, ended } = setup()
    writeFileSync(join(dir, 'agent-a1.jsonl'), called('h', 'SubagentHandback', { message: 'Done.' }))
    sweep.event('p', started('a1'))
    sweep.event('p', { type: 'system', subtype: 'task_notification', task_id: 'a1', status: 'completed' })
    await sweep.sweep()
    sweep.event('p', started('a1'))
    sweep.exited('p')
    await sweep.sweep()
    expect(ended).toEqual([])
  })
})

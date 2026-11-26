import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import type { SubagentSummaryEvent, SubagentTailEvent } from '../../shared/subagentTail'
import { AgentFileCache } from './agentFiles'
import { SubagentWatchService, SubagentWatcher } from './subagentWatch'

const roots: string[] = []
const watchers: SubagentWatcher[] = []

afterEach(() => {
  for (const w of watchers.splice(0)) w.stop()
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function tempDir(): string {
  const root = mkdtempSync(join(tmpdir(), 'cc-subagents-'))
  roots.push(root)
  return join(root, 'subagents')
}

let n = 0
const line = (type: 'user' | 'assistant', content: unknown): string =>
  JSON.stringify({ isSidechain: true, agentId: 'x', type, uuid: `u${++n}`, timestamp: new Date(Date.now() + n * 1000).toISOString(), message: { role: type, content } }) + '\n'
const said = (text: string): string => line('assistant', [{ type: 'text', text }])
const called = (id: string, name: string, input: unknown): string => line('assistant', [{ type: 'tool_use', id, name, input }])
const handback = (id: string): string => called(id, 'SubagentHandback', { message: 'All routes are used.' })

const texts = (items: ChatItem[]): string[] =>
  items.flatMap((i) => (i.kind === 'assistant' ? i.content.flatMap((b) => (b.type === 'text' ? [(b as { text: string }).text] : [])) : i.kind === 'user' ? [i.text] : []))

function watch(dir: string): { events: SubagentTailEvent[]; watcher: SubagentWatcher } {
  const events: SubagentTailEvent[] = []
  const watcher = new SubagentWatcher(dir, 'k', (e) => events.push(e), 50, new AgentFileCache())
  watchers.push(watcher)
  watcher.start()
  return { events, watcher }
}

const summaries = (events: SubagentTailEvent[], agentId: string): SubagentSummaryEvent[] =>
  events.flatMap((e) => (e.kind === 'summary' && e.agentId === agentId ? [e] : []))
const itemsOf = (events: SubagentTailEvent[], agentId: string): ChatItem[] => events.flatMap((e) => (e.kind === 'items' && e.agentId === agentId ? e.items : []))
const pause = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

describe('SubagentWatcher', () => {
  it('sends each agent’s meta and file summary, never its items, and a new summary as a working agent writes', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Scan the routes', toolUseId: 'toolu_1' }))
    const first = line('user', 'Scan the routes for dead ones.').replace('{', '{"promptId":"P1",')
    writeFileSync(join(dir, 'agent-a1.jsonl'), first + called('t1', 'Read', { file_path: 'routes.ts' }))
    const { events } = watch(dir)

    await expect.poll(() => events.length).toBeGreaterThan(0)
    const startedAt = Date.parse((JSON.parse(first) as { timestamp: string }).timestamp)
    expect(events[0]).toMatchObject({
      kind: 'summary',
      key: 'k',
      agentId: 'a1',
      meta: { agentId: 'a1', agentType: 'Explore', description: 'Scan the routes', toolUseId: 'toolu_1', promptId: 'P1', startedAt },
      summary: { replies: 1, toolUses: 1, firstAt: startedAt }
    })
    expect('items' in events[0]).toBe(false)

    appendFileSync(join(dir, 'agent-a1.jsonl'), said('Routes look fine.'))
    await expect.poll(() => summaries(events, 'a1').at(-1)?.summary.replies).toBe(2)
    expect(texts(summaries(events, 'a1').at(-1)!.summary.last)).toEqual(['Routes look fine.'])
  })

  it('reads a finished agent once and does not follow it; a working one is followed until it hands back', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-done.jsonl'), line('user', 'Review it.') + handback('h1'))
    writeFileSync(join(dir, 'agent-marked.meta.json'), JSON.stringify({ finished: true }))
    writeFileSync(join(dir, 'agent-marked.jsonl'), line('user', 'Review it.') + called('t1', 'Read', { file_path: 'a.ts' }))
    writeFileSync(join(dir, 'agent-busy.jsonl'), line('user', 'Build it.') + called('t2', 'Bash', { command: 'pnpm build' }))
    const { events, watcher } = watch(dir)

    await expect.poll(() => events.length).toBe(3)
    expect(watcher.followed()).toEqual(['busy'])
    await pause(200)
    expect(events).toHaveLength(3)

    appendFileSync(join(dir, 'agent-busy.jsonl'), handback('h2'))
    await expect.poll(() => watcher.followed()).toEqual([])
    expect(summaries(events, 'busy').at(-1)?.summary.handedBack).toBe(true)
  })

  it('serves every file from one timer', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    for (let i = 0; i < 30; i++) writeFileSync(join(dir, `agent-w${i}.jsonl`), line('user', 'Work.') + called(`t${i}`, 'Bash', { command: 'pnpm build' }))
    const timers = vi.spyOn(globalThis, 'setInterval')
    try {
      const { events, watcher } = watch(dir)
      await expect.poll(() => events.length, { timeout: 5000 }).toBe(30)
      expect(watcher.followed()).toHaveLength(30)
      await pause(150)
      expect(timers).toHaveBeenCalledTimes(1)
    } finally {
      timers.mockRestore()
    }
  })

  it('sends an open agent’s items, then its new lines, until it is closed', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-a1.jsonl'), line('user', 'Watch the logs.') + said('Watching the logs.'))
    const { events, watcher } = watch(dir)
    await expect.poll(() => events.length).toBe(1)
    watcher.open('a1')
    await expect.poll(() => texts(itemsOf(events, 'a1'))).toEqual(['Watch the logs.', 'Watching the logs.'])
    expect(events.find((e) => e.kind === 'items')).toMatchObject({ reset: true })
    expect(itemsOf(events, 'a1').some((i) => 'parentToolUseId' in i && i.parentToolUseId !== undefined)).toBe(false)

    appendFileSync(join(dir, 'agent-a1.jsonl'), said('Logs are quiet.'))
    await expect.poll(() => texts(itemsOf(events, 'a1'))).toEqual(['Watch the logs.', 'Watching the logs.', 'Logs are quiet.'])
    watcher.close('a1')
    appendFileSync(join(dir, 'agent-a1.jsonl'), said('Still quiet.'))
    await expect.poll(() => summaries(events, 'a1').at(-1)?.summary.replies).toBe(3)
    await pause(150)
    expect(itemsOf(events, 'a1')).toHaveLength(3)
  })

  it('picks up an agent whose file appears later, also when the folder did not exist yet', async () => {
    const dir = tempDir()
    const { events } = watch(dir)
    await pause(120)
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-b2.jsonl'), said('Watching the logs.'))

    await expect.poll(() => summaries(events, 'b2').length).toBe(1)
    expect(summaries(events, 'b2')[0].meta).toMatchObject({ agentId: 'b2' })
    expect(summaries(events, 'b2')[0].meta.description).toBeUndefined()
  })

  it('stops following once stopped', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-c3.jsonl'), said('one'))
    const { events, watcher } = watch(dir)
    await expect.poll(() => events.length).toBe(1)
    watcher.stop()
    appendFileSync(join(dir, 'agent-c3.jsonl'), said('two'))
    writeFileSync(join(dir, 'agent-d4.jsonl'), said('three'))
    await pause(200)
    expect(events).toHaveLength(1)
  })
})

describe('SubagentWatchService', () => {
  it('an unwatch that arrives while the folder is still being looked up leaves nothing following', async () => {
    const dir = tempDir()
    const root = join(dir, '..')
    mkdirSync(join(root, 's1', 'subagents'), { recursive: true })
    writeFileSync(join(root, 's1', 'subagents', 'agent-e5.jsonl'), said('hello'))
    let release: () => void = () => {}
    const lookedUp = new Promise<void>((r) => (release = r))
    const events: SubagentTailEvent[] = []
    const service = new SubagentWatchService(async () => (await lookedUp, root), (e) => events.push(e))
    const source = { cwd: 'C:\ws', sessionId: 's1' }
    const watching = service.watch(source)
    service.unwatch(source)
    release()
    await watching
    await pause(150)
    expect(events).toEqual([])
    service.stopAll()
  })
})

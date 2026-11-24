import { appendFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import type { SubagentTailEvent } from '../../shared/subagentTail'
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
  JSON.stringify({ isSidechain: true, agentId: 'x', type, uuid: `u${++n}`, timestamp: new Date(1_700_000_000_000 + n * 1000).toISOString(), message: { role: type, content } }) + '\n'
const said = (text: string): string => line('assistant', [{ type: 'text', text }])
const called = (id: string, name: string, input: unknown): string => line('assistant', [{ type: 'tool_use', id, name, input }])

const texts = (items: ChatItem[]): string[] =>
  items.flatMap((i) => (i.kind === 'assistant' ? i.content.flatMap((b) => (b.type === 'text' ? [(b as { text: string }).text] : [])) : i.kind === 'user' ? [i.text] : []))

function watch(dir: string): { events: SubagentTailEvent[]; watcher: SubagentWatcher } {
  const events: SubagentTailEvent[] = []
  const watcher = new SubagentWatcher(dir, 'k', (e) => events.push(e), 50)
  watchers.push(watcher)
  watcher.start()
  return { events, watcher }
}

const itemsOf = (events: SubagentTailEvent[], agentId: string): ChatItem[] => events.filter((e) => e.agentId === agentId).flatMap((e) => e.items)

describe('SubagentWatcher', () => {
  it('reads each agent file with its meta as chat items, then follows new lines', async () => {
    const dir = tempDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-a1.meta.json'), JSON.stringify({ agentType: 'Explore', description: 'Scan the routes', toolUseId: 'toolu_1', finished: true }))
    const first = line('user', 'Scan the routes for dead ones.').replace('{', '{"promptId":"P1",')
    writeFileSync(join(dir, 'agent-a1.jsonl'), first + called('t1', 'Read', { file_path: 'routes.ts' }))
    const { events } = watch(dir)

    await expect.poll(() => events.length).toBeGreaterThan(0)
    const startedAt = Date.parse((JSON.parse(first) as { timestamp: string }).timestamp)
    expect(events[0]).toMatchObject({
      key: 'k',
      agentId: 'a1',
      reset: true,
      meta: { agentId: 'a1', agentType: 'Explore', description: 'Scan the routes', toolUseId: 'toolu_1', finished: true, promptId: 'P1', startedAt }
    })
    expect(texts(events[0].items)).toEqual(['Scan the routes for dead ones.'])
    expect(events[0].items[1]).toMatchObject({ kind: 'assistant', content: [{ type: 'tool_use', name: 'Read' }] })
    expect(events[0].items.some((i) => 'parentToolUseId' in i && i.parentToolUseId !== undefined)).toBe(false)

    appendFileSync(join(dir, 'agent-a1.jsonl'), said('Routes look fine.'))
    await expect.poll(() => texts(itemsOf(events, 'a1'))).toEqual(['Scan the routes for dead ones.', 'Routes look fine.'])
  })

  it('picks up an agent whose file appears later, also when the folder did not exist yet', async () => {
    const dir = tempDir()
    const { events } = watch(dir)
    await new Promise((r) => setTimeout(r, 120))
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'agent-b2.jsonl'), said('Watching the logs.'))

    await expect.poll(() => texts(itemsOf(events, 'b2'))).toEqual(['Watching the logs.'])
    expect(events.find((e) => e.agentId === 'b2')?.meta).toMatchObject({ agentId: 'b2' })
    expect(events.find((e) => e.agentId === 'b2')?.meta.description).toBeUndefined()
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
    await new Promise((r) => setTimeout(r, 200))
    expect(texts(events.flatMap((e) => e.items))).toEqual(['one'])
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
    await new Promise((r) => setTimeout(r, 150))
    expect(events).toEqual([])
    service.stopAll()
  })
})

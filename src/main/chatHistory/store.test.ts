import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { AssistantMessageItem, ChatItem } from '../../shared/chatItems'
import { createChatHistoryStore, type ChatHistoryStore } from './store'

let root: string
let store: ChatHistoryStore

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-history-'))
  store = createChatHistoryStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

const user = (id: string, text: string): ChatItem => ({ kind: 'user', id, text })
const reply = (id: string, ...texts: string[]): AssistantMessageItem => ({
  kind: 'assistant',
  id,
  content: texts.map((text) => ({ type: 'text', text })),
  raw: { type: 'assistant', message: { id, role: 'assistant', content: [] } } as unknown as AssistantMessageItem['raw']
})

/** The old localStorage entry, as zustand persist wrote it. */
const legacy = (items: Record<string, ChatItem[]>): string => JSON.stringify({ state: { items }, version: 1 })

const restart = (): ChatHistoryStore => createChatHistoryStore(root)

describe('chat history store', () => {
  it('has no history before anything is saved', async () => {
    expect(await store.load()).toEqual({})
  })

  it('reloads saved changes as the same items after a restart', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'hi')] }])
    await store.apply('pane-1', [{ kind: 'append', items: [reply('m1', 'hello')] }])
    await store.apply('pane-2', [{ kind: 'set', items: [user('u2', 'other')] }])
    expect(await restart().load()).toEqual({ 'pane-1': [user('u1', 'hi'), reply('m1', 'hello')], 'pane-2': [user('u2', 'other')] })
  })

  it('applies changes in the order they came, even when not awaited', async () => {
    void store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'one')] }])
    void store.apply('pane-1', [{ kind: 'clear' }])
    await store.apply('pane-1', [{ kind: 'append', items: [user('u2', 'two')] }, { kind: 'append', items: [user('u3', 'three')] }])
    expect(await restart().load()).toEqual({ 'pane-1': [user('u2', 'two'), user('u3', 'three')] })
  })

  it('replaces the last assistant item of an id with its joined form, and appends one it has not seen', async () => {
    await store.apply('pane-1', [
      { kind: 'append', items: [user('u1', 'hi'), reply('m1', 'a')] },
      { kind: 'append', items: [user('u2', 'more')] },
      { kind: 'replace', item: reply('m1', 'a', 'b') },
      { kind: 'replace', item: reply('m2', 'c') }
    ])
    expect((await restart().load())['pane-1']).toEqual([user('u1', 'hi'), reply('m1', 'a', 'b'), user('u2', 'more'), reply('m2', 'c')])
  })

  it('keeps a cleared chat empty after a restart', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'hi')] }, { kind: 'clear' }])
    expect(await restart().load()).toEqual({ 'pane-1': [] })
  })

  it('deleting a session deletes its file', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'hi')] }])
    await store.apply('pane-2', [{ kind: 'append', items: [user('u2', 'hi')] }])
    await store.delete('pane-1')
    expect(await fs.readdir(root)).toEqual(['pane-2.jsonl'])
    expect(await restart().load()).toEqual({ 'pane-2': [user('u2', 'hi')] })
  })

  it('a corrupt file loads as empty for that session only, is set aside as .corrupt, and does not come back', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'kept')] }])
    await fs.writeFile(join(root, 'pane-2.jsonl'), '{"kind":"append","items":[{"kind":"user"\n{"kind":"clear"}\n')
    expect(await restart().load()).toEqual({ 'pane-1': [user('u1', 'kept')], 'pane-2': [] })
    expect(await fs.readFile(join(root, 'pane-2.jsonl.corrupt'), 'utf-8')).toContain('{"kind":"clear"}')
    await store.apply('pane-2', [{ kind: 'append', items: [user('u2', 'new')] }])
    expect((await restart().load())['pane-2']).toEqual([user('u2', 'new')])
  })

  it('a file cut off mid-write keeps the changes written before the cut', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'kept')] }])
    await fs.appendFile(join(root, 'pane-1.jsonl'), '{"kind":"append","items":[{"kind":"us')
    expect(await restart().load()).toEqual({ 'pane-1': [user('u1', 'kept')] })
  })

  it('a load compacts each file to its current items', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'one')] }, { kind: 'append', items: [user('u2', 'two')] }, { kind: 'replace', item: reply('m1', 'a') }])
    await store.load()
    const lines = (await fs.readFile(join(root, 'pane-1.jsonl'), 'utf-8')).trimEnd().split('\n')
    expect(lines.map((l) => JSON.parse(l))).toEqual([{ kind: 'set', items: [user('u1', 'one'), user('u2', 'two'), reply('m1', 'a')] }])
    expect(await fs.readdir(root)).toEqual(['pane-1.jsonl'])
  })

  it('a legacy import fills only sessions without a file', async () => {
    await store.apply('pane-1', [{ kind: 'append', items: [user('u1', 'newer')] }])
    await store.apply('pane-2', [{ kind: 'append', items: [user('u2', 'x')] }, { kind: 'clear' }])
    await store.importLegacy(legacy({ 'pane-1': [user('o1', 'old')], 'pane-2': [user('o2', 'old')], 'pane-3': [user('o3', 'old'), reply('m3', 'a')] }))
    expect(await restart().load()).toEqual({ 'pane-1': [user('u1', 'newer')], 'pane-2': [], 'pane-3': [user('o3', 'old'), reply('m3', 'a')] })
  })

  it('a legacy entry it cannot read fails the import and saves nothing', async () => {
    await expect(store.importLegacy('{"state":{"items":{"pane-1":[{"kind":"user"')).rejects.toThrow()
    await expect(store.importLegacy('{"state":{"items":{"pane-1":"not a list"}},"version":1}')).rejects.toThrow()
    await expect(store.importLegacy('{"version":1}')).rejects.toThrow()
    expect(await restart().load()).toEqual({})
  })
})

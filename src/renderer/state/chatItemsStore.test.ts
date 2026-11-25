import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { HistoryChange } from '../../shared/chatHistory'
import type { AssistantMessageItem, ChatItem } from '../components/chat/types'
import type { LegacyImport } from '../../shared/types'

const storageWrites: string[] = []
vi.stubGlobal('localStorage', {
  getItem: () => null,
  setItem: (key: string) => void storageWrites.push(key),
  removeItem: (key: string) => void storageWrites.push(key)
})

const { connectHistoryBridge, hydrateChatItems, migrateLegacyChatItems, useChatItemsStore } = await import('./chatItemsStore')

const sent: [string, HistoryChange][] = []
const user = (id: string): ChatItem => ({ kind: 'user', id, text: id })
const reply = (id: string, ...texts: string[]): AssistantMessageItem => ({
  kind: 'assistant',
  id,
  content: texts.map((text) => ({ type: 'text', text })),
  raw: { type: 'assistant', message: { id, role: 'assistant', content: [] } } as unknown as AssistantMessageItem['raw']
})
const chat = () => useChatItemsStore.getState()

beforeEach(() => {
  sent.length = 0
  storageWrites.length = 0
  useChatItemsStore.setState({ items: {} })
  connectHistoryBridge({ send: (paneId, change) => void sent.push([paneId, change]) })
})

describe('chat items store and its history', () => {
  it('each action sends the matching change for its session', () => {
    chat().appendItems('p1', [user('u1')])
    chat().setItems('p2', [user('u2')])
    chat().clearItems('p1')
    chat().deletePane('p2')
    expect(sent).toEqual([
      ['p1', { kind: 'append', items: [user('u1')] }],
      ['p2', { kind: 'set', items: [user('u2')] }],
      ['p1', { kind: 'clear' }],
      ['p2', { kind: 'delete' }]
    ])
  })

  it('a new assistant message is appended; a later block of it replaces the item by id with the joined one', () => {
    chat().mergeAssistant('p1', reply('m1', 'a'))
    chat().mergeAssistant('p1', reply('m1', 'b'))
    expect(chat().items.p1).toEqual([reply('m1', 'a', 'b')])
    expect(sent).toEqual([
      ['p1', { kind: 'append', items: [reply('m1', 'a')] }],
      ['p1', { kind: 'replace', item: reply('m1', 'a', 'b') }]
    ])
  })

  it('no action writes to localStorage', () => {
    chat().appendItems('p1', [user('u1')])
    chat().mergeAssistant('p1', reply('m1', 'a'))
    chat().setItems('p1', [user('u2')])
    chat().clearItems('p1')
    chat().deletePane('p1')
    expect(storageWrites).toEqual([])
  })

  it('loaded history shows without being sent back, and does not overwrite a chat changed meanwhile', () => {
    chat().appendItems('p1', [user('live')])
    sent.length = 0
    hydrateChatItems({ p1: [user('old')], p2: [user('saved')] })
    expect(chat().items).toEqual({ p1: [user('live')], p2: [user('saved')] })
    expect(sent).toEqual([])
  })
})

describe('moving the legacy localStorage history over', () => {
  const KEY = 'command-center.chat-items'
  const ENTRY = '{"state":{"items":{"p1":[]}},"version":1}'
  const storage = (entries: Record<string, string>) => ({
    getItem: (key: string) => entries[key] ?? null,
    removeItem: (key: string) => void delete entries[key]
  })
  const deferred = <T>() => {
    let resolve!: (value: T) => void
    let reject!: (err: Error) => void
    const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)))
    return { promise, resolve, reject }
  }

  it('imports the legacy entry and removes it only after the import resolves', async () => {
    const entries: Record<string, string> = { [KEY]: ENTRY, other: 'kept' }
    const imported: string[] = []
    const done = deferred<LegacyImport>()
    const migration = migrateLegacyChatItems(storage(entries), (entry) => (imported.push(entry), done.promise))
    await Promise.resolve()
    expect(imported).toEqual([ENTRY])
    expect(entries[KEY]).toBe(ENTRY)
    done.resolve('imported')
    await migration
    expect(entries).toEqual({ other: 'kept' })
  })

  it('a failed import keeps the entry for the next start', async () => {
    const entries: Record<string, string> = { [KEY]: ENTRY }
    const failed = deferred<LegacyImport>()
    const migration = migrateLegacyChatItems(storage(entries), () => failed.promise)
    failed.reject(new Error('disk full'))
    await expect(migration).resolves.toBeUndefined()
    expect(entries).toEqual({ [KEY]: ENTRY })
  })

  it('an entry main reports unreadable as chat history is removed, not retried', async () => {
    const entries: Record<string, string> = { [KEY]: '{"version":1}', other: 'kept' }
    await migrateLegacyChatItems(storage(entries), async () => 'unreadable')
    expect(entries).toEqual({ other: 'kept' })
  })

  it('without a legacy entry there is nothing to import', async () => {
    const imported: string[] = []
    await migrateLegacyChatItems(storage({}), async (entry) => (imported.push(entry), 'imported' as const))
    expect(imported).toEqual([])
  })
})

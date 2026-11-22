import { appendFileSync, mkdtempSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ChatItem } from '../../shared/chatItems'
import { readLastItems, TranscriptFollower } from './tail'

const roots: string[] = []
const followers: TranscriptFollower[] = []

afterEach(() => {
  for (const f of followers.splice(0)) f.stop()
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function tempFile(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'cc-tail-'))
  roots.push(root)
  const file = join(root, 'session.jsonl')
  writeFileSync(file, content)
  return file
}

const assistant = (n: number, text: string): string =>
  JSON.stringify({ type: 'assistant', uuid: `a${n}`, message: { id: `m${n}`, role: 'assistant', content: [{ type: 'text', text }] } }) + '\n'
const unknown = (n: number): string => JSON.stringify({ type: 'data-flow-records', v: 1, sessionId: 's', records: [{ n }] }) + '\n'
/** One record bigger than the reader's 512 KiB chunk. */
const huge = (): string => JSON.stringify({ type: 'api-request-blob', sessionId: 's', message: { content: 'x'.repeat(700 * 1024) } }) + '\n'

const texts = (items: ChatItem[]): string[] =>
  items.flatMap((i) => (i.kind === 'assistant' ? i.content.map((b) => (b as { text?: string }).text ?? '') : []))

describe('readLastItems', () => {
  it('returns the whole last message when unknown and oversized records follow it', async () => {
    const full = 'First paragraph.\n\nThese are the first features.\n\nMain v5 has first claim.'
    const content = assistant(1, 'earlier') + assistant(2, full) + unknown(1) + huge() + Array.from({ length: 200 }, (_, n) => unknown(n)).join('')
    const file = tempFile(content)

    const tail = await readLastItems(file, 200, 8 * 1024 * 1024)

    expect(texts(tail.items)).toEqual(['earlier', full])
    expect(tail.offset).toBe(Buffer.byteLength(content))
  })
})

describe('TranscriptFollower', () => {
  it('keeps emitting replies appended after unknown and oversized records', async () => {
    const file = tempFile(assistant(1, 'opened'))
    const emitted: ChatItem[] = []
    followers.push(new TranscriptFollower(file, statSync(file).size, (items) => emitted.push(...items)))

    appendFileSync(file, unknown(1) + huge() + unknown(2))
    appendFileSync(file, assistant(2, 'after the unknown records').slice(0, 40))
    await new Promise((r) => setTimeout(r, 50))
    appendFileSync(file, assistant(2, 'after the unknown records').slice(40) + unknown(3))
    await vi.waitFor(() => expect(texts(emitted)).toEqual(['after the unknown records']), { timeout: 5000 })

    appendFileSync(file, assistant(3, 'and the next one'))
    await vi.waitFor(() => expect(texts(emitted)).toEqual(['after the unknown records', 'and the next one']), { timeout: 5000 })
  })
})

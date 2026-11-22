import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { readLastLines, readTurn } from './turn'

const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function folder(): string {
  const root = mkdtempSync(join(tmpdir(), 'cc-turn-'))
  roots.push(root)
  return root
}

const calling = [
  JSON.stringify({ type: 'user', uuid: 'u', message: { role: 'user', content: 'build it' } }),
  JSON.stringify({ type: 'assistant', uuid: 'a', message: { role: 'assistant', stop_reason: 'tool_use', content: [{ type: 'tool_use', id: 't1', name: 'Bash', input: {} }] } })
]

describe('readTurn', () => {
  it('reads a pending tool call as working, and as waiting on input once the CLI says it waits', async () => {
    const root = folder()
    const file = join(root, 's1.jsonl')
    writeFileSync(file, calling.join('\n') + '\n')
    const sessions = join(root, 'sessions')
    expect(await readTurn(file, sessions, 's1', Date.now())).toBe('working')

    mkdirSync(sessions)
    writeFileSync(join(sessions, `${process.pid}.json`), JSON.stringify({ pid: process.pid, sessionId: 's1', status: 'waiting', updatedAt: 1 }))
    writeFileSync(join(sessions, '999999999.json'), JSON.stringify({ pid: 999999999, sessionId: 's1', status: 'busy', updatedAt: 2 }))
    expect(await readTurn(file, sessions, 's1', Date.now())).toBe('waiting-input')
  })
})

describe('readLastLines', () => {
  it('reads back past one huge last line to the message before it, and leaves out an unfinished line', async () => {
    const file = join(folder(), 's.jsonl')
    const huge = JSON.stringify({ type: 'api-request-blob', blob: 'x'.repeat(600 * 1024) })
    writeFileSync(file, `${calling[1]}\n${huge}\n{"type":"assist`)
    const lines = await readLastLines(file)
    expect(lines).toEqual([calling[1], huge])
  })
})

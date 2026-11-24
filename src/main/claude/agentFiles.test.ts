import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentFileCache } from './agentFiles'

const roots: string[] = []
afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

let n = 0
const said = (text: string): string =>
  JSON.stringify({ isSidechain: true, type: 'assistant', uuid: `u${++n}`, timestamp: new Date(1_700_000_000_000 + n * 1000).toISOString(), message: { role: 'assistant', content: [{ type: 'text', text }] } }) + '\n'

function agentFile(content: string): string {
  const root = mkdtempSync(join(tmpdir(), 'cc-agentfiles-'))
  roots.push(root)
  const file = join(root, 'agent-a1.jsonl')
  writeFileSync(file, content)
  return file
}

describe('the agent file cache', () => {
  it('parses only what was appended since the last read', async () => {
    const file = agentFile(said('one'))
    const cache = new AgentFileCache()
    expect(await cache.read(file)).toMatchObject({ grew: true, summary: { replies: 1 } })
    expect(await cache.read(file)).toMatchObject({ grew: false, summary: { replies: 1 } })
    appendFileSync(file, said('two'))
    expect(await cache.read(file)).toMatchObject({ grew: true, summary: { replies: 2 } })
  })

  it('starts the summary over when the file was rewritten shorter', async () => {
    const file = agentFile(said('one') + said('two'))
    const cache = new AgentFileCache()
    await cache.read(file)
    writeFileSync(file, said('fresh'))
    const { summary, grew } = await cache.read(file)
    expect(grew).toBe(true)
    expect(summary.replies).toBe(1)
  })
})

import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { readSubagentTranscript } from './subagentTranscript'

const SESSION = '0d7538ec-eb99-4538-a6b7-d61f2bbd3d97'
const AGENT = 'a7b9a9204da45b557'

const lines = [
  { type: 'fork-context-ref', agentId: AGENT, parentSessionId: SESSION },
  { parentUuid: null, isSidechain: true, agentId: AGENT, type: 'user', uuid: 'u1', message: { role: 'user', content: 'Look for the config' } },
  {
    isSidechain: true,
    agentId: AGENT,
    type: 'assistant',
    uuid: 'a1',
    message: { id: 'msg1', role: 'assistant', content: [{ type: 'text', text: 'It is in settings.json.' }] }
  }
]

let dir: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cc-subagent-'))
  const sub = join(dir, SESSION, 'subagents')
  mkdirSync(sub, { recursive: true })
  writeFileSync(join(sub, `agent-${AGENT}.jsonl`), lines.map((l) => JSON.stringify(l)).join('\n') + '\n')
  writeFileSync(join(sub, `agent-${AGENT}.meta.json`), JSON.stringify({ agentType: 'general-purpose', toolUseId: 'toolu_01Tp' }))
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

describe('a subagent transcript', () => {
  it('is read by agent id, its sidechain lines as chat items', async () => {
    const items = await readSubagentTranscript(dir, SESSION, { agentId: AGENT })
    expect(items?.map((i) => i.kind)).toEqual(['user', 'assistant'])
  })

  it('marks its replies as a subagent’s, so they get no copy button or time of their own', async () => {
    const items = await readSubagentTranscript(dir, SESSION, { toolUseId: 'toolu_01Tp' })
    expect(items?.[1]).toMatchObject({ kind: 'assistant', parentToolUseId: 'toolu_01Tp', raw: { parent_tool_use_id: 'toolu_01Tp' } })
  })

  it('is found by its Agent call when the agent id is not known, through the meta file', async () => {
    const items = await readSubagentTranscript(dir, SESSION, { toolUseId: 'toolu_01Tp' })
    expect(items).toHaveLength(2)
  })

  it('is null when there is none, and refuses ids that are not plain ids', async () => {
    expect(await readSubagentTranscript(dir, SESSION, { toolUseId: 'other' })).toBeNull()
    expect(await readSubagentTranscript(dir, '../x', { agentId: AGENT })).toBeNull()
    expect(await readSubagentTranscript(dir, SESSION, { agentId: '..\\..\\x' })).toBeNull()
  })
})

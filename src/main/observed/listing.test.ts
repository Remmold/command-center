import { mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { listObservedTranscripts } from './listing'

const NOW = Date.parse('2026-11-21T12:00:00Z')
const MIN = 60_000
const roots: string[] = []

afterEach(() => {
  for (const r of roots.splice(0)) rmSync(r, { recursive: true, force: true })
})

function line(entrypoint: string, sessionId: string): string {
  return JSON.stringify({
    parentUuid: null,
    isSidechain: false,
    type: 'user',
    message: { role: 'user', content: [{ type: 'text', text: 'hello' }] },
    uuid: `u-${sessionId}`,
    timestamp: '2026-11-21T11:00:00.000Z',
    userType: 'external',
    entrypoint,
    cwd: 'c:\work\repo',
    sessionId
  })
}

function transcriptsFolder(): string {
  const dir = mkdtempSync(join(tmpdir(), 'observed-'))
  roots.push(dir)
  return dir
}

function transcript(
  dir: string,
  sessionId: string,
  minutesAgo: number,
  lines: string[] = [line('claude-vscode', sessionId)]
): void {
  const file = join(dir, `${sessionId}.jsonl`)
  writeFileSync(file, lines.join('\n') + '\n')
  const at = new Date(NOW - minutesAgo * MIN)
  utimesSync(file, at, at)
}

const none = new Set<string>()

describe('listObservedTranscripts', () => {
  it('lists a VS Code transcript changed in the last 2 minutes as Live', async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'aaaa', 1)
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed).toEqual([
      expect.objectContaining({ sessionId: 'aaaa', state: 'live', modifiedAt: NOW - 1 * MIN })
    ])
  })

  it('marks one changed more than 2 minutes ago Quiet', async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'live', 2)
    transcript(dir, 'quiet', 2.1)
    transcript(dir, 'older', 29)
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed.map((t) => [t.sessionId, t.state])).toEqual([
      ['live', 'live'],
      ['quiet', 'quiet'],
      ['older', 'quiet']
    ])
  })

  it('drops one quiet for over 30 minutes', async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'edge', 30)
    transcript(dir, 'gone', 31)
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed.map((t) => t.sessionId)).toEqual(['edge'])
  })

  it('lists only transcripts tagged claude-vscode', async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'vscode', 1)
    transcript(dir, 'desktop', 1, [line('claude-desktop', 'desktop')])
    transcript(dir, 'cli', 1, [line('cli', 'cli')])
    transcript(dir, 'untagged', 1, [JSON.stringify({ type: 'summary', summary: 'x' })])
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed.map((t) => t.sessionId)).toEqual(['vscode'])
  })

  it("leaves out the app's own hosted sessions", async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'hosted', 1)
    transcript(dir, 'observed', 1)
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: new Set(['hosted']), now: NOW })
    expect(listed.map((t) => t.sessionId)).toEqual(['observed'])
  })

  it('goes by the most recent entrypoint tag in a large transcript', async () => {
    const dir = transcriptsFolder()
    const filler = JSON.stringify({ type: 'attachment', padding: 'x'.repeat(200_000) })
    transcript(dir, 'moved', 1, [line('cli', 'moved'), filler, line('claude-vscode', 'moved')])
    transcript(dir, 'left', 1, [line('claude-vscode', 'left'), filler, line('cli', 'left')])
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed.map((t) => t.sessionId)).toEqual(['moved'])
  })

  it('takes the title from the latest ai-title line, else a short session id', async () => {
    const dir = transcriptsFolder()
    transcript(dir, 'titled-session', 1, [
      line('claude-vscode', 'titled-session'),
      JSON.stringify({ type: 'ai-title', aiTitle: 'First guess', sessionId: 'titled-session' }),
      JSON.stringify({ type: 'ai-title', aiTitle: 'Fix the "board" drawer', sessionId: 'titled-session' })
    ])
    transcript(dir, '1234567890-untitled', 3)
    const listed = await listObservedTranscripts(dir, { hostedSessionIds: none, now: NOW })
    expect(listed.map((t) => t.title)).toEqual(['Fix the "board" drawer', '12345678'])
  })

  it('lists nothing for a missing folder', async () => {
    const listed = await listObservedTranscripts(join(tmpdir(), 'no-such-observed-dir'), {
      hostedSessionIds: none,
      now: NOW
    })
    expect(listed).toEqual([])
  })
})

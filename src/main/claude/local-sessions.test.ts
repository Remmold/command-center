import { mkdtempSync, rmSync, writeFileSync, utimesSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { appendCustomTitle, cleanSessionTitle, listLocalSessions, transcriptListing } from './local-sessions'

const line = (value: unknown): string => JSON.stringify(value)
const prompt = (text: string, extra: Record<string, unknown> = {}): string =>
  line({ type: 'user', message: { role: 'user', content: [{ type: 'text', text }] }, ...extra })

describe('a past session title', () => {
  it('is the first prompt when Claude never named it', () => {
    const listed = transcriptListing([prompt('  fix   the login\nbug'), prompt('and add a test')])
    expect(listed).toMatchObject({ title: 'fix the login bug', titleSource: 'prompt', preview: 'fix the login bug' })
  })

  it('is the latest ai-title over any prompt', () => {
    const listed = transcriptListing([
      prompt('fix it'),
      line({ type: 'ai-title', aiTitle: 'First guess', sessionId: 's' }),
      line({ type: 'ai-title', aiTitle: 'Fix login bug', sessionId: 's' }),
      line({ type: 'last-prompt', lastPrompt: 'more', sessionId: 's' })
    ])
    expect(listed).toMatchObject({ title: 'Fix login bug', titleSource: 'claude' })
  })

  it('is the latest custom-title (a rename) over an ai-title', () => {
    const listed = transcriptListing([
      line({ type: 'custom-title', customTitle: 'Old name', sessionId: 's' }),
      line({ type: 'ai-title', aiTitle: 'Fix login bug', sessionId: 's' }),
      line({ type: 'custom-title', customTitle: 'Auth work', sessionId: 's' })
    ])
    expect(listed).toMatchObject({ title: 'Auth work', titleSource: 'renamed' })
  })

  it('falls back to the last-prompt line, then a summary, before the first prompt', () => {
    expect(transcriptListing([prompt('first'), line({ type: 'last-prompt', lastPrompt: 'latest ask' })]).title).toBe('latest ask')
    expect(transcriptListing([prompt('first'), line({ type: 'summary', summary: 'Login fix' })]).title).toBe('Login fix')
  })

  it('is empty for a transcript with nothing to name it by, and malformed lines are skipped', () => {
    expect(transcriptListing(['not json', line({ type: 'system' })]).title).toBe('')
  })

  it('keeps the latest git branch for search', () => {
    const listed = transcriptListing([prompt('a', { gitBranch: 'main' }), prompt('b', { gitBranch: 'feature/login' })])
    expect(listed.gitBranch).toBe('feature/login')
  })
})

describe('listing past sessions', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('lists each transcript newest first with its title', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cc-local-sessions-'))
    writeFileSync(join(dir, 'old.jsonl'), [prompt('old prompt')].join('\n'))
    writeFileSync(join(dir, 'new.jsonl'), [prompt('new prompt'), line({ type: 'ai-title', aiTitle: 'New work' })].join('\n'))
    writeFileSync(join(dir, 'notes.txt'), 'ignored')
    utimesSync(join(dir, 'old.jsonl'), new Date(1_000_000), new Date(1_000_000))
    const listed = await listLocalSessions(dir)
    expect(listed.map((s) => [s.sessionId, s.title, s.titleSource])).toEqual([
      ['new', 'New work', 'claude'],
      ['old', 'old prompt', 'prompt']
    ])
  })
})

describe('renaming a past session', () => {
  let dir = ''
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true })
  })

  it('cleans the title as the CLI does: control characters become spaces, trimmed, at most 200 characters', () => {
    expect(cleanSessionTitle('  Fix\tlogin\u200bbug\n ')).toBe('Fix login bug')
    expect(cleanSessionTitle('é'.repeat(250))).toBe('é'.repeat(200))
    expect(cleanSessionTitle(' \n ')).toBe('')
  })

  it('appends a custom-title line that the listing then shows', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cc-local-sessions-'))
    writeFileSync(join(dir, 'abc-123.jsonl'), prompt('fix it') + '\n' + line({ type: 'ai-title', aiTitle: 'Fix it' }) + '\n')
    expect(await appendCustomTitle(dir, 'abc-123', 'Auth work')).toBe(true)
    const [listed] = await listLocalSessions(dir)
    expect([listed.title, listed.titleSource]).toEqual(['Auth work', 'renamed'])
  })

  it('writes nothing for a session without a transcript or an id that is not a plain name', async () => {
    dir = mkdtempSync(join(tmpdir(), 'cc-local-sessions-'))
    expect(await appendCustomTitle(dir, 'missing', 'X')).toBe(false)
    expect(await appendCustomTitle(dir, '../evil', 'X')).toBe(false)
    expect(await listLocalSessions(dir)).toEqual([])
  })
})

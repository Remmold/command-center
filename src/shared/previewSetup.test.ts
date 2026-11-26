import { describe, expect, it } from 'vitest'
import { buildPreviewSetupPrompt, readPreviewDraft, settlePreviewDraft } from './previewSetup'

describe('buildPreviewSetupPrompt', () => {
  const prompt = buildPreviewSetupPrompt({ draftFile: 'C:\data\preview-drafts\a.json' })

  it('names the draft file and asks for the config shape', () => {
    expect(prompt).toContain('C:\data\preview-drafts\a.json')
    for (const key of ['install', 'servers', 'startPage', '{port}', 'cwd']) expect(prompt).toContain(key)
  })

  it('tells Claude what to write for a project with nothing to serve, and to change nothing else', () => {
    expect(prompt).toContain('"noBrowser": true')
    expect(prompt).toMatch(/package manifest/i)
    expect(prompt).toMatch(/edit no other file/i)
  })
})

describe('readPreviewDraft', () => {
  const draft = { install: 'pnpm install', servers: [{ name: 'web', command: 'pnpm dev --port {port}', cwd: '.' }], startPage: '/' }

  it('accepts a valid draft', () => {
    const read = readPreviewDraft(JSON.stringify(draft))
    expect(read).toMatchObject({ kind: 'config', config: { install: 'pnpm install', servers: [{ name: 'web', ready: 'port' }] } })
  })

  it('accepts the no-browser outcome with its reason', () => {
    expect(readPreviewDraft('{"noBrowser": true, "reason": "A native game."}')).toEqual({ kind: 'none', reason: 'A native game.' })
  })

  it('reads a no-browser outcome without a reason', () => {
    expect(readPreviewDraft('{"noBrowser": true}')).toEqual({ kind: 'none', reason: '' })
  })

  it('waits on text that is not JSON yet, as a half-written file is', () => {
    expect(readPreviewDraft('{"install": ')).toEqual({ kind: 'waiting' })
    expect(readPreviewDraft('')).toEqual({ kind: 'waiting' })
  })

  it('refuses an invalid config with the field named', () => {
    const read = readPreviewDraft(JSON.stringify({ ...draft, servers: [{ name: 'web', command: '', cwd: '.' }] }))
    expect(read).toEqual({ kind: 'refused', error: 'servers[1].command is required (web).' })
  })

  it('refuses a server folder outside the worktree', () => {
    const read = readPreviewDraft(JSON.stringify({ ...draft, servers: [{ name: 'web', command: 'x', cwd: '../up' }] }))
    expect(read.kind).toBe('refused')
  })

  it('reads a draft with no servers that is not the no-browser outcome as empty', () => {
    expect(readPreviewDraft(JSON.stringify({ install: 'pnpm install', servers: [] }))).toEqual({ kind: 'empty' })
  })

  it('refuses JSON that is not an object', () => {
    expect(readPreviewDraft('[1]')).toMatchObject({ kind: 'refused' })
  })
})

describe('readPreviewDraft, first writes', () => {
  it('reads an empty object or an empty server list as an empty first write, not a refusal', () => {
    expect(readPreviewDraft('{}')).toEqual({ kind: 'empty' })
    expect(readPreviewDraft('{"install": "", "servers": []}')).toEqual({ kind: 'empty' })
  })
})

describe('settlePreviewDraft', () => {
  const config = { install: '', servers: [], startPage: '/' } as never
  const base = { dirty: false, waitedMs: 1000, emptyForMs: 0 }

  it('keeps waiting while nothing has landed', () => {
    expect(settlePreviewDraft({ kind: 'waiting' }, base)).toEqual({ kind: 'wait' })
  })

  it('gives up with a plain note after ten minutes', () => {
    const out = settlePreviewDraft({ kind: 'waiting' }, { ...base, waitedMs: 10 * 60_000 })
    expect(out).toMatchObject({ kind: 'end', error: null })
    expect(out.kind === 'end' && out.note).toMatch(/no answer/i)
  })

  it('treats an empty first write as still waiting for a while, then refuses it', () => {
    expect(settlePreviewDraft({ kind: 'empty' }, { ...base, emptyForMs: 5_000 })).toEqual({ kind: 'wait' })
    expect(settlePreviewDraft({ kind: 'empty' }, { ...base, emptyForMs: 30_000 })).toMatchObject({ kind: 'end', error: expect.stringContaining('no servers') })
  })

  it('applies a proposal and ends the setup when the page is clean', () => {
    expect(settlePreviewDraft({ kind: 'config', config }, base)).toMatchObject({ kind: 'end', apply: config })
  })

  it('keeps a proposal that lands over unsaved edits and offers it', () => {
    expect(settlePreviewDraft({ kind: 'config', config }, { ...base, dirty: true })).toMatchObject({ kind: 'offer', config })
  })

  it('reports a refusal and a no-browser answer, each ending the setup', () => {
    expect(settlePreviewDraft({ kind: 'refused', error: 'bad' }, base)).toMatchObject({ kind: 'end', error: expect.stringContaining('bad') })
    expect(settlePreviewDraft({ kind: 'none', reason: 'A game.' }, base)).toMatchObject({ kind: 'end', note: 'No browser needed: A game.' })
    expect(settlePreviewDraft({ kind: 'none', reason: '' }, base)).toMatchObject({ kind: 'end', note: expect.stringContaining('nothing to serve') })
  })
})

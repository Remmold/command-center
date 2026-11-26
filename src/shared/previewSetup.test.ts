import { describe, expect, it } from 'vitest'
import { buildPreviewSetupPrompt, readPreviewDraft } from './previewSetup'

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

  it('refuses a draft with no servers that is not the no-browser outcome', () => {
    expect(readPreviewDraft(JSON.stringify({ install: 'pnpm install', servers: [] }))).toMatchObject({ kind: 'refused' })
  })

  it('refuses JSON that is not an object', () => {
    expect(readPreviewDraft('[1]')).toMatchObject({ kind: 'refused' })
  })
})

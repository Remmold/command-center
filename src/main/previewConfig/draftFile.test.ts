import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { beginPreviewDraft, discardPreviewDraft, readPreviewDraftFile, sweepStalePreviewDrafts } from './draftFile'

let folder: string
beforeEach(async () => {
  folder = await fs.mkdtemp(join(tmpdir(), 'preview-draft-'))
})
afterEach(async () => {
  await fs.rm(folder, { recursive: true, force: true })
})

describe('preview draft file', () => {
  it('waits while Claude has not written the file', async () => {
    const begun = await beginPreviewDraft(folder, 'abc')
    if (!begun.ok) throw new Error(begun.error)
    expect(await readPreviewDraftFile(folder, begun.file)).toEqual({ kind: 'waiting' })
  })

  it('reads what Claude wrote, then discards it', async () => {
    const begun = await beginPreviewDraft(folder, 'abc')
    if (!begun.ok) throw new Error(begun.error)
    await fs.writeFile(begun.file, '{"noBrowser": true, "reason": "A game."}')
    expect(await readPreviewDraftFile(folder, begun.file)).toEqual({ kind: 'none', reason: 'A game.' })
    await discardPreviewDraft(folder, begun.file)
    expect(await readPreviewDraftFile(folder, begun.file)).toEqual({ kind: 'waiting' })
  })

  it('refuses a plain name that would leave the folder, and a file outside it', async () => {
    expect((await beginPreviewDraft(folder, '../x')).ok).toBe(false)
    const outside = join(tmpdir(), 'other.json')
    expect((await readPreviewDraftFile(folder, outside)).kind).toBe('refused')
    await discardPreviewDraft(folder, outside)
  })
})

describe('sweeping stale drafts', () => {
  it('removes draft files older than a day and leaves newer ones and other files', async () => {
    const old = join(folder, 'old.json')
    const fresh = join(folder, 'fresh.json')
    const other = join(folder, 'notes.txt')
    for (const f of [old, fresh, other]) await fs.writeFile(f, '{}')
    const now = Date.now()
    const twoDays = new Date(now - 2 * 86_400_000)
    await fs.utimes(old, twoDays, twoDays)
    await fs.utimes(other, twoDays, twoDays)
    await sweepStalePreviewDrafts(folder, now)
    expect(await fs.readdir(folder)).toEqual(['fresh.json', 'notes.txt'])
  })

  it('does nothing for a folder that does not exist yet', async () => {
    await expect(sweepStalePreviewDrafts(join(folder, 'missing'), Date.now())).resolves.toBeUndefined()
  })
})

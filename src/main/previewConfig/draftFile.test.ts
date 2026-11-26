import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { beginPreviewDraft, discardPreviewDraft, readPreviewDraftFile } from './draftFile'

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

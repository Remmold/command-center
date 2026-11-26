import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createPreviewConfigStore } from './store'

let dir: string
let file: string
beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'cc-preview-'))
  file = join(dir, 'sub', 'preview-configs.json')
})
afterEach(() => rmSync(dir, { recursive: true, force: true }))

const web = { install: 'pnpm i', servers: [{ name: 'web', command: 'pnpm dev --port {port}' }, { name: 'api', command: 'node api.js', cwd: 'api' }], startPage: '/app' }

describe('preview config store', () => {
  it('has no config for a workspace that never saved one', async () => {
    expect(await createPreviewConfigStore(file).get('w1')).toBeNull()
  })

  it('keeps a saved config per workspace across a restart', async () => {
    const store = createPreviewConfigStore(file)
    expect((await store.save('w1', web)).ok).toBe(true)
    const again = await createPreviewConfigStore(file).get('w1')
    expect(again?.servers.map((s) => s.name)).toEqual(['web', 'api'])
    expect(again?.startPage).toBe('/app')
    expect(await createPreviewConfigStore(file).get('w2')).toBeNull()
  })

  it('refuses an invalid config with the field named and keeps the old one', async () => {
    const store = createPreviewConfigStore(file)
    await store.save('w1', web)
    const bad = await store.save('w1', { servers: [{ name: 'web' }] })
    expect(bad).toEqual({ ok: false, error: expect.stringContaining('servers[1].command') })
    expect((await store.get('w1'))?.install).toBe('pnpm i')
  })

  it('removes the entry when an empty config is saved', async () => {
    const store = createPreviewConfigStore(file)
    await store.save('w1', web)
    expect(await store.save('w1', { install: '', servers: [] })).toEqual({ ok: true, config: null })
    expect(await store.get('w1')).toBeNull()
    expect(JSON.parse(readFileSync(file, 'utf-8'))).toEqual({})
  })

  it('skips an entry in the file that no longer validates', async () => {
    const store = createPreviewConfigStore(file)
    await store.save('w1', web)
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    raw.w9 = { servers: [{ name: '' }] }
    writeFileSync(file, JSON.stringify(raw))
    expect(await store.get('w9')).toBeNull()
    expect(await store.get('w1')).not.toBeNull()
  })
})

describe('preview config store, broken files', () => {
  it('reads a corrupt file as no config instead of failing, and a save then replaces it', async () => {
    const store = createPreviewConfigStore(file)
    await store.save('w1', web)
    writeFileSync(file, '{ not json')
    expect(await store.get('w1')).toBeNull()
    expect((await store.save('w1', web)).ok).toBe(true)
    expect(await store.get('w1')).not.toBeNull()
  })

  it('keeps another workspace entry that no longer validates when saving', async () => {
    const store = createPreviewConfigStore(file)
    await store.save('w1', web)
    const raw = JSON.parse(readFileSync(file, 'utf-8'))
    raw.w9 = { servers: [{ name: '' }] }
    writeFileSync(file, JSON.stringify(raw))
    await store.save('w2', web)
    expect(JSON.parse(readFileSync(file, 'utf-8')).w9).toBeDefined()
  })
})

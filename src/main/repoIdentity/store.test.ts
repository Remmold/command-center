import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRepoIdentityStore, type RepoIdentityStore } from './store'

const KEY = 'git:c:/projects/darkfall/.git'
const OTHER = 'dir:c:/notes'

const PNG_BYTES = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex')
const SVG_TEXT = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>'

let root: string
let store: RepoIdentityStore

beforeEach(async () => {
  root = await fs.mkdtemp(join(tmpdir(), 'cc-identity-'))
  store = createRepoIdentityStore(root)
})

afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true })
})

describe('repo identity store', () => {
  it('has no identities before anything is saved', async () => {
    expect(await store.list()).toEqual({})
  })

  it('keeps a built-in icon and display name across a restart', async () => {
    await store.setIcon(KEY, { kind: 'builtin', name: 'rocket', accent: 'teal' })
    await store.setDisplayName(KEY, 'Darkfall')
    expect(await createRepoIdentityStore(root).list()).toEqual({
      [KEY]: { displayName: 'Darkfall', icon: { kind: 'builtin', name: 'rocket', accent: 'teal' } }
    })
  })

  it('drops entries a hand edit broke and keeps the valid ones', async () => {
    await fs.writeFile(
      join(root, 'repo-identities.json'),
      JSON.stringify({
        [KEY]: { displayName: 'Darkfall', icon: { kind: 'builtin', name: 'no-such-icon', accent: 'teal' } },
        [OTHER]: { icon: { kind: 'image', file: '../../secrets.png' } },
        'dir:c:/x': 'not an identity'
      })
    )
    expect(await store.list()).toEqual({ [KEY]: { displayName: 'Darkfall' } })
  })

  it('treats an unreadable file as no identities', async () => {
    await fs.writeFile(join(root, 'repo-identities.json'), '{ not json')
    expect(await store.list()).toEqual({})
  })

  it('copies a chosen PNG into the app data folder and uses it as the icon', async () => {
    const source = join(root, 'logo.PNG')
    await fs.writeFile(source, PNG_BYTES)
    const result = await store.importImage(KEY, source)
    expect(result.ok).toBe(true)
    const icon = (await store.list())[KEY]?.icon
    expect(icon).toMatchObject({ kind: 'image', file: expect.stringMatching(/^[0-9a-f]+\.png$/) })
    if (icon?.kind !== 'image') throw new Error('expected an image icon')
    expect(await fs.readFile(store.imagePath(icon.file))).toEqual(PNG_BYTES)
  })

  it('accepts an SVG', async () => {
    const source = join(root, 'logo.svg')
    await fs.writeFile(source, SVG_TEXT)
    expect((await store.importImage(KEY, source)).ok).toBe(true)
    expect((await store.list())[KEY]?.icon).toMatchObject({ kind: 'image', file: expect.stringMatching(/\.svg$/) })
  })

  it.each([
    ['a JPEG', 'logo.jpg', PNG_BYTES],
    ['a file named .png that is not a PNG', 'fake.png', Buffer.from('hello')],
    ['a file named .svg that is not an SVG', 'fake.svg', Buffer.from('hello')],
    ['an image over 1 MB', 'huge.png', Buffer.concat([PNG_BYTES, Buffer.alloc(1024 * 1024)])]
  ])('refuses %s and leaves the icon alone', async (_case, name, bytes) => {
    await store.setIcon(KEY, { kind: 'builtin', name: 'rocket', accent: 'teal' })
    const source = join(root, name)
    await fs.writeFile(source, bytes)
    const result = await store.importImage(KEY, source)
    expect(result).toMatchObject({ ok: false, error: expect.any(String) })
    expect((await store.list())[KEY]?.icon).toEqual({ kind: 'builtin', name: 'rocket', accent: 'teal' })
  })

  it('deletes a replaced image once no repo group uses it', async () => {
    const first = join(root, 'first.png')
    await fs.writeFile(first, PNG_BYTES)
    await store.importImage(KEY, first)
    await store.importImage(OTHER, first)
    const icon = (await store.list())[KEY]?.icon
    if (icon?.kind !== 'image') throw new Error('expected an image icon')
    const stored = store.imagePath(icon.file)

    await store.setIcon(KEY, undefined)
    await expect(fs.stat(stored)).resolves.toBeTruthy()
    await store.setIcon(OTHER, { kind: 'builtin', name: 'zap', accent: 'red' })
    await expect(fs.stat(stored)).rejects.toThrow()
  })

  it('keeps the icons found in a repo, best first, and their copies while any is listed', async () => {
    const svg = Buffer.from(SVG_TEXT)
    await store.setFound(KEY, [
      { bytes: PNG_BYTES, ext: 'png', path: 'brand/app-icon-1024.png', source: 'file' },
      { bytes: svg, ext: 'svg', path: 'public/favicon.svg', source: 'file' }
    ])
    const found = (await createRepoIdentityStore(root).list())[KEY]?.found ?? []
    expect(found.map((f) => f.path)).toEqual(['brand/app-icon-1024.png', 'public/favicon.svg'])
    expect(await fs.readFile(store.imagePath(found[1].file))).toEqual(svg)

    await store.setFound(KEY, [{ bytes: svg, ext: 'svg', path: 'public/favicon.svg', source: 'file' }])
    await expect(fs.stat(store.imagePath(found[0].file))).rejects.toThrow()
    await expect(fs.stat(store.imagePath(found[1].file))).resolves.toBeTruthy()
  })

  it('remembers a search that found nothing apart from no search at all', async () => {
    await store.setFound(KEY, [])
    expect(await store.list()).toEqual({ [KEY]: { found: [] } })
  })

  it('keeps a found icon the user picked after a new search drops it', async () => {
    await store.setFound(KEY, [{ bytes: PNG_BYTES, ext: 'png', path: 'icon.png', source: 'file' }])
    const [picked] = (await store.list())[KEY]?.found ?? []
    await store.setIcon(KEY, { kind: 'image', file: picked.file })
    await store.setFound(KEY, [])
    expect((await store.list())[KEY]?.icon).toEqual({ kind: 'image', file: picked.file })
    await expect(fs.stat(store.imagePath(picked.file))).resolves.toBeTruthy()
  })

  it('keeps the letter chosen on purpose', async () => {
    await store.setIcon(KEY, { kind: 'letter' })
    expect(await createRepoIdentityStore(root).list()).toEqual({ [KEY]: { icon: { kind: 'letter' } } })
  })
})

import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mediaTarget } from './mediaTarget'

let dir: string
beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cc-media-target-'))
  await fs.writeFile(join(dir, 'crate.glb'), 'glTF')
  await fs.writeFile(join(dir, 'secrets.txt'), 'token')
  await fs.mkdir(join(dir, 'folder.glb'))
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

describe('the file a media path serves', () => {
  it('is the file itself when it is a media file', async () => {
    const found = await mediaTarget(join(dir, 'crate.glb'))
    expect(found).toMatchObject({ type: { kind: 'model', mime: 'model/gltf-binary' } })
    expect(found?.path.toLowerCase()).toBe((await fs.realpath(join(dir, 'crate.glb'))).toLowerCase())
  })

  it('is nothing for a .glb link whose target is not a media file, judged by the real path', async () => {
    const links = new Map([[join(dir, 'evil.glb'), join(dir, 'secrets.txt')]])
    const realpath = async (p: string): Promise<string> => links.get(p) ?? fs.realpath(p)
    expect(await mediaTarget(join(dir, 'evil.glb'), realpath)).toBeNull()
  })

  it('is nothing for a folder, a missing file or a path without a media extension', async () => {
    expect(await mediaTarget(join(dir, 'folder.glb'))).toBeNull()
    expect(await mediaTarget(join(dir, 'missing.glb'))).toBeNull()
    expect(await mediaTarget(join(dir, 'secrets.txt'))).toBeNull()
  })
})

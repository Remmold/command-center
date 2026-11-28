import { promises as fs } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { MediaFile } from '../../shared/media'
import { openModel, type GateMedia } from './modelFile'

let dir: string
const gated: string[] = []
// As resolveMedia: absolute paths that exist and are media pass, and are remembered as allowed.
const gate: GateMedia = async (_cwd, paths) =>
  Promise.all(
    paths.map(async (path): Promise<MediaFile> => {
      const ok = /\.(glb|png)$/i.test(path) && (await fs.stat(path).then((s) => s.isFile(), () => false))
      if (!ok) return { found: false }
      gated.push(path)
      return { found: true, path, url: `cc-media://file/${encodeURIComponent(path)}` }
    })
  )

beforeEach(async () => {
  dir = await fs.mkdtemp(join(tmpdir(), 'cc-model3d-open-'))
  gated.length = 0
})
afterEach(() => fs.rm(dir, { recursive: true, force: true }))

const write = (name: string, body: string) => fs.writeFile(join(dir, name), body)

describe('opening a model', () => {
  it('lets the GLB and its contact sheet through the media gate and reads the stats gen3d.py wrote', async () => {
    await write('crate.glb', 'glTF')
    await write('crate_sheet.png', 'png')
    await write(
      'crate.json',
      JSON.stringify({ glb: 'x', preset: 'prop', seconds: 42, tris: 1980, textures: ['1024x1024', '512x512'], size_xyz: [1.2, 0.8, 0.5], seed: 7 })
    )
    const glb = join(dir, 'crate.glb')
    expect(await openModel(glb, gate)).toEqual({
      ok: true,
      model: {
        path: glb,
        name: 'crate',
        url: `cc-media://file/${encodeURIComponent(glb)}`,
        sheetUrl: `cc-media://file/${encodeURIComponent(join(dir, 'crate_sheet.png'))}`,
        stats: { tris: 1980, textures: ['1024x1024', '512x512'], preset: 'prop', seconds: 42, size: [1.2, 0.8, 0.5] }
      }
    })
    expect(gated).toEqual([glb, join(dir, 'crate_sheet.png')])
  })

  it('has no sheet and empty stats without a sheet or .json, and keeps only the stats that are well formed', async () => {
    await write('lamp.glb', 'glTF')
    const lamp = await openModel(join(dir, 'lamp.glb'), gate)
    expect(lamp).toMatchObject({ ok: true, model: { name: 'lamp', sheetUrl: null, stats: { tris: null, textures: null, preset: null, seconds: null, size: null } } })

    await write('idol.glb', 'glTF')
    await write('idol.json', JSON.stringify({ preset: 'hero', seconds: 'slow', tris: -3, textures: ['1x1', 4], size_xyz: [1, 2] }))
    const idol = await openModel(join(dir, 'idol.glb'), gate)
    expect(idol).toMatchObject({ ok: true, model: { stats: { tris: null, textures: null, preset: 'hero', seconds: null, size: null } } })

    await write('vase.glb', 'glTF')
    await write('vase.json', '{ not json')
    expect(await openModel(join(dir, 'vase.glb'), gate)).toMatchObject({ ok: true, model: { stats: { tris: null, preset: null } } })
  })

  it('refuses a file that is not a GLB on disk', async () => {
    await write('notes.txt', 'hi')
    expect(await openModel(join(dir, 'notes.txt'), gate)).toEqual({ ok: false, error: `${join(dir, 'notes.txt')} is not a .glb model` })
    expect(await openModel(join(dir, 'gone.glb'), gate)).toEqual({ ok: false, error: `${join(dir, 'gone.glb')} was not found` })
    expect(gated).toEqual([])
  })
})

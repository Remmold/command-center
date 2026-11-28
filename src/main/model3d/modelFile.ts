import { promises as fs } from 'node:fs'
import { basename, dirname, extname, join } from 'node:path'
import type { MediaFile } from '../../shared/media'
import { parseModel3dStats, type Model3dOpenResult } from '../../shared/model3d'

/** The media gate (`resolveMedia`): only paths it found may be served. */
export type GateMedia = (cwd: string, paths: readonly string[]) => Promise<MediaFile[]>

async function readJson(path: string): Promise<unknown> {
  try {
    return JSON.parse(await fs.readFile(path, 'utf8'))
  } catch {
    return null
  }
}

/** A `.glb` for the 3D view: it and its `<name>_sheet.png` pass the media gate, and the stats come from `<name>.json`. */
export async function openModel(path: string, gate: GateMedia): Promise<Model3dOpenResult> {
  if (extname(path).toLowerCase() !== '.glb') return { ok: false, error: `${path} is not a .glb model` }
  const name = basename(path, extname(path))
  const [glb] = await gate('', [path])
  if (!glb?.found) return { ok: false, error: `${path} was not found` }
  const [sheet] = await gate('', [join(dirname(glb.path), `${name}_sheet.png`)])
  const stats = parseModel3dStats(await readJson(join(dirname(glb.path), `${name}.json`)))
  return { ok: true, model: { path: glb.path, name, url: glb.url, sheetUrl: sheet?.found ? sheet.url : null, stats } }
}

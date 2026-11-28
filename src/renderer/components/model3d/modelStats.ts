import { Mesh, Texture, type Material, type Object3D } from 'three'
import type { Model3dStats } from '../../../shared/model3d'

/** What the loaded scene itself holds, for a model without a `.json`. */
export interface CountedStats {
  tris: number
  /** Each texture once, as `<width>x<height>`. */
  textures: string[]
}

const materialsOf = (mesh: Mesh): Material[] => (Array.isArray(mesh.material) ? mesh.material : [mesh.material])

function texturesOf(material: Material): Texture[] {
  return Object.values(material).filter((v): v is Texture => v instanceof Texture)
}

function imageSize(texture: Texture): string | null {
  const image = texture.image as { width?: unknown; height?: unknown } | null | undefined
  return typeof image?.width === 'number' && typeof image.height === 'number' ? `${image.width}x${image.height}` : null
}

export function countScene(root: Object3D): CountedStats {
  let tris = 0
  const seen = new Set<string>()
  const textures: string[] = []
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return
    const geometry = node.geometry
    const corners = geometry.index ? geometry.index.count : (geometry.getAttribute('position')?.count ?? 0)
    tris += Math.floor(corners / 3)
    for (const texture of materialsOf(node).flatMap(texturesOf)) {
      if (seen.has(texture.uuid)) continue
      seen.add(texture.uuid)
      const size = imageSize(texture)
      if (size) textures.push(size)
    }
  })
  return { tris, textures }
}

/** The stats panel's rows: the `.json`'s values first, the scene's count where the `.json` has none, and only what is known. */
export function modelStatEntries(json: Model3dStats, counted: CountedStats | null): [string, string][] {
  const tris = json.tris ?? counted?.tris ?? null
  const textures = json.textures ?? counted?.textures ?? null
  const entries: [string, string | null][] = [
    ['Triangles', tris === null ? null : tris.toLocaleString('en-US')],
    ['Textures', textures === null ? null : textures.length > 0 ? textures.join(', ') : 'None'],
    ['Preset', json.preset],
    ['Seconds', json.seconds === null ? null : `${json.seconds} s`],
    ['Size', json.size === null ? null : json.size.join(' × ')]
  ]
  return entries.filter((e): e is [string, string] => e[1] !== null)
}

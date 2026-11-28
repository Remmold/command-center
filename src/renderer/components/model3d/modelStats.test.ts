import { BufferAttribute, BufferGeometry, Group, Mesh, MeshStandardMaterial, Texture } from 'three'
import { describe, expect, it } from 'vitest'
import type { Model3dStats } from '../../../shared/model3d'
import { countScene, modelStatEntries } from './modelStats'

function texture(width: number, height: number): Texture {
  const t = new Texture()
  t.image = { width, height }
  return t
}

function mesh(triangles: number, indexed: boolean, map: Texture | null, normalMap: Texture | null = null): Mesh {
  const geometry = new BufferGeometry()
  geometry.setAttribute('position', new BufferAttribute(new Float32Array(triangles * 9), 3))
  if (indexed) geometry.setIndex(Array.from({ length: triangles * 3 }, (_, i) => i))
  return new Mesh(geometry, new MeshStandardMaterial({ map, normalMap }))
}

const NONE: Model3dStats = { tris: null, textures: null, preset: null, seconds: null, size: null }

describe('a model with no .json', () => {
  it('counts the triangles of every mesh, indexed or not, and each texture once by its size', () => {
    const base = texture(1024, 1024)
    const root = new Group()
    const child = new Group()
    child.add(mesh(3, false, base, texture(512, 256)))
    root.add(mesh(10, true, base), child)
    expect(countScene(root)).toEqual({ tris: 13, textures: ['1024x1024', '512x256'] })
  })

  it('shows the counted triangles and textures', () => {
    expect(modelStatEntries(NONE, { tris: 1, textures: ['1x1'] })).toEqual([
      ['Triangles', '1'],
      ['Textures', '1x1']
    ])
    expect(modelStatEntries(NONE, { tris: 2400, textures: [] })).toEqual([
      ['Triangles', '2,400'],
      ['Textures', 'None']
    ])
  })
})

describe('a model with a .json', () => {
  it('shows its triangles, textures, preset, seconds and size over what the scene counts', () => {
    const json: Model3dStats = { tris: 1980, textures: ['1024x1024', '512x512'], preset: 'prop', seconds: 42, size: [1.2, 0.8, 0.5] }
    expect(modelStatEntries(json, { tris: 2000, textures: ['2048x2048'] })).toEqual([
      ['Triangles', '1,980'],
      ['Textures', '1024x1024, 512x512'],
      ['Preset', 'prop'],
      ['Seconds', '42 s'],
      ['Size', '1.2 × 0.8 × 0.5']
    ])
  })

  it('fills what the .json lacks from the scene, and leaves out what neither knows yet', () => {
    expect(modelStatEntries({ ...NONE, preset: 'hero', seconds: 95 }, { tris: 7, textures: ['256x256'] })).toEqual([
      ['Triangles', '7'],
      ['Textures', '256x256'],
      ['Preset', 'hero'],
      ['Seconds', '95 s']
    ])
    expect(modelStatEntries({ ...NONE, preset: 'hero' }, null)).toEqual([['Preset', 'hero']])
  })
})

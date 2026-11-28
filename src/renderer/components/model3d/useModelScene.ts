import { useEffect, useRef, useState, type RefObject } from 'react'
import {
  Box3,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  Scene,
  Texture,
  Vector3,
  WebGLRenderer,
  type Material,
  type Object3D
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { OrbitControls } from 'three/addons/controls/OrbitControls.js'
import { countScene, type CountedStats } from './modelStats'

export type Shading = 'lit' | 'unlit'

export type SceneState =
  | { state: 'loading' }
  | { state: 'shown'; counted: CountedStats }
  | { state: 'failed'; error: string }

interface Look {
  wireframe: boolean
  shading: Shading
}

interface Loaded {
  root: Object3D
  /** Each mesh's own materials, and the basic stand-ins unlit swaps in. */
  materials: Map<Mesh, { lit: Material | Material[]; unlit: Material | Material[] }>
}

type Mapped = Material & { map?: Texture | null; color?: MeshBasicMaterial['color']; vertexColors?: boolean }

function unlitOf(material: Material): Material {
  const m = material as Mapped
  const basic = new MeshBasicMaterial({ map: m.map ?? null, vertexColors: m.vertexColors ?? false })
  if (m.color) basic.color.copy(m.color)
  basic.transparent = material.transparent
  basic.opacity = material.opacity
  basic.alphaTest = material.alphaTest
  basic.side = material.side
  return basic
}

const each = (m: Material | Material[], fn: (m: Material) => void): void => (Array.isArray(m) ? m.forEach(fn) : fn(m))

function applyLook(loaded: Loaded, look: Look): void {
  for (const [mesh, set] of loaded.materials) {
    mesh.material = look.shading === 'lit' ? set.lit : set.unlit
    each(mesh.material, (m) => {
      ;(m as Material & { wireframe?: boolean }).wireframe = look.wireframe
    })
  }
}

function frame(root: Object3D, camera: PerspectiveCamera, controls: OrbitControls): void {
  const box = new Box3().setFromObject(root)
  if (box.isEmpty()) return
  const center = box.getCenter(new Vector3())
  const radius = Math.max(box.getSize(new Vector3()).length() / 2, 1e-3)
  const distance = radius / Math.sin((camera.fov * Math.PI) / 360)
  camera.near = distance / 100
  camera.far = distance * 100
  camera.position.copy(center).add(new Vector3(1, 0.7, 1).normalize().multiplyScalar(distance))
  camera.updateProjectionMatrix()
  controls.target.copy(center)
  controls.update()
}

function dispose(loaded: Loaded): void {
  const textures = new Set<Texture>()
  for (const [mesh, set] of loaded.materials) {
    mesh.geometry.dispose()
    each(set.lit, (m) => {
      for (const v of Object.values(m)) if (v instanceof Texture) textures.add(v)
      m.dispose()
    })
    each(set.unlit, (m) => m.dispose())
  }
  for (const t of textures) t.dispose()
}

/**
 * Shows the GLB at `url` on the canvas: orbit, pan and zoom, drawn only when something changes.
 * Without WebGL the model still loads, so its counts are known; `webgl` says whether it can be drawn.
 */
export function useModelScene(canvas: RefObject<HTMLCanvasElement>, url: string, look: Look): SceneState & { webgl: boolean } {
  const [scene, setScene] = useState<SceneState>({ state: 'loading' })
  const [webgl, setWebgl] = useState(true)
  const lookRef = useRef(look)
  lookRef.current = look
  const live = useRef<{ loaded: Loaded | null; render: () => void } | null>(null)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    setScene({ state: 'loading' })
    let renderer: WebGLRenderer | null = null
    try {
      renderer = new WebGLRenderer({ canvas: el, antialias: true, alpha: true })
      renderer.setPixelRatio(window.devicePixelRatio)
      setWebgl(true)
    } catch {
      setWebgl(false)
    }
    const world = new Scene()
    world.add(new HemisphereLight(0xffffff, 0x444444, 1.2))
    const sun = new DirectionalLight(0xffffff, 2)
    sun.position.set(3, 5, 4)
    world.add(sun)
    const camera = new PerspectiveCamera(40, 1, 0.01, 1000)
    const controls = new OrbitControls(camera, el)
    const render = (): void => {
      renderer?.render(world, camera)
    }
    const current: { loaded: Loaded | null; render: () => void } = { loaded: null, render }
    live.current = current
    controls.addEventListener('change', render)

    const resize = (): void => {
      const box = el.parentElement
      if (!box || !renderer) return
      const { clientWidth: w, clientHeight: h } = box
      if (w === 0 || h === 0) return
      renderer.setSize(w, h, false)
      camera.aspect = w / h
      camera.updateProjectionMatrix()
      render()
    }
    const observer = new ResizeObserver(resize)
    if (el.parentElement) observer.observe(el.parentElement)
    resize()

    let cancelled = false
    new GLTFLoader().load(
      url,
      (gltf) => {
        if (cancelled) return
        const materials: Loaded['materials'] = new Map()
        gltf.scene.traverse((node) => {
          if (node instanceof Mesh) materials.set(node, { lit: node.material, unlit: Array.isArray(node.material) ? node.material.map(unlitOf) : unlitOf(node.material) })
        })
        const loaded: Loaded = { root: gltf.scene, materials }
        current.loaded = loaded
        world.add(gltf.scene)
        applyLook(loaded, lookRef.current)
        frame(gltf.scene, camera, controls)
        render()
        setScene({ state: 'shown', counted: countScene(gltf.scene) })
      },
      undefined,
      (err) => {
        if (!cancelled) setScene({ state: 'failed', error: err instanceof Error ? err.message : String(err) })
      }
    )

    return () => {
      cancelled = true
      live.current = null
      observer.disconnect()
      controls.removeEventListener('change', render)
      controls.dispose()
      if (current.loaded) dispose(current.loaded)
      renderer?.dispose()
    }
  }, [canvas, url])

  useEffect(() => {
    const current = live.current
    if (!current?.loaded) return
    applyLook(current.loaded, look)
    current.render()
  }, [look.wireframe, look.shading, scene.state])

  return { ...scene, webgl }
}

import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

const NO_GUID = /^0+$/
const GUID = /guid: ([0-9a-f]{32})/g
const ICON_BLOCKS = ['m_BuildTargetIcons', 'm_BuildTargetPlatformIcons']
const META_HEAD_BYTES = 512
const MAX_META_ENTRIES = 50_000
const META_SCAN_MS = 2000

async function readText(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8')
  } catch {
    return null
  }
}

export async function isFile(path: string): Promise<boolean> {
  return (await fs.stat(path).catch(() => null))?.isFile() ?? false
}

export function toRepoPath(root: string, path: string): string {
  return relative(root, path).split(sep).join('/')
}

interface TargetGuids {
  target: string
  guids: string[]
}

/** Each `  m_Block:` list of PlayerSettings, split by `m_BuildTarget`. */
function iconGuidsByTarget(settings: string, block: string): TargetGuids[] {
  const lines = settings.split(/\r?\n/)
  const start = lines.findIndex((l) => l.startsWith(`  ${block}:`))
  if (start === -1) return []
  const out: TargetGuids[] = []
  for (const line of lines.slice(start + 1)) {
    if (/^ {0,2}\S/.test(line) && !line.startsWith('  -')) break
    const target = /m_BuildTarget:\s*(.*)$/.exec(line)
    if (target) out.push({ target: target[1].trim(), guids: [] })
    for (const [, guid] of line.matchAll(GUID)) if (!NO_GUID.test(guid)) out.at(-1)?.guids.push(guid)
  }
  return out
}

/** The default icon (empty build target) first, then Standalone, then the rest in file order. */
function orderedGuids(settings: string): string[] {
  const rank = (target: string): number => (target === '' ? 0 : target === 'Standalone' ? 1 : 2)
  const guids = ICON_BLOCKS.flatMap((block) =>
    iconGuidsByTarget(settings, block)
      .map((t, i) => ({ ...t, i }))
      .sort((a, b) => rank(a.target) - rank(b.target) || a.i - b.i)
      .flatMap((t) => t.guids)
  )
  return [...new Set(guids)]
}

/** Texture path for each wanted guid, from the `.meta` files under `assets`. Only each meta's head is read. */
async function texturesByGuid(assets: string, wanted: ReadonlySet<string>): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  const pending = [assets]
  let seen = 0
  const deadline = Date.now() + META_SCAN_MS
  while (pending.length && found.size < wanted.size && seen < MAX_META_ENTRIES && Date.now() < deadline) {
    const dir = pending.pop()!
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      seen++
      const path = join(dir, entry.name)
      if (entry.isDirectory()) pending.push(path)
      else if (entry.name.endsWith('.meta')) {
        const handle = await fs.open(path, 'r').catch(() => null)
        if (!handle) continue
        const head = Buffer.alloc(META_HEAD_BYTES)
        const { bytesRead } = await handle.read(head, 0, META_HEAD_BYTES, 0).finally(() => handle.close())
        const guid = /^guid: ([0-9a-f]{32})/m.exec(head.toString('utf-8', 0, bytesRead))?.[1]
        if (guid && wanted.has(guid)) found.set(guid, path.slice(0, -'.meta'.length))
      }
    }
  }
  return found
}

/** Repo paths of the icon textures a Unity project's PlayerSettings name, best first. */
export async function readUnityIcons(root: string): Promise<string[]> {
  const settings = await readText(join(root, 'ProjectSettings', 'ProjectSettings.asset'))
  if (!settings) return []
  const guids = orderedGuids(settings)
  if (guids.length === 0) return []
  const textures = await texturesByGuid(join(root, 'Assets'), new Set(guids))
  const out: string[] = []
  for (const guid of guids) {
    const texture = textures.get(guid)
    if (texture && (await isFile(texture))) out.push(toRepoPath(root, texture))
  }
  return out
}

/** Repo path of `config/icon` in a Godot project's `[application]` section. */
export async function readGodotIcon(root: string): Promise<string | null> {
  const project = await readText(join(root, 'project.godot'))
  if (!project) return null
  let section = ''
  for (const line of project.split(/\r?\n/)) {
    const header = /^\[(.+)\]\s*$/.exec(line)
    if (header) section = header[1]
    const icon = section === 'application' ? /^config\/icon="res:\/\/(.+)"\s*$/.exec(line) : null
    if (!icon) continue
    const path = icon[1]
    if (path.split('/').includes('..')) return null
    return (await isFile(join(root, path))) ? path : null
  }
  return null
}

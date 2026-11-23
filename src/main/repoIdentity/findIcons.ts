import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { locateRipgrep, runRipgrep } from '../files/ripgrep'
import { isFile, readGodotIcon, readUnityIcons, toRepoPath } from './projectIcons'
import { PNG_HEADER_BYTES, pngSize } from './pngSize'
import { looksLikeIconFile, type IconCandidate } from './rankIcons'

const SKIP_DIRS = ['node_modules', '.git', 'Library', 'Temp', 'obj', 'dist', 'out', 'release', 'build', '.next']
/** Bundled third-party code, whose favicons are someone else's. Any case. */
const VENDOR_DIRS = ['vendor', 'third_party', 'third-party', 'thirdparty', 'external', 'externals', 'sdk']
/** Folders below the root; ripgrep counts the file itself as one more level. */
const MAX_DEPTH = 4
const MAX_FILES = 5000
const WALK_MS = 2000
const IMAGE_EXT = /\.(png|svg|ico)$/i
const ELECTRON_BUILD_ICONS = ['build/icon.png', 'build/icon.svg', 'build/icon.ico']
const EXE_DIRS = ['Build', 'Builds', 'Run', 'bin']
const NOT_THE_APP_EXE = /^(unins\d*|UnityCrashHandler(32|64)?)\.exe$/i

async function walkImages(root: string): Promise<string[]> {
  const out: string[] = []
  const deadline = Date.now() + WALK_MS
  const pending: { dir: string; depth: number }[] = [{ dir: root, depth: 0 }]
  let seen = 0
  while (pending.length && seen < MAX_FILES && Date.now() < deadline) {
    const { dir, depth } = pending.shift()!
    const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      seen++
      if (entry.name.startsWith('.') || SKIP_DIRS.includes(entry.name) || VENDOR_DIRS.includes(entry.name.toLowerCase())) continue
      const path = join(dir, entry.name)
      if (entry.isDirectory() && depth < MAX_DEPTH) pending.push({ dir: path, depth: depth + 1 })
      else if (entry.isFile() && IMAGE_EXT.test(entry.name)) out.push(toRepoPath(root, path))
    }
  }
  return out
}

/** Image files to depth 4, honouring .gitignore when ripgrep is there. */
async function listImages(root: string): Promise<string[]> {
  const rg = locateRipgrep()
  if (rg) {
    const args = [
      '--files',
      '--max-depth',
      String(MAX_DEPTH + 1),
      ...['*.png', '*.svg', '*.ico'].flatMap((g) => ['--iglob', g]),
      ...SKIP_DIRS.flatMap((d) => ['--glob', `!${d}`]),
      ...VENDOR_DIRS.flatMap((d) => ['--iglob', `!${d}`])
    ]
    try {
      const files = await runRipgrep(rg, root, args, { timeoutMs: WALK_MS, maxBuffer: 2_000_000 })
      return files.slice(0, MAX_FILES).map((p) => p.replaceAll('\\', '/'))
    } catch (err) {
      console.warn('[repo icons] ripgrep failed, walking the folder', err)
    }
  }
  return walkImages(root)
}

async function withSize(root: string, candidate: IconCandidate): Promise<IconCandidate> {
  if (!candidate.path.toLowerCase().endsWith('.png')) return candidate
  const handle = await fs.open(join(root, candidate.path), 'r').catch(() => null)
  if (!handle) return candidate
  try {
    const head = Buffer.alloc(PNG_HEADER_BYTES)
    const { bytesRead } = await handle.read(head, 0, PNG_HEADER_BYTES, 0)
    const size = pngSize(head.subarray(0, bytesRead))
    return size ? { ...candidate, ...size } : candidate
  } finally {
    await handle.close()
  }
}

async function exesIn(root: string, dir: string, depth: number): Promise<string[]> {
  const entries = await fs.readdir(join(root, dir), { withFileTypes: true }).catch(() => [])
  const out: string[] = []
  for (const entry of entries) {
    const path = dir ? `${dir}/${entry.name}` : entry.name
    if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe') && !NOT_THE_APP_EXE.test(entry.name)) out.push(path)
    else if (entry.isDirectory() && depth > 0 && entry.name !== 'node_modules') out.push(...(await exesIn(root, path, depth - 1)))
  }
  return out
}

/** Every possible icon of a repo, unranked. Only reads; executables are listed, never run. */
export async function findIconCandidates(root: string): Promise<IconCandidate[]> {
  const [images, electron, unity, godot, rootExes, ...dirExes] = await Promise.all([
    listImages(root),
    Promise.all(ELECTRON_BUILD_ICONS.map(async (p) => ((await isFile(join(root, p))) ? p : null))),
    readUnityIcons(root),
    readGodotIcon(root),
    exesIn(root, '', 0),
    ...EXE_DIRS.map((d) => exesIn(root, d, 1))
  ])
  const named = [...new Set([...images.filter(looksLikeIconFile), ...electron.filter((p): p is string => p !== null)])]
  const candidates: IconCandidate[] = [
    ...named.map((path) => ({ path, source: 'file' as const })),
    ...unity.map((path) => ({ path, source: 'unity' as const })),
    ...(godot ? [{ path: godot, source: 'godot' as const }] : []),
    ...[...rootExes, ...dirExes.flat()].map((path) => ({ path, source: 'exe' as const }))
  ]
  return Promise.all(candidates.map((c) => withSize(root, c)))
}

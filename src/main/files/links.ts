import { existsSync, promises as fs } from 'node:fs'
import { extname, isAbsolute, join, normalize, relative, resolve, sep } from 'node:path'
import { shell } from 'electron'
import { fileKind } from '../../shared/fileLinks'
import type { LinkedPath } from '../../shared/types'

const MAX_IMAGE_BYTES = 25 * 1024 * 1024
const IMAGE_TYPES: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml'
}

function insideWorkspace(cwd: string, file: string): string | null {
  const rel = relative(normalize(cwd), file)
  if (!rel || rel.startsWith('..') || isAbsolute(rel)) return null
  return rel.split(sep).join('/')
}

/** The host's `openFile` lookup: relative to the workspace, else as given, else a rooted path's tail in the workspace. */
export function resolveLinkedPath(cwd: string, path: string, exists: (p: string) => boolean): LinkedPath | null {
  if (!cwd && !isAbsolute(path)) return null
  let full = isAbsolute(path) ? resolve(path) : resolve(cwd, path)
  if (!exists(full) && isAbsolute(path)) {
    const tail = /^\/[^/]+\/[^/]+\/(.+)$/.exec(path)
    if (tail && exists(join(cwd, tail[1]))) full = join(cwd, tail[1])
  }
  if (!exists(full)) return null
  return { path: full, relative: insideWorkspace(cwd, full) }
}

export function resolveLink(cwd: string, path: string): LinkedPath | null {
  return resolveLinkedPath(cwd, path, existsSync)
}

export async function readImage(path: string): Promise<{ ok: true; dataUrl: string } | { ok: false; error: string }> {
  const type = IMAGE_TYPES[extname(path).toLowerCase()]
  if (!type || fileKind(path) !== 'image') return { ok: false, error: 'not an image' }
  try {
    const stat = await fs.stat(path)
    if (stat.size > MAX_IMAGE_BYTES) return { ok: false, error: 'image too large to preview' }
    const bytes = await fs.readFile(path)
    return { ok: true, dataUrl: `data:${type};base64,${bytes.toString('base64')}` }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

// A link in Claude's reply is untrusted text: the system app for these runs code instead of showing a file.
const CODE_EXTENSIONS = new Set([
  '.exe', '.msi', '.msp', '.bat', '.cmd', '.com', '.scr', '.pif', '.cpl', '.dll', '.lnk', '.url', '.ps1', '.psm1',
  '.vbs', '.vbe', '.js', '.jse', '.wsf', '.wsh', '.hta', '.jar', '.reg', '.appref-ms', '.application', '.msc', '.gadget'
])

export function launchesCode(path: string): boolean {
  return CODE_EXTENSIONS.has(extname(path).toLowerCase())
}

/** Opens an existing file or folder with the system's default app; resolves to an error message, '' on success. */
export async function openWithSystem(path: string): Promise<string> {
  if (!isAbsolute(path) || !existsSync(path)) return 'file not found'
  if (launchesCode(path)) return 'programs and scripts are not started from a chat'
  return shell.openPath(path)
}

import { promises as fs } from 'node:fs'
import { join, relative, sep } from 'node:path'

const IGNORE_DIRS = new Set([
  'node_modules',
  '.git',
  'out',
  'dist',
  'build',
  'release',
  '.next',
  '.turbo',
  '.cache',
  'coverage',
  '.idea',
  '.vscode',
  'target',
  '__pycache__',
  '.venv',
  'venv'
])

const IGNORE_FILES = new Set(['.DS_Store', 'Thumbs.db'])

const MAX_FILES = 5000

const cache = new Map<string, { mtime: number; files: string[] }>()
const CACHE_TTL_MS = 15_000

export async function listProjectFiles(root: string): Promise<string[]> {
  const now = Date.now()
  const cached = cache.get(root)
  if (cached && now - cached.mtime < CACHE_TTL_MS) {
    return cached.files
  }
  const out: string[] = []
  await walk(root, root, out)
  out.sort()
  cache.set(root, { mtime: now, files: out })
  return out
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  if (out.length >= MAX_FILES) return
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    if (out.length >= MAX_FILES) return
    if (entry.name.startsWith('.') && IGNORE_DIRS.has(entry.name)) continue
    if (IGNORE_FILES.has(entry.name)) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (IGNORE_DIRS.has(entry.name)) continue
      await walk(root, full, out)
    } else if (entry.isFile()) {
      out.push(relative(root, full).split(sep).join('/'))
    }
  }
}

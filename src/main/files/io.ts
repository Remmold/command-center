import { promises as fs } from 'node:fs'
import { isAbsolute, normalize, resolve, sep } from 'node:path'

const MAX_FILE_BYTES = 5 * 1024 * 1024 // 5MB cap

function resolveSafe(cwd: string, relativePath: string): string {
  // Disallow absolute paths and prevent .. escape from cwd.
  if (isAbsolute(relativePath)) {
    throw new Error('absolute paths not allowed')
  }
  const full = resolve(cwd, relativePath)
  const normalizedCwd = normalize(cwd).replace(/[\\/]+$/, '')
  if (!full.startsWith(normalizedCwd + sep) && full !== normalizedCwd) {
    throw new Error('path escapes project directory')
  }
  return full
}

export interface ReadResult {
  ok: boolean
  content?: string
  binary?: boolean
  size?: number
  error?: string
}

export async function readProjectFile(cwd: string, relativePath: string): Promise<ReadResult> {
  let full: string
  try {
    full = resolveSafe(cwd, relativePath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    const stat = await fs.stat(full)
    if (stat.size > MAX_FILE_BYTES) {
      return { ok: false, error: `file too large (${(stat.size / 1024).toFixed(0)}KB > 5MB)` }
    }
    const buf = await fs.readFile(full)
    // Quick binary detection: presence of NUL byte in first 8KB
    const sample = buf.subarray(0, 8192)
    if (sample.includes(0)) {
      return { ok: true, binary: true, size: stat.size }
    }
    return { ok: true, content: buf.toString('utf-8'), size: stat.size }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface WriteResult {
  ok: boolean
  error?: string
}

export async function writeProjectFile(
  cwd: string,
  relativePath: string,
  content: string
): Promise<WriteResult> {
  let full: string
  try {
    full = resolveSafe(cwd, relativePath)
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
  try {
    await fs.writeFile(full, content, 'utf-8')
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

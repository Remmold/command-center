import { promises as fs } from 'node:fs'
import { dirname } from 'node:path'
import { userDataPath } from '../util/paths'
import { DEFAULT_SCAN_ROOTS } from './discovery'

function settingsFile(): string {
  return userDataPath('board-settings.json')
}

function isRootList(x: unknown): x is string[] {
  return Array.isArray(x) && x.every((r) => typeof r === 'string' && r.trim() !== '')
}

export async function readScanRoots(): Promise<string[]> {
  try {
    const parsed: unknown = JSON.parse(await fs.readFile(settingsFile(), 'utf-8'))
    const roots = (parsed as { scanRoots?: unknown } | null)?.scanRoots
    return isRootList(roots) ? roots : DEFAULT_SCAN_ROOTS
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT' || err instanceof SyntaxError) return DEFAULT_SCAN_ROOTS
    throw err
  }
}

export async function writeScanRoots(roots: string[]): Promise<string[]> {
  const byKey = new Map(roots.map((r) => r.trim()).filter((r) => r !== '').map((r) => [r.toLowerCase(), r]))
  const clean = [...byKey.values()]
  const file = settingsFile()
  await fs.mkdir(dirname(file), { recursive: true })
  const tmp = `${file}.tmp`
  await fs.writeFile(tmp, JSON.stringify({ scanRoots: clean }, null, 2), 'utf-8')
  await fs.rename(tmp, file)
  return clean
}

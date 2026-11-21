import { promises as fs } from 'node:fs'
import type { BoardFileReader, DirEntry } from './reader'

const MISSING = new Set(['ENOENT', 'ENOTDIR'])

export const nodeFileReader: BoardFileReader = {
  async listDir(path: string): Promise<DirEntry[]> {
    try {
      const entries = await fs.readdir(path, { withFileTypes: true })
      return entries.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }))
    } catch (err) {
      if (MISSING.has((err as NodeJS.ErrnoException).code ?? '')) return []
      throw err
    }
  },
  async readFile(path: string): Promise<string | null> {
    try {
      return await fs.readFile(path, 'utf-8')
    } catch (err) {
      if (MISSING.has((err as NodeJS.ErrnoException).code ?? '')) return null
      throw err
    }
  }
}

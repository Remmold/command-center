import { promises as fs } from 'node:fs'
import { resolve } from 'node:path'
import type { PathResolver } from '../../shared/mainChat'

/** Resolves a path against `base` and then through links, junctions, short names and case; null when nothing exists there. */
export const realPathFrom =
  (base: string): PathResolver =>
  async (path) => {
    try {
      return await fs.realpath(resolve(base, path))
    } catch {
      return null
    }
  }

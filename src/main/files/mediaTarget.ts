import { promises as fs } from 'node:fs'
import { mediaType, type MediaKind } from '../../shared/media'

/**
 * The file a media path really is, with its type, or null when that is not a media file: the type comes from the real
 * path, so a `.glb` symlink or junction to any other file is never served.
 */
export async function mediaTarget(
  path: string,
  realpath: (p: string) => Promise<string> = (p) => fs.realpath(p)
): Promise<{ path: string; type: { kind: MediaKind; mime: string }; size: number; mtimeMs: number } | null> {
  if (!mediaType(path)) return null
  const real = await realpath(path).catch(() => null)
  const type = real ? mediaType(real) : null
  if (!real || !type) return null
  const stat = await fs.stat(real).catch(() => null)
  return stat?.isFile() ? { path: real, type, size: stat.size, mtimeMs: stat.mtimeMs } : null
}

import { promises as fs } from 'node:fs'
import { join } from 'node:path'
import { app, nativeImage, type NativeImage } from 'electron'
import { MAX_REPO_IMAGE_BYTES } from '../../shared/repoIdentity'
import type { IconImages } from './service'

/** Twice the largest place an icon shows, for sharp thumbnails on a scaled screen. */
const MAX_PX = 128
/** Raster images are scaled down before they are kept, so a large app icon may exceed the 1 MB of a picked image. */
const MAX_RASTER_BYTES = 16 * 1024 * 1024

function shrunk(image: NativeImage): Buffer {
  const { width, height } = image.getSize()
  if (Math.max(width, height) <= MAX_PX) return image.toPNG()
  const scale = MAX_PX / Math.max(width, height)
  return image.resize({ width: Math.round(width * scale), height: Math.round(height * scale), quality: 'best' }).toPNG()
}

/** A zero-byte file named .exe: Windows shows the generic program icon for it. It is never run. */
async function genericExeBitmap(): Promise<Buffer | null> {
  const stub = join(app.getPath('temp'), 'command-center-plain.exe')
  try {
    await fs.writeFile(stub, '')
    return (await app.getFileIcon(stub, { size: 'large' })).toBitmap()
  } catch (err) {
    console.warn('[repo icons] no generic exe icon to compare with', err)
    return null
  } finally {
    await fs.rm(stub, { force: true })
  }
}

export function createIconImages(): IconImages {
  let generic: Promise<Buffer | null> | null = null
  return {
    load: async (path) => {
      const { size } = await fs.stat(path)
      const svg = path.toLowerCase().endsWith('.svg')
      if (size > (svg ? MAX_REPO_IMAGE_BYTES : MAX_RASTER_BYTES)) return null
      if (svg) {
        const bytes = await fs.readFile(path)
        return /<svg[\s>]/i.test(bytes.toString('utf-8', 0, 4096)) ? { bytes, ext: 'svg' } : null
      }
      const image = nativeImage.createFromPath(path)
      return image.isEmpty() ? null : { bytes: shrunk(image), ext: 'png' }
    },
    exeIcon: async (path) => {
      generic ??= genericExeBitmap()
      const icon = await app.getFileIcon(path, { size: 'large' })
      if (icon.isEmpty()) return null
      const plain = await generic
      return { bytes: icon.toPNG(), generic: !!plain && icon.toBitmap().equals(plain) }
    }
  }
}

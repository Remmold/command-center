import { fileBaseName } from './fileLinks'

export type MediaKind = 'image' | 'video'

export const MEDIA_TYPES: Readonly<Record<string, { kind: MediaKind; mime: string }>> = {
  png: { kind: 'image', mime: 'image/png' },
  jpg: { kind: 'image', mime: 'image/jpeg' },
  jpeg: { kind: 'image', mime: 'image/jpeg' },
  gif: { kind: 'image', mime: 'image/gif' },
  webp: { kind: 'image', mime: 'image/webp' },
  svg: { kind: 'image', mime: 'image/svg+xml' },
  bmp: { kind: 'image', mime: 'image/bmp' },
  mp4: { kind: 'video', mime: 'video/mp4' },
  webm: { kind: 'video', mime: 'video/webm' },
  mov: { kind: 'video', mime: 'video/quicktime' },
  mkv: { kind: 'video', mime: 'video/x-matroska' }
}

export function mediaType(path: string): { kind: MediaKind; mime: string } | null {
  const name = fileBaseName(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? (MEDIA_TYPES[name.slice(dot + 1).toLowerCase()] ?? null) : null
}

export function mediaKind(path: string): MediaKind | null {
  return mediaType(path)?.kind ?? null
}

/** The panel's scheme: serves only files a chat named, read-only. */
export const MEDIA_SCHEME = 'cc-media'

/** How a named file stands on disk; `url` loads it through the media scheme. */
export type MediaFile = { found: true; path: string; url: string } | { found: false }

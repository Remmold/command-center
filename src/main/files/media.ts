import { createReadStream } from 'node:fs'
import { isAbsolute, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { protocol, shell } from 'electron'
import { MEDIA_SCHEME, mediaType, type MediaFile } from '../../shared/media'
import { resolveLink } from './links'
import { byteRange } from './mediaRange'
import { mediaTarget } from './mediaTarget'

// The scheme serves a file only after a chat named it here, so a URL in Claude's text cannot reach any other file.
const named = new Set<string>()

const keyOf = (path: string): string => normalize(path).toLowerCase()

export const MEDIA_SCHEME_PRIVILEGES = { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }

/** Looks up each path a chat or the 3D view named, as a file link resolves, and lets the scheme serve the ones that are images, videos or GLB models. */
export async function resolveMedia(cwd: string, paths: readonly string[]): Promise<MediaFile[]> {
  return Promise.all(
    paths.map(async (path): Promise<MediaFile> => {
      const found = resolveLink(cwd, path)
      const stat = found ? await mediaTarget(found.path) : null
      if (!found || !stat) return { found: false }
      named.add(keyOf(found.path))
      const url = `${MEDIA_SCHEME}://file/${encodeURIComponent(found.path)}?v=${Math.floor(stat.mtimeMs)}`
      return { found: true, path: found.path, url }
    })
  )
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname.slice(1))
  if (url.host !== 'file' || !isAbsolute(path) || !mediaType(path) || !named.has(keyOf(path))) return new Response(null, { status: 404 })
  // The link is followed again here: it may have been pointed elsewhere since the chat named it.
  const stat = await mediaTarget(path)
  if (!stat) return new Response(null, { status: 404 })
  const range = byteRange(request.headers.get('range'), stat.size)
  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
  const body = Readable.toWeb(createReadStream(stat.path, { start: range.start, end: range.end })) as ReadableStream
  const headers: Record<string, string> = {
    'Content-Type': stat.type.mime,
    'Content-Length': String(range.end - range.start + 1),
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'no-cache'
  }
  if (range.partial) headers['Content-Range'] = `bytes ${range.start}-${range.end}/${stat.size}`
  return new Response(body, { status: range.partial ? 206 : 200, headers })
}

export function handleMediaScheme(): void {
  protocol.handle(MEDIA_SCHEME, serve)
}

/** Shows a file a chat named selected in Explorer. */
export function revealInFolder(path: string): void {
  if (isAbsolute(path) && named.has(keyOf(path))) shell.showItemInFolder(path)
}

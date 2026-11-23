import { createReadStream, promises as fs } from 'node:fs'
import { isAbsolute, normalize } from 'node:path'
import { Readable } from 'node:stream'
import { protocol, shell } from 'electron'
import { MEDIA_SCHEME, mediaType, type MediaFile } from '../../shared/media'
import { resolveLink } from './links'
import { byteRange } from './mediaRange'

// The scheme serves a file only after a chat named it here, so a URL in Claude's text cannot reach any other file.
const named = new Set<string>()

const keyOf = (path: string): string => normalize(path).toLowerCase()

export function registerMediaScheme(): void {
  protocol.registerSchemesAsPrivileged([
    { scheme: MEDIA_SCHEME, privileges: { standard: true, secure: true, stream: true, supportFetchAPI: true } }
  ])
}

/** Looks up each path a chat named, as a file link resolves, and lets the scheme serve the ones that are images or videos. */
export async function resolveMedia(cwd: string, paths: readonly string[]): Promise<MediaFile[]> {
  return Promise.all(
    paths.map(async (path): Promise<MediaFile> => {
      const found = resolveLink(cwd, path)
      if (!found || !mediaType(found.path)) return { found: false }
      const stat = await fs.stat(found.path).catch(() => null)
      if (!stat?.isFile()) return { found: false }
      named.add(keyOf(found.path))
      const url = `${MEDIA_SCHEME}://file/${encodeURIComponent(found.path)}?v=${Math.floor(stat.mtimeMs)}`
      return { found: true, path: found.path, url }
    })
  )
}

async function serve(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const path = decodeURIComponent(url.pathname.slice(1))
  const type = mediaType(path)
  if (url.host !== 'file' || !isAbsolute(path) || !type || !named.has(keyOf(path))) return new Response(null, { status: 404 })
  const stat = await fs.stat(path).catch(() => null)
  if (!stat?.isFile()) return new Response(null, { status: 404 })
  const range = byteRange(request.headers.get('range'), stat.size)
  if (!range) return new Response(null, { status: 416, headers: { 'Content-Range': `bytes */${stat.size}` } })
  const body = Readable.toWeb(createReadStream(path, { start: range.start, end: range.end })) as ReadableStream
  const headers: Record<string, string> = {
    'Content-Type': type.mime,
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

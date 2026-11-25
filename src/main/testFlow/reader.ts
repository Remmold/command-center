import { promises as fs } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { TEST_FLOW_SCHEME, type TestFlowView } from '../../shared/testFlow'

const NOT_FOUND: TestFlowView = { found: false }
/** Larger markdown is not a test flow; reading it would only stall the tab. */
const MAX_MARKDOWN_BYTES = 4 * 1024 * 1024

// No network, no plugins, no forms; the page keeps its own inline style and click-to-copy script.
const PAGE_POLICY = [
  "default-src 'none'",
  "style-src 'unsafe-inline'",
  "script-src 'unsafe-inline'",
  'img-src data:',
  'font-src data:',
  "base-uri 'none'",
  "form-action 'none'"
].join('; ')

const sameDir = (a: string, b: string): boolean => resolve(a).toLowerCase() === resolve(b).toLowerCase()

/** The file, when it is a regular file directly in the folder and stays there once links are followed. */
async function fileInFolder(folder: string, path: string): Promise<{ path: string; mtimeMs: number; size: number } | null> {
  if (!isAbsolute(path) || !isAbsolute(folder) || !sameDir(dirname(resolve(path)), folder)) return null
  try {
    const [real, realFolder] = await Promise.all([fs.realpath(path), fs.realpath(folder)])
    if (!sameDir(dirname(real), realFolder)) return null
    const stat = await fs.stat(real)
    return stat.isFile() ? { path: real, mtimeMs: stat.mtimeMs, size: stat.size } : null
  } catch {
    return null
  }
}

const pageUrl = (name: string, mtimeMs: number): string => `${TEST_FLOW_SCHEME}://flow/${encodeURIComponent(name)}?v=${Math.floor(mtimeMs)}`

/** What the Test tab shows for a path the finder picked: an `.md` as its `.html` twin when there is one. */
export async function readTestFlow(folder: string, path: string): Promise<TestFlowView> {
  const ext = extname(path).toLowerCase()
  if (ext !== '.md' && ext !== '.html') return NOT_FOUND
  const twinPath = ext === '.md' ? path.slice(0, -ext.length) + '.html' : path
  const page = await fileInFolder(folder, twinPath)
  if (page) return { kind: 'html', name: basename(twinPath), url: pageUrl(basename(twinPath), page.mtimeMs) }
  if (ext !== '.md') return NOT_FOUND
  const doc = await fileInFolder(folder, path)
  if (!doc || doc.size > MAX_MARKDOWN_BYTES) return NOT_FOUND
  const text = await fs.readFile(doc.path, 'utf8').catch(() => null)
  return text === null ? NOT_FOUND : { kind: 'md', name: basename(path), text }
}

/** The scheme's answer: an HTML file directly in the folder by its name, under a policy that keeps it off the network. */
export async function serveTestFlow(folder: string, requestUrl: string): Promise<Response> {
  const url = new URL(requestUrl)
  let name: string
  try {
    name = decodeURIComponent(url.pathname.slice(1))
  } catch {
    return new Response(null, { status: 404 })
  }
  if (url.host !== 'flow' || /[\\/]/.test(name) || extname(name).toLowerCase() !== '.html') return new Response(null, { status: 404 })
  const page = await fileInFolder(folder, join(folder, name))
  if (!page) return new Response(null, { status: 404 })
  const body = await fs.readFile(page.path).catch(() => null)
  if (!body) return new Response(null, { status: 404 })
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': PAGE_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    }
  })
}

import { promises as fs } from 'node:fs'
import { basename, dirname, extname, isAbsolute, join, resolve } from 'node:path'
import { PAGE_SCROLL_MESSAGE } from '../../shared/pageScroll'
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

/**
 * Appended to each page: reports its scroll place to the app and takes one back, so a reload keeps the place. Only
 * messages from the embedding app are taken; the page's origin is opaque, so `*` is the only target that reaches it.
 */
const SCROLL_SCRIPT = `<script>(function () {
  var T = '${PAGE_SCROLL_MESSAGE}';
  addEventListener('scroll', function () { parent.postMessage({ type: T, y: scrollY }, '*'); }, { passive: true });
  addEventListener('message', function (e) {
    if (e.source !== parent || !e.data || e.data.type !== T || typeof e.data.y !== 'number') return;
    scrollTo(0, e.data.y);
  });
})();</script>`

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

/** A file whose change could change what the Test tab shows, with its state when it was read. */
export interface WatchedFile {
  path: string
  stamp: string
}

export interface TestFlowRead {
  view: TestFlowView
  /** The candidates before the one shown, which may yet appear, and the shown one with its twin. */
  watch: WatchedFile[]
}

/** The file's size and change time, or `missing`; equal stamps mean nothing to reload. */
export async function stampOf(path: string): Promise<string> {
  try {
    const stat = await fs.stat(path)
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : 'missing'
  } catch {
    return 'missing'
  }
}

/** One candidate: an `.md` as its `.html` twin when there is one. */
async function readOne(folder: string, path: string, twinPath: string): Promise<TestFlowView> {
  const page = await fileInFolder(folder, twinPath)
  if (page) return { kind: 'html', name: basename(twinPath), url: pageUrl(basename(twinPath), page.mtimeMs) }
  if (twinPath === path) return NOT_FOUND
  const doc = await fileInFolder(folder, path)
  if (!doc || doc.size > MAX_MARKDOWN_BYTES) return NOT_FOUND
  const text = await fs.readFile(doc.path, 'utf8').catch(() => null)
  return text === null ? NOT_FOUND : { kind: 'md', name: basename(path), text }
}

/** What the Test tab shows for the finder's candidates: the first that exists; paths outside the folder are refused. */
export async function readTestFlow(folder: string, paths: readonly string[]): Promise<TestFlowRead> {
  const watch: WatchedFile[] = []
  for (const path of paths) {
    const ext = extname(path).toLowerCase()
    if ((ext !== '.md' && ext !== '.html') || !isAbsolute(path) || !isAbsolute(folder) || !sameDir(dirname(resolve(path)), folder)) continue
    const twinPath = ext === '.md' ? path.slice(0, -ext.length) + '.html' : path
    // Stamped before reading, so a write during the read still counts as a change.
    for (const file of twinPath === path ? [path] : [twinPath, path]) watch.push({ path: file, stamp: await stampOf(file) })
    const view = await readOne(folder, path, twinPath)
    if (view.kind) return { view, watch }
  }
  return { view: NOT_FOUND, watch }
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
  return new Response(Buffer.concat([body, Buffer.from(SCROLL_SCRIPT)]), {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Security-Policy': PAGE_POLICY,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-cache'
    }
  })
}

import { promises as fs } from 'node:fs'
import { basename, extname, isAbsolute, join, relative, resolve, sep } from 'node:path'
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

/** True when `path` sits in the folder itself or one subfolder down (`<repo>/<feature>.md`). */
function inFolder(path: string, folder: string): boolean {
  if (!isAbsolute(path) || !isAbsolute(folder)) return false
  const rel = relative(resolve(folder).toLowerCase(), resolve(path).toLowerCase())
  if (!rel || isAbsolute(rel)) return false
  const parts = rel.split(sep)
  return parts.length <= 2 && !parts.includes('..')
}

/** The file, when it is a regular file in the folder or one subfolder down and stays there once links are followed. */
async function fileInFolder(folder: string, path: string): Promise<{ path: string; mtimeMs: number; size: number } | null> {
  if (!inFolder(path, folder)) return null
  try {
    const [real, realFolder] = await Promise.all([fs.realpath(path), fs.realpath(folder)])
    if (!inFolder(real, realFolder)) return null
    const stat = await fs.stat(real)
    return stat.isFile() ? { path: real, mtimeMs: stat.mtimeMs, size: stat.size } : null
  } catch {
    return null
  }
}

/** The page's address: its path relative to the folder, each segment encoded, so a subfolder stays a path segment. */
function pageUrl(folder: string, path: string, mtimeMs: number): string {
  const segments = relative(resolve(folder), resolve(path)).split(sep).map(encodeURIComponent)
  return `${TEST_FLOW_SCHEME}://flow/${segments.join('/')}?v=${Math.floor(mtimeMs)}`
}

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

/** A name that counts as a test flow in a repo folder: markdown or HTML, never a standing command list. */
const isFeatureFile = (name: string): boolean => /\.(?:md|html)$/i.test(name) && !/-commands\.(?:md|html)$/i.test(name)

/** A folder's test-flow files with their change times, newest first. */
async function featureFiles(dir: string): Promise<{ path: string; mtimeMs: number }[]> {
  const names = await fs.readdir(dir).catch(() => [] as string[])
  const files = await Promise.all(
    names.filter(isFeatureFile).map(async (name) => {
      const stat = await fs.stat(join(dir, name)).catch(() => null)
      return stat?.isFile() ? { path: join(dir, name), mtimeMs: stat.mtimeMs } : null
    })
  )
  return files.filter((f) => f !== null).sort((a, b) => b.mtimeMs - a.mtimeMs)
}

/** A file's size and change time, a folder's test-flow files with theirs, or `missing`; equal stamps mean nothing to reload. */
export async function stampOf(path: string): Promise<string> {
  try {
    const stat = await fs.stat(path)
    if (stat.isDirectory()) return (await featureFiles(path)).map((f) => `${basename(f.path)}@${f.mtimeMs}`).join('|') || 'empty'
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : 'missing'
  } catch {
    return 'missing'
  }
}

/** A repo folder candidate read as its newest feature file: the `.md` when it has one, so its twin resolves as usual. */
async function newestIn(dir: string): Promise<string | null> {
  const newest = (await featureFiles(dir))[0]
  if (!newest) return null
  if (extname(newest.path).toLowerCase() !== '.html') return newest.path
  const markdown = newest.path.slice(0, -'.html'.length) + '.md'
  return (await fileInFolder(dir, markdown)) ? markdown : newest.path
}

/** One candidate: an `.md` as its `.html` twin when there is one. */
async function readOne(folder: string, path: string, twinPath: string): Promise<TestFlowView> {
  const page = await fileInFolder(folder, twinPath)
  if (page) return { kind: 'html', name: basename(twinPath), url: pageUrl(folder, twinPath, page.mtimeMs) }
  if (twinPath === path) return NOT_FOUND
  const doc = await fileInFolder(folder, path)
  if (!doc || doc.size > MAX_MARKDOWN_BYTES) return NOT_FOUND
  const text = await fs.readFile(doc.path, 'utf8').catch(() => null)
  return text === null ? NOT_FOUND : { kind: 'md', name: basename(path), text }
}

/** What the Test tab shows for the finder's candidates: the first that exists; paths outside the folder are refused. */
export async function readTestFlow(folder: string, paths: readonly string[]): Promise<TestFlowRead> {
  const watch: WatchedFile[] = []
  for (const candidate of paths) {
    let path = candidate
    if (/[\\/]$/.test(candidate)) {
      const dir = candidate.replace(/[\\/]+$/, '')
      if (!inFolder(dir, folder) || relative(resolve(folder), resolve(dir)).includes(sep)) continue
      watch.push({ path: dir, stamp: await stampOf(dir) })
      const newest = await newestIn(dir)
      if (!newest) continue
      path = newest
    }
    const ext = extname(path).toLowerCase()
    if ((ext !== '.md' && ext !== '.html') || !inFolder(path, folder)) continue
    const twinPath = ext === '.md' ? path.slice(0, -ext.length) + '.html' : path
    // Stamped before reading, so a write during the read still counts as a change.
    for (const file of twinPath === path ? [path] : [twinPath, path]) watch.push({ path: file, stamp: await stampOf(file) })
    const view = await readOne(folder, path, twinPath)
    if (view.kind) return { view, watch }
  }
  return { view: NOT_FOUND, watch }
}

/** The scheme's answer: an HTML file in the folder or one subfolder down, under a policy that keeps it off the network. */
export async function serveTestFlow(folder: string, requestUrl: string): Promise<Response> {
  const url = new URL(requestUrl)
  let segments: string[]
  try {
    segments = url.pathname.slice(1).split('/').map(decodeURIComponent)
  } catch {
    return new Response(null, { status: 404 })
  }
  const unsafe = segments.some((s) => !s || /[\\/]/.test(s) || s === '.' || s === '..')
  if (url.host !== 'flow' || unsafe || segments.length > 2 || extname(segments[segments.length - 1]).toLowerCase() !== '.html') {
    return new Response(null, { status: 404 })
  }
  const page = await fileInFolder(folder, join(folder, ...segments))
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

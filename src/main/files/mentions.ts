import { spawn } from 'node:child_process'
import { posix } from 'node:path'
import { locateInstalledClaude, where } from '../pty/claude-locator'
import { listProjectFiles } from './lister'
import { createListing, mentionMatches, type MentionListing } from './mentionSearch'
import type { MentionEntry } from '../../shared/types'

// The extension's values: `xur`, `kur` and `Iur` in extension.js.
const RG_TIMEOUT_MS = 10_000
const RG_MAX_BUFFER = 20_000_000
const LISTING_TTL_MS = 5_000

/** VS Code's default `files.exclude` and `search.exclude`, which the extension passes as `--glob !…`. */
const DEFAULT_EXCLUDES = ['**/.git', '**/.svn', '**/.hg', '**/.DS_Store', '**/Thumbs.db', '**/node_modules', '**/bower_components', '**/*.code-search']

interface Ripgrep {
  command: string
  args: string[]
  argv0?: string
}

let ripgrep: Ripgrep | null | undefined

/** `rg` on PATH, else the ripgrep built into the native `claude` binary (run as `argv0: rg`, as the CLI does). */
function locateRipgrep(): Ripgrep | null {
  if (ripgrep !== undefined) return ripgrep
  const exe = process.platform === 'win32' ? 'rg.exe' : 'rg'
  const onPath = where('rg').find((p) => p.toLowerCase().endsWith(exe))
  if (onPath) return (ripgrep = { command: onPath, args: [] })
  try {
    const claude = locateInstalledClaude()
    const native = claude.args.length === 0 && /[\\/]claude(\.exe)?$/i.test(claude.command)
    ripgrep = native ? { command: claude.command, args: ['--no-config'], argv0: 'rg' } : null
  } catch {
    ripgrep = null
  }
  return ripgrep
}

function lines(out: string): string[] {
  return out.trim().split('\n').map((l) => l.replace(/\r$/, '')).filter(Boolean)
}

/**
 * Settles like the extension's `Pur`: exit 1 is an empty list, a timeout or a full buffer keeps the complete lines.
 * `spawn`, not `execFile`: Electron's `execFile` drops `argv0`, which the embedded ripgrep needs.
 */
function runRipgrep(rg: Ripgrep, cwd: string): Promise<string[]> {
  const args = [...rg.args, '--files', '--follow', '--hidden', ...DEFAULT_EXCLUDES.flatMap((g) => ['--glob', `!${g}`])]
  return new Promise((resolve, reject) => {
    const child = spawn(rg.command, args, { cwd, windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'], ...(rg.argv0 ? { argv0: rg.argv0 } : {}) })
    let out = ''
    let cut = false
    const stop = () => {
      cut = true
      child.kill()
    }
    const timer = setTimeout(stop, RG_TIMEOUT_MS)
    child.stdout.setEncoding('utf-8')
    child.stdout.on('data', (chunk: string) => {
      out += chunk
      if (out.length > RG_MAX_BUFFER) stop()
    })
    child.on('error', (err) => {
      clearTimeout(timer)
      reject(err)
    })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (cut) return out.trim() ? resolve(lines(out).slice(0, -1)) : reject(new Error('ripgrep timed out'))
      if (code === 0 || (code === 2 && out.trim())) return resolve(lines(out))
      if (code === 1) return resolve([])
      reject(new Error(`ripgrep exited with ${code}`))
    })
  })
}

async function listFiles(cwd: string): Promise<string[]> {
  const rg = locateRipgrep()
  if (rg) {
    try {
      return (await runRipgrep(rg, cwd)).map((p) => p.replaceAll('\\', '/'))
    } catch (err) {
      console.warn('[mentions] ripgrep failed, using the built-in lister', err)
    }
  }
  return listProjectFiles(cwd)
}

const listings = new Map<string, Promise<MentionListing>>()

function listing(cwd: string): Promise<MentionListing> {
  const cached = listings.get(cwd)
  if (cached) return cached
  const next = listFiles(cwd).then(createListing)
  listings.set(cwd, next)
  void next
    .catch(() => undefined)
    .then(() => setTimeout(() => listings.get(cwd) === next && listings.delete(cwd), LISTING_TTL_MS).unref())
  return next
}

/** The @ menu's rows for the text typed after `@`. */
export async function findMentions(cwd: string, query: string): Promise<MentionEntry[]> {
  const paths = mentionMatches(await listing(cwd), query)
  return paths.map((path) => {
    const directory = path.endsWith('/')
    return { path, name: posix.basename(path), type: directory ? 'directory' : 'file' }
  })
}

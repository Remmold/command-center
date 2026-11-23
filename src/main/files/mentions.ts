import { posix } from 'node:path'
import { listProjectFiles } from './lister'
import { locateRipgrep, runRipgrep } from './ripgrep'
import { createListing, mentionMatches, type MentionListing } from './mentionSearch'
import type { MentionEntry } from '../../shared/types'

// The extension's values: `xur`, `kur` and `Iur` in extension.js.
const RG_TIMEOUT_MS = 10_000
const RG_MAX_BUFFER = 20_000_000
const LISTING_TTL_MS = 5_000

/** VS Code's default `files.exclude` and `search.exclude`, which the extension passes as `--glob !…`. */
const DEFAULT_EXCLUDES = ['**/.git', '**/.svn', '**/.hg', '**/.DS_Store', '**/Thumbs.db', '**/node_modules', '**/bower_components', '**/*.code-search']

async function listFiles(cwd: string): Promise<string[]> {
  const rg = locateRipgrep()
  if (rg) {
    try {
      const args = ['--files', '--follow', '--hidden', ...DEFAULT_EXCLUDES.flatMap((g) => ['--glob', `!${g}`])]
      return (await runRipgrep(rg, cwd, args, { timeoutMs: RG_TIMEOUT_MS, maxBuffer: RG_MAX_BUFFER })).map((p) => p.replaceAll('\\', '/'))
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

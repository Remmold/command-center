import { promises as fs } from 'node:fs'
import { dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { samePath } from '../profiles/linker'
import { listUnignoredFiles } from '../git/service'
import {
  ADOPTED_READ_ONLY,
  estimateTokens,
  type ContextItem,
  type ContextItemKind,
  type ContextReport,
  type ContextSource,
  type CreatableContextFile
} from '../../shared/context'

export interface ContextReaderInput {
  workspacePath: string
  /** The workspace's account profile folder. */
  configDir: string
  defaultConfigDir: string
  /** Every adopted profile's folder. */
  adoptedDirs: readonly string[]
  /** For `@~/` imports. */
  homeDir: string
  /** The last folder searched for parent CLAUDE.md files; the drive root when unset. */
  parentsStopAt?: string
}

/** Claude follows imports this many steps from a CLAUDE.md. */
const IMPORT_DEPTH = 5
const SKIPPED_FOLDERS = new Set(['node_modules', '.git'])
/** For a workspace outside git, which is walked instead. */
const WALK_DEPTH = 8
const WALK_ENTRIES = 20_000

interface Reading {
  input: ContextReaderInput
  /** Files already in the report, so an import cycle or a repeat isn't followed again. */
  seen: Set<string>
}

async function readText(path: string): Promise<string | null> {
  try {
    return await fs.readFile(path, 'utf-8')
  } catch {
    return null
  }
}

async function isDir(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isDirectory()
  } catch {
    return false
  }
}

const fileKey = (path: string): string => (process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path))

/** The path below `dir`, or null when it isn't inside it. */
function inside(dir: string, path: string): string | null {
  const rel = relative(fileKey(dir), fileKey(path))
  return rel && !rel.startsWith('..') && !isAbsolute(rel) ? relative(dir, path) : null
}

/** True when the item, found in a non-default profile's folder, is through the profile links the default profile's own file. */
async function sharedWithDefault(input: ContextReaderInput, path: string): Promise<boolean> {
  if (samePath(input.configDir, input.defaultConfigDir)) return false
  const rel = inside(input.configDir, path)
  if (rel === null) return false
  try {
    const [here, there] = await Promise.all([fs.stat(path, { bigint: true }), fs.stat(join(input.defaultConfigDir, rel), { bigint: true })])
    return here.ino === there.ino && here.dev === there.dev
  } catch {
    return false
  }
}

function readOnlyReason(input: ContextReaderInput, path: string): string | null {
  return input.adoptedDirs.some((dir) => inside(dir, path) !== null) ? ADOPTED_READ_ONLY : null
}

async function item(r: Reading, kind: ContextItemKind, label: string, path: string, source: ContextSource, tokens: number | null): Promise<ContextItem> {
  return {
    kind,
    label,
    path,
    source,
    tokens,
    missing: false,
    sharedWithDefault: await sharedWithDefault(r.input, path),
    readOnly: readOnlyReason(r.input, path),
    children: []
  }
}

/** `@path` references outside code blocks and code spans, each preceded by a space or a line start. */
export function importReferences(text: string): string[] {
  const prose: string[] = []
  let fence: string | null = null
  for (const line of text.split(/\r?\n/)) {
    const marker = /^\s*(```|~~~)/.exec(line)?.[1]
    if (marker && (fence === null || fence === marker)) fence = fence === null ? marker : null
    else if (fence === null) prose.push(line.replace(/`[^`]*`/g, ''))
  }
  return [...prose.join('\n').matchAll(/(?:^|\s)@(\S+)/g)].map((m) => m[1].replace(/[.,;:!?)\]]+$/, '')).filter(Boolean)
}

function importTarget(r: Reading, importer: string, ref: string): string {
  if (ref === '~' || /^~[\\/]/.test(ref)) return join(r.input.homeDir, ref.slice(1))
  return isAbsolute(ref) ? ref : resolve(dirname(importer), ref)
}

async function imports(r: Reading, importer: string, text: string, source: ContextSource, depth: number): Promise<ContextItem[]> {
  if (depth >= IMPORT_DEPTH) return []
  const out: ContextItem[] = []
  for (const ref of importReferences(text)) {
    const path = importTarget(r, importer, ref)
    if (r.seen.has(fileKey(path))) continue
    const found = await claudeMd(r, path, `@${ref}`, source, 'import', depth + 1)
    if (!found) r.seen.add(fileKey(path))
    out.push(found ?? { ...(await item(r, 'import', `@${ref}`, path, source, 0)), missing: true })
  }
  return out
}

/** A CLAUDE.md-family file with its imports; null when it isn't there or is already in the report. */
async function claudeMd(r: Reading, path: string, label: string, source: ContextSource, kind: ContextItemKind = 'claude-md', depth = 0): Promise<ContextItem | null> {
  if (r.seen.has(fileKey(path))) return null
  const text = await readText(path)
  if (text === null) return null
  r.seen.add(fileKey(path))
  return { ...(await item(r, kind, label, path, source, estimateTokens(text))), children: await imports(r, path, text, source, depth) }
}

/** The workspace folder's parent up to the drive root (or `stopAt`), outermost first. */
function parentFolders(workspacePath: string, stopAt: string | undefined): string[] {
  const out: string[] = []
  for (let dir = dirname(workspacePath); ; dir = dirname(dir)) {
    out.unshift(dir)
    if ((stopAt && samePath(dir, stopAt)) || dirname(dir) === dir) return out
  }
}

async function walkForClaudeMd(root: string): Promise<string[]> {
  const out: string[] = []
  const pending: { dir: string; depth: number }[] = [{ dir: '', depth: 0 }]
  let entries = 0
  while (pending.length && entries < WALK_ENTRIES) {
    const { dir, depth } = pending.shift()!
    for (const entry of await fs.readdir(join(root, dir), { withFileTypes: true }).catch(() => [])) {
      entries++
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      if (entry.isDirectory() && depth < WALK_DEPTH && !SKIPPED_FOLDERS.has(entry.name)) pending.push({ dir: rel, depth: depth + 1 })
      else if (entry.isFile() && entry.name === 'CLAUDE.md' && dir) out.push(rel)
    }
  }
  return out
}

/** CLAUDE.md files below the workspace folder (not its own), skipping node_modules, .git and what .gitignore hides. */
async function subfolderClaudeMds(root: string): Promise<string[]> {
  const listed = await listUnignoredFiles(root, ':(glob)**/CLAUDE.md')
  const candidates = listed ?? (await walkForClaudeMd(root))
  const below = candidates.filter((rel) => {
    const parts = rel.split('/')
    return parts.length > 1 && parts[parts.length - 1] === 'CLAUDE.md' && !parts.some((p) => SKIPPED_FOLDERS.has(p))
  })
  const present = await Promise.all(below.map(async (rel) => ((await readText(join(root, rel))) !== null ? rel : null)))
  return present.filter((rel): rel is string => rel !== null).sort()
}

function counted(items: readonly ContextItem[]): number {
  return items.reduce((sum, i) => sum + (i.tokens ?? 0) + counted(i.children), 0)
}

const found = (items: (ContextItem | null)[]): ContextItem[] => items.filter((i): i is ContextItem => i !== null)

/** Everything Claude is configured to load in a workspace, read from disk; never asks Claude. */
export async function readContext(input: ContextReaderInput): Promise<ContextReport> {
  const empty: ContextReport = { workspacePath: input.workspacePath, folderExists: false, layers: { account: [], repo: [], local: [] }, startTotal: 0, missing: [] }
  if (!(await isDir(input.workspacePath))) return empty
  const r: Reading = { input, seen: new Set() }
  const root = input.workspacePath
  const accountMd = await claudeMd(r, join(input.configDir, 'CLAUDE.md'), 'CLAUDE.md', 'account')
  const parents: (ContextItem | null)[] = []
  for (const dir of parentFolders(root, input.parentsStopAt)) parents.push(await claudeMd(r, join(dir, 'CLAUDE.md'), join(dir, 'CLAUDE.md'), 'repo'))
  const repoMd = await claudeMd(r, join(root, 'CLAUDE.md'), 'CLAUDE.md', 'repo')
  const localMd = await claudeMd(r, join(root, 'CLAUDE.local.md'), 'CLAUDE.local.md', 'repo')
  const subfolders = await Promise.all((await subfolderClaudeMds(root)).map((rel) => item(r, 'subfolder-claude-md', rel, join(root, rel), 'repo', null)))
  const layers = {
    account: found([accountMd]),
    repo: [...found([...parents, repoMd]), ...subfolders],
    local: found([localMd])
  }
  const absent = async (name: string): Promise<boolean> => (await readText(join(root, name))) === null
  const missing: CreatableContextFile[] = [
    ...((await absent('CLAUDE.md')) ? ['repo-claude-md' as const] : []),
    ...((await absent('CLAUDE.local.md')) ? ['claude-local-md' as const] : [])
  ]
  return { ...empty, folderExists: true, layers, startTotal: counted([...layers.account, ...layers.repo, ...layers.local]), missing }
}

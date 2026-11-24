import { promises as fs } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path'
import { samePath } from '../profiles/linker'
import { listUnignoredFiles } from '../git/service'
import { transcriptsDir } from '../profiles/transcripts'
import {
  ADOPTED_READ_ONLY,
  estimateTokens,
  type ContextItem,
  type ContextItemKind,
  type ContextLayerName,
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
  /** Skill, agent and command files already listed, kept apart so an @-imported one is still listed as a skill. */
  listed: Set<string>
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

async function fileNames(dir: string): Promise<string[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  return entries.filter((e) => e.isFile()).map((e) => e.name).sort()
}

/** The workspace's memory folder in the profile: MEMORY.md counts at start, the other files are listed. */
async function memory(r: Reading): Promise<ContextItem[]> {
  const dir = join(transcriptsDir(r.input.configDir, r.input.workspacePath), 'memory')
  const out: ContextItem[] = []
  for (const name of await fileNames(dir)) {
    const path = join(dir, name)
    if (name === 'MEMORY.md') out.unshift(await item(r, 'memory-index', name, path, 'account', estimateTokens((await readText(path)) ?? '')))
    else out.push(await item(r, 'memory-file', name, path, 'account', null))
  }
  return out
}

function unquote(value: string): string {
  if (/^".*"$/s.test(value)) {
    try {
      return JSON.parse(value) as string
    } catch {
      return value.slice(1, -1)
    }
  }
  return /^'.*'$/s.test(value) ? value.slice(1, -1).replace(/''/g, "'") : value
}

/** The top-level keys of a file's YAML frontmatter: plain, quoted, folded (`>`) and literal (`|`) values. */
export function frontmatter(text: string): Record<string, string> {
  const lines = text.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return {}
  const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
  const body = lines.slice(1, end === -1 ? lines.length : end)
  const out: Record<string, string> = {}
  for (let i = 0; i < body.length; i++) {
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(body[i])
    if (!m) continue
    const more: string[] = []
    while (i + 1 < body.length && (/^\s/.test(body[i + 1]) || body[i + 1] === '')) more.push(body[++i].trim())
    while (more.length && more[more.length - 1] === '') more.pop()
    const value = m[2].trim()
    if (/^[>|][+-]?$/.test(value)) out[m[1]] = more.join(value.startsWith('|') ? '\n' : ' ')
    else out[m[1]] = unquote([value, ...more].filter(Boolean).join(' '))
  }
  return out
}

/** Every `.md` file below `dir`, as paths relative to it, sorted. */
async function markdownFiles(dir: string, rel = ''): Promise<string[]> {
  const out: string[] = []
  for (const entry of await fs.readdir(join(dir, rel), { withFileTypes: true }).catch(() => [])) {
    const sub = rel ? join(rel, entry.name) : entry.name
    if (entry.isDirectory()) out.push(...(await markdownFiles(dir, sub)))
    else if (entry.isFile() && entry.name.endsWith('.md')) out.push(sub)
  }
  return out.sort()
}

/** Skills and agents add their frontmatter name and description to the start; the body is not counted. */
/** The file's text the first time it is listed; null when it isn't there or is listed already. */
async function unlisted(r: Reading, path: string): Promise<string | null> {
  if (r.listed.has(fileKey(path))) return null
  const text = await readText(path)
  if (text !== null) r.listed.add(fileKey(path))
  return text
}

async function described(r: Reading, kind: 'skill' | 'agent', path: string, fallbackName: string, source: ContextSource): Promise<ContextItem | null> {
  const text = await unlisted(r, path)
  if (text === null) return null
  const meta = frontmatter(text)
  const name = meta.name || fallbackName
  return item(r, kind, name, path, source, estimateTokens(name + (meta.description ?? '')))
}

/** A folder of skill folders, each with its SKILL.md. */
async function skillsIn(r: Reading, dir: string, source: ContextSource): Promise<ContextItem[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
  const folders = entries.filter((e) => e.isDirectory()).map((e) => e.name)
  return found(await Promise.all(folders.map((name) => described(r, 'skill', join(dir, name, 'SKILL.md'), name, source))))
}

async function agentsIn(r: Reading, dir: string, source: ContextSource): Promise<ContextItem[]> {
  const files = await markdownFiles(dir)
  return found(await Promise.all(files.map((rel) => described(r, 'agent', join(dir, rel), basename(rel, '.md'), source))))
}

/** Commands are listed, not counted; one in a subfolder is named `folder:name`. */
async function commandsIn(r: Reading, dir: string, source: ContextSource): Promise<ContextItem[]> {
  const files: string[] = []
  for (const rel of await markdownFiles(dir)) if ((await unlisted(r, join(dir, rel))) !== null) files.push(rel)
  return Promise.all(files.map((rel) => item(r, 'command', rel.slice(0, -3).split(/[\\/]/).join(':'), join(dir, rel), source, null)))
}

const byLabel = (items: ContextItem[]): ContextItem[] => [...items].sort((a, b) => a.label.localeCompare(b.label))

/** The skills, agents and commands a `.claude`-shaped folder holds. */
async function toolkit(r: Reading, dir: string, source: ContextSource): Promise<ContextItem[]> {
  return [
    ...byLabel(await skillsIn(r, join(dir, 'skills'), source)),
    ...byLabel(await agentsIn(r, join(dir, 'agents'), source)),
    ...byLabel(await commandsIn(r, join(dir, 'commands'), source))
  ]
}

async function readJson(path: string): Promise<unknown> {
  const text = await readText(path)
  if (text === null) return null
  try {
    return JSON.parse(text) as unknown
  } catch {
    return null
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)

const strings = (value: unknown): string[] => (typeof value === 'string' ? [value] : Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : [])

/** The `enabledPlugins` of a settings file: plugin key (`name@marketplace`) to on or off. */
async function enabledPlugins(settingsPath: string): Promise<[string, boolean][]> {
  const settings = await readJson(settingsPath)
  const map = isRecord(settings) ? settings.enabledPlugins : null
  return isRecord(map) ? Object.entries(map).filter((e): e is [string, boolean] => typeof e[1] === 'boolean') : []
}

/** A plugin key is `name@marketplace`. */
function pluginKey(key: string): { name: string; marketplace: string } {
  const at = key.lastIndexOf('@')
  return at > 0 ? { name: key.slice(0, at), marketplace: key.slice(at + 1) } : { name: key, marketplace: '' }
}

/** The installed plugin's folder: the version installed_plugins.json records, looked up in this profile's cache first. */
async function pluginDir(r: Reading, key: string): Promise<string | null> {
  const { name, marketplace } = pluginKey(key)
  const cache = join(r.input.configDir, 'plugins', 'cache', marketplace, name)
  const registry = await readJson(join(r.input.configDir, 'plugins', 'installed_plugins.json'))
  const entries = isRecord(registry) && isRecord(registry.plugins) && Array.isArray(registry.plugins[key]) ? (registry.plugins[key] as unknown[]).filter(isRecord) : []
  const entry =
    entries.find((e) => typeof e.projectPath === 'string' && samePath(e.projectPath, r.input.workspacePath)) ??
    entries.find((e) => e.scope === 'user') ??
    entries[0]
  const candidates = entry ? [typeof entry.version === 'string' ? join(cache, entry.version) : null, typeof entry.installPath === 'string' ? entry.installPath : null] : []
  for (const dir of candidates) if (dir && (await isDir(dir))) return dir
  if (entry || !marketplace) return null
  const versions = (await fs.readdir(cache, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).map((e) => e.name)
  return versions.length ? join(cache, versions.sort((a, b) => a.localeCompare(b, undefined, { numeric: true })).at(-1)!) : null
}

/** A plugin's skills, agents and commands: its default folders plus the folders or files its manifest adds. */
async function pluginToolkit(r: Reading, dir: string, manifest: Record<string, unknown>, source: ContextSource): Promise<ContextItem[]> {
  const paths = (field: string): string[] => strings(manifest[field]).map((rel) => resolve(dir, rel))
  const skills = await skillsIn(r, join(dir, 'skills'), source)
  for (const path of paths('skills')) {
    const own = await described(r, 'skill', join(path, 'SKILL.md'), basename(path), source)
    skills.push(...(own ? [own] : await skillsIn(r, path, source)))
  }
  const agents = await agentsIn(r, join(dir, 'agents'), source)
  for (const path of paths('agents')) agents.push(...(path.endsWith('.md') ? found([await described(r, 'agent', path, basename(path, '.md'), source)]) : await agentsIn(r, path, source)))
  const commands = await commandsIn(r, join(dir, 'commands'), source)
  for (const path of paths('commands')) {
    if (!path.endsWith('.md')) commands.push(...(await commandsIn(r, path, source)))
    else if ((await unlisted(r, path)) !== null) commands.push(await item(r, 'command', basename(path, '.md'), path, source, null))
  }
  return [...byLabel(skills), ...byLabel(agents), ...byLabel(commands)]
}

/**
 * Each layer's enabled plugins. One a later layer turns off is left out; one enabled in several layers
 * is listed in each, with its contents under the first.
 */
async function plugins(r: Reading, settingsFiles: Record<ContextLayerName, string>): Promise<Record<ContextLayerName, ContextItem[]>> {
  const order: ContextLayerName[] = ['account', 'repo', 'local']
  const perLayer = await Promise.all(order.map((layer) => enabledPlugins(settingsFiles[layer])))
  const effective = new Map(perLayer.flat())
  const out: Record<ContextLayerName, ContextItem[]> = { account: [], repo: [], local: [] }
  const listed = new Set<string>()
  for (const [n, layer] of order.entries()) {
    const source: ContextSource = layer === 'account' ? 'account' : 'repo'
    for (const [key, on] of perLayer[n]) {
      if (!on || !effective.get(key)) continue
      const dir = await pluginDir(r, key)
      const manifestPath = dir ? join(dir, '.claude-plugin', 'plugin.json') : null
      const manifest = manifestPath ? await readJson(manifestPath) : null
      const base: ContextItem =
        manifestPath && isRecord(manifest)
          ? await item(r, 'plugin', key, manifestPath, source, null)
          : { ...(await item(r, 'plugin', key, dir ?? join(r.input.configDir, 'plugins'), source, null)), path: null }
      if (!dir) {
        out[layer].push({ ...base, missing: true })
        continue
      }
      const name = isRecord(manifest) && typeof manifest.name === 'string' ? manifest.name : pluginKey(key).name
      const children = listed.has(key) ? [] : await pluginToolkit(r, dir, isRecord(manifest) ? manifest : {}, `plugin:${name}`)
      listed.add(key)
      out[layer].push({ ...base, children })
    }
  }
  return out
}

function counted(items: readonly ContextItem[]): number {
  return items.reduce((sum, i) => sum + (i.tokens ?? 0) + counted(i.children), 0)
}

const found = (items: (ContextItem | null)[]): ContextItem[] => items.filter((i): i is ContextItem => i !== null)

/** Everything Claude is configured to load in a workspace, read from disk; never asks Claude. */
export async function readContext(input: ContextReaderInput): Promise<ContextReport> {
  const empty: ContextReport = { workspacePath: input.workspacePath, folderExists: false, layers: { account: [], repo: [], local: [] }, startTotal: 0, missing: [] }
  if (!(await isDir(input.workspacePath))) return empty
  const r: Reading = { input, seen: new Set(), listed: new Set() }
  const root = input.workspacePath
  const accountMd = await claudeMd(r, join(input.configDir, 'CLAUDE.md'), 'CLAUDE.md', 'account')
  const parents: (ContextItem | null)[] = []
  for (const dir of parentFolders(root, input.parentsStopAt)) parents.push(await claudeMd(r, join(dir, 'CLAUDE.md'), join(dir, 'CLAUDE.md'), 'repo'))
  const repoMd = await claudeMd(r, join(root, 'CLAUDE.md'), 'CLAUDE.md', 'repo')
  const localMd = await claudeMd(r, join(root, 'CLAUDE.local.md'), 'CLAUDE.local.md', 'repo')
  const subfolders = await Promise.all((await subfolderClaudeMds(root)).map((rel) => item(r, 'subfolder-claude-md', rel, join(root, rel), 'repo', null)))
  const accountKit = await toolkit(r, input.configDir, 'account')
  const repoKit = await toolkit(r, join(root, '.claude'), 'repo')
  const enabled = await plugins(r, {
    account: join(input.configDir, 'settings.json'),
    repo: join(root, '.claude', 'settings.json'),
    local: join(root, '.claude', 'settings.local.json')
  })
  const layers = {
    account: [...found([accountMd]), ...(await memory(r)), ...accountKit, ...enabled.account],
    repo: [...found([...parents, repoMd]), ...repoKit, ...enabled.repo, ...subfolders],
    local: [...found([localMd]), ...enabled.local]
  }
  const absent = async (name: string): Promise<boolean> => (await readText(join(root, name))) === null
  const missing: CreatableContextFile[] = [
    ...((await absent('CLAUDE.md')) ? ['repo-claude-md' as const] : []),
    ...((await absent('CLAUDE.local.md')) ? ['claude-local-md' as const] : [])
  ]
  return { ...empty, folderExists: true, layers, startTotal: counted([...layers.account, ...layers.repo, ...layers.local]), missing }
}

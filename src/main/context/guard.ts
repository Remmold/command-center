import { promises as fs } from 'node:fs'
import { basename, extname, join, resolve } from 'node:path'
import { CREATABLE_NAMES, type ContextFileResult, type ContextFileText, type ContextItem, type ContextReport } from '../../shared/context'

/** They hold the sign-in and secrets, so the guard refuses them whatever a report lists. */
const SECRET_NAMES = new Set(['.claude.json', '.credentials.json'])

const MAX_BYTES = 5 * 1024 * 1024

const key = (path: string): string => resolve(path).toLowerCase()

function listedItems(items: ContextItem[], out = new Map<string, ContextItem>()): Map<string, ContextItem> {
  for (const item of items) {
    const known = item.path ? out.get(key(item.path)) : undefined
    if (item.path && !known?.readOnly) out.set(key(item.path), item)
    listedItems(item.children, out)
  }
  return out
}

type Access = { ok: true; readOnly: string | null; creatable: boolean } | { ok: false; error: string }

const SECRET_REFUSAL = { ok: false, error: 'that file holds the sign-in; Context never opens it' } as const

const isSecret = (path: string): boolean => SECRET_NAMES.has(basename(path).toLowerCase())

/** A listed path can be a link; the secrets stay refused wherever it points. */
async function pointsAtSecret(path: string): Promise<boolean> {
  try {
    return isSecret(await fs.realpath(path))
  } catch {
    return false
  }
}

async function access(report: ContextReport | null, path: string): Promise<Access> {
  if (!report) return { ok: false, error: 'Context has not read this workspace yet' }
  if (isSecret(path) || (await pointsAtSecret(path))) return SECRET_REFUSAL
  const target = key(path)
  if (report.missing.some((file) => key(join(report.workspacePath, CREATABLE_NAMES[file])) === target)) return { ok: true, readOnly: null, creatable: true }
  const { account, repo, local } = report.layers
  const item = listedItems([...account, ...repo, ...local]).get(target)
  if (!item) return { ok: false, error: 'not a file Context listed' }
  // Only the two creatable files may be made; a missing import or hook script stays missing.
  if (item.missing) return { ok: false, error: 'the file is not there, and Context only creates CLAUDE.md and CLAUDE.local.md' }
  return { ok: true, readOnly: item.readOnly, creatable: false }
}

/** Reads a file the workspace's latest report listed; a missing creatable file reads as empty. */
export async function readContextFile(report: ContextReport | null, path: string): Promise<ContextFileText> {
  const allowed = await access(report, path)
  if (!allowed.ok) return allowed
  try {
    const stat = await fs.stat(path)
    if (!stat.isFile()) return { ok: false, error: 'not a file' }
    if (stat.size > MAX_BYTES) return { ok: false, error: 'file too large (over 5 MB)' }
    return { ok: true, content: await fs.readFile(path, 'utf8') }
  } catch (err) {
    if (allowed.creatable && (err as NodeJS.ErrnoException).code === 'ENOENT') return { ok: true, content: '' }
    return { ok: false, error: (err as Error).message }
  }
}

/**
 * Writes a file the workspace's latest report listed and didn't mark read-only, or one of the
 * creatable files it marked missing. A `.json` file must parse first. It never runs anything.
 */
export async function writeContextFile(report: ContextReport | null, path: string, content: string): Promise<ContextFileResult> {
  const allowed = await access(report, path)
  if (!allowed.ok) return allowed
  if (allowed.readOnly) return { ok: false, error: allowed.readOnly }
  if (extname(path).toLowerCase() === '.json') {
    try {
      JSON.parse(content)
    } catch (err) {
      return { ok: false, error: `Invalid JSON: ${(err as Error).message}` }
    }
  }
  try {
    // A creatable file that appeared since the report is never overwritten blind.
    await fs.writeFile(path, content, { encoding: 'utf8', flag: allowed.creatable ? 'wx' : 'w' })
    return { ok: true }
  } catch (err) {
    if (allowed.creatable && (err as NodeJS.ErrnoException).code === 'EEXIST') return { ok: false, error: 'the file was created elsewhere since Context read it; open it again' }
    return { ok: false, error: (err as Error).message }
  }
}

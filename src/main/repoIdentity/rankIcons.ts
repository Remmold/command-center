import { posix } from 'node:path'
import type { FoundIconSource } from '../../shared/repoIdentity'

export interface IconCandidate {
  /** Relative to the repo root, with forward slashes. */
  path: string
  source: FoundIconSource
  /** From the PNG header; absent for other formats. */
  width?: number
  height?: number
  /** exe only: true when Windows shows its generic program icon for it. */
  genericExeIcon?: boolean
}

export type IconTheme = 'dark' | 'light'

const ICON_EXT = String.raw`\.(png|svg|ico)$`

/** Best name first; the index is the name's rank. */
const NAME_PATTERNS: readonly RegExp[] = [
  new RegExp(`(^|/)app-icon[^/]*${ICON_EXT}`),
  new RegExp(`(^|/)apple-touch-icon[^/]*${ICON_EXT}`),
  new RegExp(`(^|/)icon${ICON_EXT}|(^|/)resources/icon[^/]*${ICON_EXT}`),
  /(^|\/)logo\.(png|svg)$/,
  /(^|\/)favicon\.(svg|png|ico)$/,
  new RegExp(`(^|/)mstile[^/]*${ICON_EXT}`)
]

const SOURCE_ORDER: Record<FoundIconSource, number> = { file: 0, unity: 1, godot: 2, exe: 3 }

const MIN_SHARP_PX = 128

function nameRank(path: string): number {
  const lower = path.toLowerCase()
  const rank = NAME_PATTERNS.findIndex((p) => p.test(lower))
  return rank === -1 ? NAME_PATTERNS.length : rank
}

export function looksLikeIconFile(path: string): boolean {
  return nameRank(path) < NAME_PATTERNS.length
}

function quality(c: IconCandidate): number {
  const ext = posix.extname(c.path).toLowerCase()
  if (ext === '.svg') return 1
  if (ext === '.ico') return 2
  const { width, height } = c
  return width !== undefined && width === height && width >= MIN_SHARP_PX ? 0 : 3
}

const WORKSPACE_PACKAGE = /^(apps|packages)\/([^/]+)\//

/** The root first, then each monorepo app or package by name. */
function location(path: string): [number, string] {
  const m = WORKSPACE_PACKAGE.exec(path)
  return m ? [1, `${m[1]}/${m[2]}`] : [0, '']
}

function variant(path: string, theme: IconTheme): number {
  const has = (word: IconTheme): boolean => new RegExp(`(^|[-_./])${word}([-_./]|$)`, 'i').test(path)
  const opposite: IconTheme = theme === 'dark' ? 'light' : 'dark'
  if (has(theme)) return 0
  return has(opposite) ? 2 : 1
}

function sortKey(c: IconCandidate, theme: IconTheme): (number | string)[] {
  return [
    SOURCE_ORDER[c.source],
    ...location(c.path),
    quality(c),
    variant(c.path, theme),
    nameRank(c.path),
    -(c.width ?? 0),
    c.path.split('/').length,
    c.path
  ]
}

function compare(a: (number | string)[], b: (number | string)[]): number {
  for (let i = 0; i < a.length; i++) {
    if (a[i] === b[i]) continue
    return typeof a[i] === 'number' ? (a[i] as number) - (b[i] as number) : String(a[i]).localeCompare(String(b[i]))
  }
  return 0
}

/** Best first. Files not named like an app icon and executables with the generic icon are dropped. */
export function rankIconCandidates(candidates: readonly IconCandidate[], theme: IconTheme): IconCandidate[] {
  return candidates
    .filter((c) => (c.source === 'file' ? looksLikeIconFile(c.path) : !c.genericExeIcon))
    .map((c) => ({ c, key: sortKey(c, theme) }))
    .sort((a, b) => compare(a.key, b.key))
    .map(({ c }) => c)
}
